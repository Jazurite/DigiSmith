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
  it("counts the top-level usage and ignores usage.iterations", () => {
    const { file, sid } = setup();
    const one = JSON.parse(assistant({ id: "m1", req: "r1", output: 40, ts: "2026-10-10T01:00:00Z", sessionId: sid }));
    one.message.usage.iterations = [{ type: "message", input_tokens: 2, output_tokens: 40 }];
    const two = JSON.parse(assistant({ id: "m2", req: "r2", output: 50, ts: "2026-10-10T02:00:00Z", sessionId: sid }));
    two.message.usage.iterations = [
      { type: "message", input_tokens: 2, output_tokens: 20 },
      { type: "message", input_tokens: 2, output_tokens: 30 },
    ];
    writeFileSync(file, [line(one), line(two)].join("\n"));
    const out = readClaudeCodeSession(file);
    expect(out.map((r) => [r.input, r.output])).toEqual([[2, 40], [2, 50]]);
  });

  it("ignores a compaction summary line and keeps the sessionId written on each line", () => {
    const { file, sid } = setup();
    writeFileSync(file, [
      line({ type: "user", isCompactSummary: true, sessionId: sid, message: { role: "user", content: "x" } }),
      line({ type: "system", subtype: "compact_boundary", sessionId: sid }),
      assistant({ id: "m1", req: "r1", output: 9, ts: "2026-10-10T01:00:00Z", sessionId: "22222222-2222-2222-2222-222222222222" }),
    ].join("\n"));
    const out = readClaudeCodeSession(file);
    expect(out).toHaveLength(1);
    expect(out[0].session_id).toBe("22222222-2222-2222-2222-222222222222");
  });
  it("never dedupes id-less lines across files", () => {
    const mk = (n: number) => {
      const { file } = setup();
      const f = file.replace(".jsonl", `-${n}.jsonl`);
      writeFileSync(f, line({ type: "assistant", timestamp: "2026-10-10T01:00:00Z", message: { model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 5 } } }));
      return f;
    };
    const a = readClaudeCodeSession(mk(1));
    const b = readClaudeCodeSession(mk(2));
    expect(a[0].response_id).not.toBe(b[0].response_id);
  });
  it("counts id-less lines of two subagent files and the main file at the same line index", () => {
    const { dir, file, sid } = setup();
    const idless = (output: number) =>
      line({ type: "assistant", timestamp: "2026-10-10T01:00:00Z", sessionId: sid, message: { model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: output } } });
    writeFileSync(file, idless(1));
    mkdirSync(join(dir, sid, "subagents"), { recursive: true });
    writeFileSync(join(dir, sid, "subagents", "agent-aaa.jsonl"), idless(2));
    writeFileSync(join(dir, sid, "subagents", "agent-bbb.jsonl"), idless(3));
    const out = readClaudeCodeSession(file);
    expect(out.map((r) => r.output).sort()).toEqual([1, 2, 3]);
    expect(new Set(out.map((r) => r.response_id)).size).toBe(3);
  });

  it("takes the agent id from the subagent file name, and an explicit line agentId wins", () => {
    const { dir, file, sid } = setup();
    writeFileSync(file, "");
    mkdirSync(join(dir, sid, "subagents"), { recursive: true });
    const noAgent = (id: string) =>
      line({ type: "assistant", timestamp: "2026-10-10T01:00:00Z", sessionId: sid, requestId: `q-${id}`, message: { id, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    writeFileSync(join(dir, sid, "subagents", "agent-abc123.jsonl"), [noAgent("n1"), assistant({ id: "n2", req: "q2", output: 1, ts: "2026-10-10T01:00:00Z", sessionId: sid, agentId: "explicit9" })].join("\n"));
    const out = readClaudeCodeSession(file);
    expect(out.find((r) => r.response_id === "n1|q-n1")!.agent_id).toBe("abc123");
    expect(out.find((r) => r.response_id === "n2|q2")!.agent_id).toBe("explicit9");
  });
  it("skips valid JSON of the wrong shape without crashing", () => {
    const { file, sid } = setup();
    writeFileSync(file, [
      "null", "[]", "7", '"x"', line({ type: "assistant", message: null }), line({ type: "assistant", message: [] }),
      line({ type: "assistant", message: { model: "claude-opus-5-5", usage: null } }),
      assistant({ id: "m1", req: "r1", output: 3, ts: "2026-10-10T01:00:00Z", sessionId: sid }),
    ].join("\n"));
    const out = readClaudeCodeSession(file);
    expect(out).toHaveLength(1);
    expect(out[0].output).toBe(3);
  });

  it.each([
    ["a string count", '"2"'],
    ["a negative count", "-4"],
    ["a non-finite count", "1e999"],
    ["a null count", "null"],
  ])("skips a record with %s", (_label, bad) => {
    const { file, sid } = setup();
    const good = assistant({ id: "m1", req: "r1", output: 3, ts: "2026-10-10T01:00:00Z", sessionId: sid });
    const broken = assistant({ id: "m2", req: "r2", output: 999, ts: "2026-10-10T01:00:01Z", sessionId: sid }).replace('"input_tokens":2', `"input_tokens":${bad}`);
    expect(broken).toContain(bad);
    writeFileSync(file, [good, broken].join("\n"));
    const out = readClaudeCodeSession(file);
    expect(out.map((r) => r.output)).toEqual([3]);
  });
  it("keeps service_tier, speed, iterations and fallback_credit as raw_flags, only the keys present", () => {
    const { file, sid } = setup();
    const one = JSON.parse(assistant({ id: "m1", req: "r1", output: 4, ts: "2026-10-10T01:00:00Z", sessionId: sid }));
    one.message.usage.service_tier = "standard";
    one.message.usage.speed = "fast";
    one.message.usage.iterations = [{ type: "message", input_tokens: 2, output_tokens: 4 }];
    one.message.usage.fallback_credit = { kind: "placeholder" };
    const two = JSON.parse(assistant({ id: "m2", req: "r2", output: 5, ts: "2026-10-10T01:01:00Z", sessionId: sid }));
    two.message.usage.service_tier = "priority";
    writeFileSync(file, [line(one), line(two)].join("\n"));
    const [a, b] = readClaudeCodeSession(file);
    expect(a.raw_flags).toEqual({ service_tier: "standard", speed: "fast", iterations: [{ type: "message", input_tokens: 2, output_tokens: 4 }], fallback_credit: { kind: "placeholder" } });
    expect(b.raw_flags).toEqual({ service_tier: "priority" });
  });
});
