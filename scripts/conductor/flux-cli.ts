// dg conductor flux <agent> | --all [--dry-run]: the manual entry to the flux job module (DGS-435).
// There is no clock rule and no force flag (DGS-664): the idle checks in the module are the gate. A dry run sends nothing, ever.
import { parseArgs } from "node:util";
import * as os from "node:os";
import * as path from "node:path";
import { allTargets, fluxAll, fluxConductor, type FluxDeps, type FluxHerdr, type FluxResult, type FluxTarget } from "./flux.ts";
import { createFluxHerdr, fluxRunner } from "./flux-herdr.ts";
import { execRunner } from "./runner.ts";
import { loadTargets, resolveTarget } from "./flux-targets.ts";

export const FLUX_USAGE = `Usage: cli.ts flux <agent> | --all  [--dry-run] [--log] [--json]
         [--project P] [--brief path] [--note path] [--wake text]
A conductor fluxes when it is idle or done, has no live worker tab and no open ticket of its own; every check runs. --dry-run runs every check and sends nothing.
Targets come from ~/.digismith-depot/flux-targets.json; the flags replace it for one named agent.
`;

const OPTIONS = {
  all: { type: "boolean" },
  "dry-run": { type: "boolean" },
  log: { type: "boolean" },
  json: { type: "boolean" },
  project: { type: "string" },
  brief: { type: "string" },
  note: { type: "string" },
  wake: { type: "string" },
} as const;

export interface FluxCliIo {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  now: () => Date;
  env: NodeJS.ProcessEnv;
  repoRoot: string;
  transcriptDir: string;
  /** Builds the herdr; the dry-run flag decides whether prompt can exist at all. */
  makeHerdr?: (o: { dryRun: boolean; session?: string }) => FluxHerdr;
  flux?: typeof fluxConductor;
  sleep?: (ms: number) => Promise<void>;
}

/** Claude Code's project folder for a cwd: every non-alphanumeric character becomes a dash. */
export function transcriptDirFor(repoRoot: string, home = os.homedir()): string {
  return path.join(home, ".claude", "projects", repoRoot.replace(/[^A-Za-z0-9]/g, "-"));
}

const line = (r: FluxResult): string => {
  const sizes = r.tokens_before != null ? ` ${r.tokens_before}${r.tokens_after != null ? ` -> ${r.tokens_after}` : ""} tokens` : "";
  const head = r.result === "fluxed" ? `${r.agent}: fluxed${sizes} (${r.session_old} -> ${r.session_new})` : `${r.agent}: ${r.result} (${r.reason})${sizes}`;
  return `${head}${r.needs_attention ? "  NEEDS ATTENTION" : ""}\n`;
};

export async function fluxMain(argv: string[], io: FluxCliIo): Promise<number> {
  let v: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  try {
    v = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    io.stderr(`${(e as Error).message}\n${FLUX_USAGE}`);
    return 1;
  }
  const o = v.values;
  const [agent, ...extra] = v.positionals;
  if (extra.length || (!agent && !o.all) || (agent && o.all)) {
    io.stderr(FLUX_USAGE);
    return 1;
  }
  if (o.all && (o.project || o.brief || o.note || o.wake)) {
    io.stderr(`--project, --brief, --note and --wake name one agent; they do not go with --all\n${FLUX_USAGE}`);
    return 1;
  }
  const dryRun = !!o["dry-run"];
  if (!io.env.HERDR_WS && !io.env.HERDR_SCOPE) {
    io.stderr("flux needs HERDR_SCOPE (for example HERDR_SCOPE=Castle:w7,default:w2) or HERDR_WS (for example HERDR_WS=w2): herdr is touched only through herdr-ws\n");
    return 1;
  }
  const warn = (t: string) => io.stderr(`${t}\n`);
  try {
    let targets: FluxTarget[];
    if (o.all) targets = loadTargets(io.env, io.repoRoot, warn);
    else {
      const t = resolveTarget(agent, o, io.env, io.repoRoot, warn);
      if (!t) {
        io.stderr(`no target for ${agent}: add it to flux-targets.json in the depot or pass --brief and --note\n`);
        return 1;
      }
      targets = [t];
    }
    const herdrs = new Map<string, FluxHerdr>();
    const herdrFor = (session: string): FluxHerdr => {
      let h = herdrs.get(session);
      if (!h) {
        h = io.makeHerdr ? io.makeHerdr({ dryRun, session }) : createFluxHerdr(fluxRunner(execRunner, { allowPrompt: !dryRun }), session);
        herdrs.set(session, h);
      }
      return h;
    };
    const depsFor = (session: string): FluxDeps => ({
      herdr: herdrFor(session),
      // workers run on the Floor: the worker check reads it too when the target lives in another session
      ...(session === "default" ? {} : { floor: herdrFor("default") }),
      now: io.now,
      sleep: io.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      env: io.env,
      transcriptDir: io.transcriptDir,
      repoRoot: io.repoRoot,
    });
    const opts = { dryRun, log: !dryRun || !!o.log };
    const run = io.flux ?? fluxConductor;
    let results: FluxResult[];
    if (o.all) {
      const names = allTargets(targets).map((t) => t.agent);
      io.stdout(o.json ? `${JSON.stringify({ event: "targets", targets: names })}\n` : `Targets (${names.length}): ${names.join(", ")}\n`);
      // one herdr per session; the targets keep their order inside a session
      const order = allTargets(targets).map((t) => t.agent);
      results = [];
      const sessions = [...new Set(allTargets(targets).map((t) => t.session ?? "default"))];
      for (const session of sessions) {
        const group = targets.filter((t) => (t.session ?? "default") === session);
        results.push(...(await fluxAll(group, opts, depsFor(session), run)).results);
      }
      results.sort((a, b) => order.indexOf(a.agent) - order.indexOf(b.agent)); // print in target order
    } else results = [await run(targets[0], { ...opts, named: true }, depsFor(targets[0].session ?? "default"))];
    for (const r of results) io.stdout(o.json ? `${JSON.stringify(r)}\n` : line(r));
    return results.some((r) => r.result === "failed") ? 2 : 0;
  } catch (e) {
    io.stderr(`conductor flux: ${(e as Error).message}\n`);
    return 1;
  }
}
