import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export interface FakeResponse { id: string; req: string; model?: string; ts: string; input?: number; output?: number; cache_read?: number; w5m?: number; w1h?: number }

export function responseLine(sessionId: string, r: FakeResponse): string {
  return JSON.stringify({
    type: "assistant", timestamp: r.ts, sessionId, requestId: r.req, cwd: "/Users/fake/Workspace/SECRET-PATH",
    message: { id: r.id, model: r.model ?? "claude-opus-5-5", content: [{ type: "text", text: "SECRET MESSAGE TEXT" }],
      usage: { input_tokens: r.input ?? 0, output_tokens: r.output ?? 0, cache_read_input_tokens: r.cache_read ?? 0,
        cache_creation_input_tokens: (r.w5m ?? 0) + (r.w1h ?? 0), cache_creation: { ephemeral_5m_input_tokens: r.w5m ?? 0, ephemeral_1h_input_tokens: r.w1h ?? 0 } } },
  }) + "\n";
}

export function writeTranscript(projects: string, sessionId: string, responses: FakeResponse[], append = false): string {
  const dir = join(projects, "-Users-fake-Workspace-SECRET-PATH");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${sessionId}.jsonl`);
  const text = responses.map((r) => responseLine(sessionId, r)).join("");
  if (append) appendFileSync(file, text); else writeFileSync(file, text);
  return file;
}

export function writeSubagent(projects: string, sessionId: string, agentId: string, responses: FakeResponse[]): void {
  const dir = join(projects, "-Users-fake-Workspace-SECRET-PATH", sessionId, "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `agent-${agentId}.jsonl`), responses.map((r) => responseLine(sessionId, r)).join(""));
}

export function writeRun(depot: string, folder: string, run: string, opts: { created: string; sessionId?: string | null; started?: { ts: string; session: string }[]; ended?: string }): string {
  const dir = join(depot, "runs", folder, run);
  mkdirSync(dir, { recursive: true });
  const record: Record<string, unknown> = { schema: "nightwatch-run/v1", run, ticket: folder, role: "builder", order: null, seat: null, model: null, plugin_version: null, base_sha: null, branch: null, worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: opts.created };
  if (opts.sessionId !== undefined) record.session_id = opts.sessionId;
  writeFileSync(join(dir, "run.json"), JSON.stringify(record));
  let seq = 0;
  const lines = (opts.started ?? []).map((s) => JSON.stringify({ schema: "nightwatch-event/v1", seq: ++seq, ts: s.ts, run, type: "started", data: { source: "startup", session_id: s.session } }));
  if (opts.ended) lines.push(JSON.stringify({ schema: "nightwatch-event/v1", seq: ++seq, ts: opts.ended, run, type: "ended", data: { reason: "exit" } }));
  writeFileSync(join(dir, "events.jsonl"), lines.map((l) => l + "\n").join(""));
  return dir;
}
