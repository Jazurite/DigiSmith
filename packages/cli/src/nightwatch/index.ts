import type { CommandModule } from "yargs";
import { isSafe } from "../run/paths.ts";
import { attentionView, eventsView, overviewView, planView, runsView, runView, VIEW_NAMES } from "./views.ts";

export interface Result { code: number; out: string; err: string }
const ok = (v: unknown): Result => ({ code: 0, out: `${JSON.stringify(v)}\n`, err: "" });
const fail = (err: string): Result => ({ code: 1, out: "", err: `${err}\n` });

function flags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--") && i + 1 < argv.length) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}
function num(argv: string[], flag: string): number | undefined {
  const v = flags(argv)[flag];
  if (v === undefined) return undefined;
  return /^\d+$/.test(v) ? Number(v) : Number.NaN;
}

/** Pure entry for the tests: argv after "nightwatch". Reads only; never writes. */
export function runNightwatch(argv: string[], env: NodeJS.ProcessEnv, now: Date): Result {
  if (argv[0] !== "view") return fail("usage: nightwatch view <name>");
  const name = argv[1];
  const f = flags(argv.slice(2));
  if (!(VIEW_NAMES as readonly string[]).includes(name)) return fail(`unknown view (${VIEW_NAMES.join(", ")})`);
  for (const k of ["run", "ticket"]) if (f[k] !== undefined && !isSafe(f[k])) return fail("bad id");
  const since = num(argv.slice(2), "since"), before = num(argv.slice(2), "before"), tail = num(argv.slice(2), "tail"), limit = num(argv.slice(2), "limit");
  if ([since, before, tail, limit].some((n) => Number.isNaN(n))) return fail("bad number");
  switch (name) {
    case "overview": return ok(overviewView(env, now));
    case "attention": return ok(attentionView(env, now));
    case "runs": return ok(runsView(env, now, { state: f.state, role: f.role, ticket: f.ticket, trigger: f.trigger, limit }));
    case "run": { if (!f.run) return fail("--run is required"); const v = runView(env, now, { run: f.run }); return v === null ? fail("not found") : ok(v); }
    case "events": { if (!f.run) return fail("--run is required"); const v = eventsView(env, { run: f.run, since, before, tail, group: f.group }); return v === null ? fail("not found") : ok(v); }
    default: { if (!f.ticket) return fail("--ticket is required"); return ok(planView(env, { ticket: f.ticket })); }
  }
}

const nightwatchCommand: CommandModule = {
  command: "nightwatch",
  describe: "read-only views of the Nightwatch run record (for the Nexus API)",
  builder: (y) => y.command({
    command: "view <name>",
    describe: `print one JSON view: ${VIEW_NAMES.join(", ")}`,
    builder: (v) => v.positional("name", { type: "string", demandOption: true }).strict(false),
    handler: () => {
      const i = process.argv.indexOf("nightwatch");
      const r = runNightwatch(process.argv.slice(i + 1), process.env, new Date());
      if (r.out) process.stdout.write(r.out);
      if (r.err) process.stderr.write(r.err);
      process.exitCode = r.code;
    },
  }).demandCommand(1),
  handler: () => undefined,
};
export default nightwatchCommand;
