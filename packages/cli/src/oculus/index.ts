import type { CommandModule } from "yargs";
import { isSafe } from "../run/paths.ts";
import { liveView, realHerdr, type HerdrCall } from "./live.ts";
import { attentionView, eventsView, overviewView, planView, runsView, runView, VIEW_NAMES } from "./views.ts";

export interface OculusDeps { herdr?: HerdrCall }
export interface Result { code: number; out: string; err: string }
const ok = (v: unknown): Result => ({ code: 0, out: `${JSON.stringify(v)}\n`, err: "" });
const fail = (err: string): Result => ({ code: 1, out: "", err: `${err}\n` });

const VALUE_FLAGS = ["run", "ticket", "since", "before", "tail", "group", "state", "role", "trigger", "limit", "project"];

/** Parses --key value and --key=value. Returns null on an unknown flag or a missing value. */
function flags(argv: string[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const eq = argv[i].indexOf("=");
    const key = eq === -1 ? argv[i].slice(2) : argv[i].slice(2, eq);
    if (key === "json" && eq === -1) continue;
    if (!VALUE_FLAGS.includes(key)) return null;
    if (eq !== -1) out[key] = argv[i].slice(eq + 1);
    else if (i + 1 < argv.length) out[key] = argv[++i];
    else return null;
  }
  return out;
}
function num(f: Record<string, string>, flag: string): number | undefined {
  const v = f[flag];
  if (v === undefined) return undefined;
  return /^\d+$/.test(v) ? Number(v) : Number.NaN;
}

/** Pure entry for the tests: argv after "oculus". Reads only; never writes. */
export function runOculus(argv: string[], env: NodeJS.ProcessEnv, now: Date, deps: OculusDeps = {}): Result {
  if (argv[0] !== "view") return fail("usage: oculus view <name>");
  const name = argv[1];
  const f = flags(argv.slice(2));
  if (f === null) return fail("unknown flag or missing value");
  if (!(VIEW_NAMES as readonly string[]).includes(name)) return fail(`unknown view (${VIEW_NAMES.join(", ")})`);
  for (const k of ["run", "ticket", "project"]) if (f[k] !== undefined && !isSafe(f[k])) return fail("bad id");
  const since = num(f, "since"), before = num(f, "before"), tail = num(f, "tail"), limit = num(f, "limit");
  if ([since, before, tail, limit].some((n) => Number.isNaN(n))) return fail("bad number");
  if (name === "live") {
    if (Object.keys(f).length > 0) return fail("live takes no flag");
    return ok(liveView(env, now, deps.herdr ?? realHerdr()));
  }
  switch (name) {
    case "overview": return ok(overviewView(env, now));
    case "attention": return ok(attentionView(env, now));
    case "runs": return ok(runsView(env, now, { state: f.state, role: f.role, ticket: f.ticket, trigger: f.trigger, project: f.project, limit }));
    case "run": { if (!f.run) return fail("--run is required"); const v = runView(env, now, { run: f.run }); return v === null ? fail("not found") : ok(v); }
    case "events": { if (!f.run) return fail("--run is required"); const v = eventsView(env, { run: f.run, since, before, tail, group: f.group }); return v === null ? fail("not found") : ok(v); }
    default: { if (!f.ticket) return fail("--ticket is required"); return ok(planView(env, { ticket: f.ticket })); }
  }
}

const oculusCommand: CommandModule = {
  command: "oculus",
  describe: "read-only views for Oculus (served by the Nexus API)",
  builder: (y) => y.command({
    command: "view <name>",
    describe: `print one JSON view: ${VIEW_NAMES.join(", ")}`,
    builder: (v) => v.positional("name", { type: "string", demandOption: true }).strict(false),
    handler: () => {
      const i = process.argv.indexOf("oculus");
      const r = runOculus(process.argv.slice(i + 1), process.env, new Date());
      if (r.out) process.stdout.write(r.out);
      if (r.err) process.stderr.write(r.err);
      process.exitCode = r.code;
    },
  }).demandCommand(1),
  handler: () => undefined,
};
export default oculusCommand;
