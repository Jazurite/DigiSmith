// The real herdr for the flux: ONLY through the herdr-ws wrapper (HERDR_WS=w2), and only four verbs.
// Closing, killing, starting, focusing and key sending do not exist here; a runner guard refuses them before anything runs.
import type { FluxHerdr, HerdrAgent } from "./flux.ts";
import { execRunner, type Runner } from "./runner.ts";

export const HERDR_WS_BIN = "/Users/workbox/.digismith-depot/bin/herdr-ws";

const refuse = (what: string): never => {
  throw new Error(`refused: ${what}`);
};
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PANE = /^w\d+:[A-Za-z0-9]+$/;

function checkPrompt(a: string[]): void {
  const [, , name, text, ...flags] = a;
  if (!NAME.test(name ?? "")) refuse("prompt target");
  if (!text || text.startsWith("-")) refuse("prompt text");
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === "--wait") continue;
    if (flags[i] === "--until" && ["idle", "done"].includes(flags[i + 1])) i++;
    else if (flags[i] === "--timeout" && /^\d{1,7}$/.test(flags[i + 1] ?? "")) i++;
    else refuse(`prompt flag ${flags[i]}`);
  }
}

/** Observer-grade guard with one extra verb: a prompt, and only when allowed (a dry run is built without it). */
export function fluxRunner(inner: Runner, o: { allowPrompt: boolean }): Runner {
  return async (cmd, args, opts) => {
    if (cmd !== HERDR_WS_BIN) refuse(`command ${cmd}`);
    const [g, v] = args;
    if (g === "agent" && v === "list" && args.length === 2) {
      // allowed
    } else if (g === "agent" && v === "get" && args.length === 3 && NAME.test(args[2])) {
      // allowed
    } else if (
      g === "pane" && v === "read" && args.length === 7 && PANE.test(args[2]) &&
      args.slice(3).join(" ") === "--source visible --format ansi"
    ) {
      // allowed
    } else if (g === "agent" && v === "prompt") {
      if (!o.allowPrompt) refuse("agent prompt (this runner is read-only)");
      checkPrompt(args);
    } else refuse(`herdr-ws ${args.slice(0, 2).join(" ")}`);
    return inner(cmd, args, opts);
  };
}

const toAgent = (a: Record<string, unknown>): HerdrAgent => ({
  name: String(a.name ?? ""),
  pane_id: String(a.pane_id ?? ""),
  agent_status: String(a.agent_status ?? "unknown"),
  session: String((a.agent_session as { value?: string } | undefined)?.value ?? ""),
});

export function createFluxHerdr(run: Runner = fluxRunner(execRunner, { allowPrompt: true })): FluxHerdr {
  return {
    async list() {
      const r = await run(HERDR_WS_BIN, ["agent", "list"]);
      if (r.code !== 0) throw new Error(`herdr agent list failed: ${r.stderr.trim() || `exit ${r.code}`}`);
      return ((JSON.parse(r.stdout) as { result?: { agents?: Record<string, unknown>[] } }).result?.agents ?? []).map(toAgent);
    },
    async get(name) {
      const r = await run(HERDR_WS_BIN, ["agent", "get", name]);
      if (r.code !== 0) return undefined;
      try {
        const a = (JSON.parse(r.stdout) as { result?: { agent?: Record<string, unknown> } }).result?.agent;
        return a ? toAgent(a) : undefined;
      } catch {
        return undefined; // one bad reply must not end a flux between the clear and the wake: the caller polls again
      }
    },
    async readInput(pane) {
      const r = await run(HERDR_WS_BIN, ["pane", "read", pane, "--source", "visible", "--format", "ansi"]);
      if (r.code !== 0) throw new Error(`herdr pane read failed: ${r.stderr.trim() || `exit ${r.code}`}`);
      return r.stdout;
    },
    async sendPrompt(name, text, o = {}) {
      const args = ["agent", "prompt", name, text];
      if (o.wait) args.push("--wait");
      for (const u of o.until ?? []) args.push("--until", u);
      if (o.timeoutMs) args.push("--timeout", String(o.timeoutMs));
      const r = await run(HERDR_WS_BIN, args, { timeoutMs: (o.timeoutMs ?? 30_000) + 10_000 });
      if (r.code === 0) return { ok: true };
      const code = /agent_[a-z_]+|timeout/.exec(`${r.stdout} ${r.stderr}`)?.[0] ?? "error";
      return { ok: false, code };
    },
  };
}
