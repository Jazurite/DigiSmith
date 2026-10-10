import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readClaudeCodeSession } from "./claude-code-reader.ts";

function line(o: object): string {
  return JSON.stringify(o);
}

function assistant(opts: {
  id: string; req: string; output: number; ts: string; sessionId: string; model?: string;
  agentId?: string; split?: boolean;
}) {
  const usage: Record<string, unknown> = {
    input_tokens: 2,
    output_tokens: opts.output,
    cache_read_input_tokens: 100,
    cache_creation_input_tokens: 30,
  };
  if (opts.split !== false) usage.cache_creation = { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 };
  return line({
    type: "assistant", uuid: `${opts.id}-${opts.output}`, timestamp: opts.ts, sessionId: opts.sessionId,
    requestId: opts.req, ...(opts.agentId ? { agentId: opts.agentId, isSidechain: true } : {}),
    message: { id: opts.id, model: opts.model ?? "claude-opus-5-5", usage },
  });
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "tok-"));
  const sid = "11111111-1111-1111-1111-111111111111";
  return { dir, sid, file: join(dir, `${sid}.jsonl`) };
}

describe("readClaudeCodeSession", () => {
  it("dedupes lines with the same message id and request id, keeping the highest output", () => {
    const { file, sid } = setup();
    writeFileSync(file, [
      assistant({ id: "m1", req: "r1", output: 5, ts: "2026-10-10T01:00:00Z", sessionId: sid }),
      assistant({ id: "m1", req: "r1", output: 427, ts: "2026-10-10T01:00:01Z", sessionId: sid }),
      assistant({ id: "m2", req: "r2", output: 9, ts: "2026-10-10T01:01:00Z", sessionId: sid }),
    ].join("\n"));
    const records = readClaudeCodeSession(file);
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.response_id === "m1|r1")!.output).toBe(427);
  });

  it("splits cache writes by 5-minute and 1-hour", () => {
    const { file, sid } = setup();
    writeFileSync(file, assistant({ id: "m1", req: "r1", output: 1, ts: "2026-10-10T01:00:00Z", sessionId: sid }));
    const [r] = readClaudeCodeSession(file);
    expect(r).toMatchObject({ cache_write_5m: 10, cache_write_1h: 20, cache_read: 100, input: 2, write_split: "known" });
  });

  it("puts all cache writes in the 5-minute bucket and marks the split unknown when cache_creation is missing", () => {
    const { file, sid } = setup();
    writeFileSync(file, assistant({ id: "m1", req: "r1", output: 1, ts: "2026-10-10T01:00:00Z", sessionId: sid, split: false }));
    const [r] = readClaudeCodeSession(file);
    expect(r).toMatchObject({ cache_write_5m: 30, cache_write_1h: 0, write_split: "unknown" });
  });

  it("reads subagent files under <session>/subagents and tags the agent id", () => {
    const { dir, file, sid } = setup();
    writeFileSync(file, assistant({ id: "m1", req: "r1", output: 1, ts: "2026-10-10T01:00:00Z", sessionId: sid }));
    mkdirSync(join(dir, sid, "subagents"), { recursive: true });
    writeFileSync(
      join(dir, sid, "subagents", "agent-abc123.jsonl"),
      assistant({ id: "s1", req: "q1", output: 7, ts: "2026-10-10T01:02:00Z", sessionId: sid, agentId: "abc123" }),
    );
    const records = readClaudeCodeSession(file);
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.agent_id === "abc123")).toMatchObject({ session_id: sid, output: 7 });
    expect(records.find((r) => r.agent_id === null)).toBeDefined();
  });

  it("skips synthetic responses and non-assistant lines", () => {
    const { file, sid } = setup();
    writeFileSync(file, [
      line({ type: "user", message: { content: "x" } }),
      assistant({ id: "m1", req: "r1", output: 1, ts: "2026-10-10T01:00:00Z", sessionId: sid, model: "<synthetic>" }),
      "not json",
    ].join("\n"));
    expect(readClaudeCodeSession(file)).toEqual([]);
  });
});
