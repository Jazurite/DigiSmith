// node --experimental-strip-types scripts/conductor/cli.ts <state|state-write|consult> [options]
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { listCards } from "../session-card.ts";
import { consult, DEFAULT_REMOTE_REPO, renderText } from "./consult.ts";
import { execRunner, readOnlyRunner, type Runner } from "./runner.ts";
import { collectState, iso7, resolveNotePath, type CardRef } from "./state.ts";
import { fluxMain, transcriptDirFor } from "./flux-cli.ts";
import { resolveMainRoot } from "../lineage-handoff.ts";
import { extractBlock, parseStateBody, STATE_MARKER, writeStateBlock } from "./state-block.ts";

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  readStdin: () => Promise<string>;
  now: () => Date;
  env: NodeJS.ProcessEnv;
}

const USAGE = `Usage: node --experimental-strip-types scripts/conductor/cli.ts <command> [options]
  state        [--project P] [--conductor C] [--note path] [--since iso] [--json]
  state-write  --from <file or -> [--project P] [--conductor C] [--note path]
  flux         <agent> | --all [--dry-run] [--log] [--json] [--project P] [--brief path] [--note path] [--wake text]
  consult      [--project P] [--conductor C] [--remote <ssh-target>] [--remote-repo path] [--machine <herdr label>] [--json]
state and consult only read; flux sends /clear to a conductor (night only, see flux). state-write writes only the block between the digismith:conductor-state markers in the note.
`;

const OPTIONS = {
  project: { type: "string" },
  conductor: { type: "string" },
  note: { type: "string" },
  since: { type: "string" },
  json: { type: "boolean" },
  repo: { type: "string" },
  from: { type: "string" },
  remote: { type: "string" },
  "remote-repo": { type: "string" },
  machine: { type: "string" },
  "herdr-workspace": { type: "string" },
} as const;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function main(argv: string[], io: Io & { runner?: Runner; listCards?: (p: string, o: { scope: "open" }) => CardRef[] }): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "flux") {
    const repoRoot = resolveMainRoot(REPO_ROOT);
    return fluxMain(rest, { stdout: io.stdout, stderr: io.stderr, now: io.now, env: io.env, repoRoot, transcriptDir: transcriptDirFor(repoRoot) });
  }
  if (!command || !["state", "state-write", "consult"].includes(command)) {
    io.stderr(USAGE);
    return 1;
  }
  let v: ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>["values"];
  try {
    v = parseArgs({ args: rest, options: OPTIONS, strict: true }).values;
  } catch (e) {
    io.stderr(`${(e as Error).message}\n${USAGE}`);
    return 1;
  }
  const project = v.project ?? "DigiSmith";
  const conductor = v.conductor ?? `${project.toLowerCase()}-conductor`;
  const runner = io.runner ?? readOnlyRunner(execRunner);
  const repoDir = v.repo ?? REPO_ROOT;
  const collect = async () =>
    collectState(
      { project, conductor, note: v.note, since: v.since, herdrWorkspace: v["herdr-workspace"] ?? io.env.HERDR_WS, repoDir },
      { runner, now: io.now, env: io.env, listCards: io.listCards ?? ((p, o) => listCards(p, { ...o, env: io.env })) },
    );
  try {
    if (command === "state") {
      const s = await collect();
      io.stdout(v.json ? `${JSON.stringify(s)}\n` : renderText(s));
      return 0;
    }
    if (command === "state-write") {
      if (!v.from) {
        io.stderr(`state-write needs --from <file or ->\n${USAGE}`);
        return 1;
      }
      let text = v.from === "-" ? await io.readStdin() : fs.readFileSync(v.from, "utf-8");
      const pasted = extractBlock(text, STATE_MARKER);
      if (pasted.found) text = pasted.body;
      const { problems } = parseStateBody(text);
      if (problems.length) {
        io.stderr(`the block is not valid; nothing was written:\n${problems.map((p) => `  ${p}`).join("\n")}\n`);
        return 1;
      }
      if (!/^Updated:/m.test(text)) text = `Updated: ${iso7(io.now())}\n${text.startsWith("\n") ? "" : "\n"}${text}`;
      const notePath = resolveNotePath({ project, conductor, note: v.note }, io.env);
      writeStateBlock(notePath, text, STATE_MARKER);
      io.stdout(`wrote the state block to ${notePath}\n`);
      return 0;
    }
    const r = await consult(
      { project, conductor, remote: v.remote, remoteRepo: v["remote-repo"] ?? DEFAULT_REMOTE_REPO, machine: v.machine, since: v.since },
      { runner, local: collect },
    );
    if (v.json) io.stdout(`${JSON.stringify(r)}\n`);
    else {
      io.stdout(renderText(r.state));
      if (r.live) io.stdout(`\n## Live panes\n${r.live.map((l) => `- ${l.pane} | ${l.name} | ${l.status}`).join("\n") || "none"}\n`);
      for (const w of r.warnings) io.stderr(`warning: ${w}\n`);
    }
    return 0;
  } catch (e) {
    io.stderr(`conductor ${command}: ${(e as Error).message}\n`);
    return 1;
  }
}

function isDirectRun(): boolean {
  try {
    return !!process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const io: Io = {
    stdout: (s) => void process.stdout.write(s),
    stderr: (s) => void process.stderr.write(s),
    readStdin: async () => {
      let t = "";
      for await (const c of process.stdin) t += c;
      return t;
    },
    now: () => new Date(),
    env: process.env,
  };
  process.exitCode = await main(process.argv.slice(2), io);
}
