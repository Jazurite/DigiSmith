import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { collectRecords, countTicket } from "./count.ts";
import { createDepotRegistry } from "./registry.ts";
import { ACTIVE_GAP_CAP_SECONDS, activeSeconds, taskUsage } from "./stamp.ts";
import { writeSubagent, writeTranscript, type FakeResponse } from "./fixtures.test-util.ts";
import { costFromPricing, resolveAnthropicPrice } from "./prices/cost.ts";
import type { RegistryEntry } from "./types.ts";

const T = "T-1";
const S = "sess-a";
const reg = (): ReturnType<typeof createDepotRegistry> => createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
const projects = (): string => mkdtempSync(join(tmpdir(), "proj-"));
const session = (id = S): RegistryEntry => ({ kind: "session", ticket: T, session_id: id, source: "claude-code", role: "worker", ts: "2026-10-10T00:00:00Z" });
const start = (task: string, ts: string, id = S): RegistryEntry => ({ kind: "task_start", ticket: T, task, session_id: id, ts });
const end = (task: string, ts: string, id = S): RegistryEntry => ({ kind: "task_end", ticket: T, task, session_id: id, ts });
const resp = (id: string, ts: string, o: Partial<FakeResponse> = {}): FakeResponse => ({ id, req: `req-${id}`, ts, output: 10, ...o });

function run(responses: FakeResponse[], entries: RegistryEntry[], extra?: (p: string) => void) {
  const p = projects();
  writeTranscript(p, S, responses);
  extra?.(p);
  const r = reg();
  for (const e of entries) r.append(e);
  return { p, r, c: collectRecords({ ticket: T, registry: r, projectsDir: p }) };
}

describe("taskUsage", () => {
  it("counts only the responses inside the task window", () => {
    const entries = [session(), start("1", "2026-10-10T01:00:00Z"), end("1", "2026-10-10T02:00:00Z"), start("2", "2026-10-10T02:00:00Z"), end("2", "2026-10-10T03:00:00Z")];
    const { c } = run([resp("a", "2026-10-10T01:30:00Z", { input: 1000, output: 500 }), resp("b", "2026-10-10T02:30:00Z", { output: 999 })], entries);
    const u = taskUsage(c.records, c.entries, undefined, "1", c.ticketSessions);
    expect(u.models["claude-opus-5-5"]).toMatchObject({ input: 1000, output: 500, responses: 1 });
    expect(u.models["claude-opus-5-5"].cost_usd).toBeGreaterThan(0);
    expect(u.total.counts.responses).toBe(1);
    expect(u.total.priced).toBe(true);
    expect(u.windows).toEqual([{ start: "2026-10-10T01:00:00Z", end: "2026-10-10T02:00:00Z" }]);
    expect(u.agentSeconds).toBe(3600);
  });

  it("prices each response on its own for the Haiku 5.5 long tier", () => {
    const entries = [session(), start("1", "2026-10-10T01:00:00Z"), end("1", "2026-10-10T02:00:00Z")];
    const m = "claude-haiku-5-5";
    const { c } = run([resp("a", "2026-10-10T01:10:00Z", { model: m, input: 50_000, output: 1000 }), resp("b", "2026-10-10T01:20:00Z", { model: m, input: 150_000, output: 1000 })], entries);
    const u = taskUsage(c.records, c.entries, undefined, "1", c.ticketSessions);
    const p = resolveAnthropicPrice(m)!;
    const base = costFromPricing(p, { inputTokens: 50_000, outputTokens: 1000 });
    const long = costFromPricing(p, { inputTokens: 150_000, outputTokens: 1000 });
    const summed = costFromPricing(p, { inputTokens: 200_000, outputTokens: 2000 });
    expect(u.models[m].cost_usd).toBeCloseTo(base + long, 9);
    expect(base + long).not.toBeCloseTo(summed, 6);
    expect(u.total.cost_usd).toBeCloseTo(base + long, 9);
  });

  it("gives cost_usd null for a model with no price and priced false for the total", () => {
    const entries = [session(), start("1", "2026-10-10T01:00:00Z"), end("1", "2026-10-10T02:00:00Z")];
    const { c } = run([resp("a", "2026-10-10T01:10:00Z", { model: "mystery-model-9" }), resp("b", "2026-10-10T01:20:00Z")], entries);
    const u = taskUsage(c.records, c.entries, undefined, "1", c.ticketSessions);
    expect(u.models["mystery-model-9"].cost_usd).toBeNull();
    expect(u.total.priced).toBe(false);
    expect(u.total.cost_usd).toBeNull();
  });

  it("sums the closed windows of a reopened task", () => {
    const entries = [session(), start("1", "2026-10-10T01:00:00Z"), end("1", "2026-10-10T01:10:00Z"), start("1", "2026-10-10T05:00:00Z"), end("1", "2026-10-10T05:20:00Z")];
    const { c } = run([resp("a", "2026-10-10T01:05:00Z"), resp("b", "2026-10-10T03:00:00Z"), resp("c", "2026-10-10T05:10:00Z")], entries);
    const u = taskUsage(c.records, c.entries, undefined, "1", c.ticketSessions);
    expect(u.agentSeconds).toBe(600 + 1200);
    expect(u.windows).toHaveLength(2);
    expect(u.total.counts.responses).toBe(2);
  });

  it("leaves out a response from a session outside the ticket", () => {
    const entries = [session(), start("1", "2026-10-10T01:00:00Z"), end("1", "2026-10-10T02:00:00Z")];
    // sess-b is registered nowhere; its response sits in the replayed transcript of sess-a.
    const p = projects();
    const file = writeTranscript(p, S, [resp("a", "2026-10-10T01:10:00Z", { output: 10 })]);
    const foreign = JSON.stringify({ type: "assistant", timestamp: "2026-10-10T01:20:00Z", sessionId: "sess-b", requestId: "rq", message: { id: "mx", model: "claude-opus-5-5", usage: { input_tokens: 0, output_tokens: 777 } } }) + "\n";
    appendFileSync(file, foreign);
    const r = reg();
    for (const e of entries) r.append(e);
    const c = collectRecords({ ticket: T, registry: r, projectsDir: p });
    expect(c.records.some((x) => x.session_id === "sess-b")).toBe(true);
    const u = taskUsage(c.records, c.entries, { "1": [] }, "1", c.ticketSessions);
    expect(u.total.counts.output).toBe(10);
  });

  it("moves a ledger-dispatched subagent's responses into the task", () => {
    const entries = [session(), start("1", "2026-10-10T01:00:00Z"), end("1", "2026-10-10T02:00:00Z")];
    const { c } = run([resp("a", "2026-10-10T01:10:00Z", { output: 10 })], entries, (p) => writeSubagent(p, S, "ag1", [resp("s", "2026-10-10T04:00:00Z", { output: 55 })]));
    const without = taskUsage(c.records, c.entries, undefined, "1", c.ticketSessions);
    expect(without.total.counts.output).toBe(10);
    const withLedger = taskUsage(c.records, c.entries, { "1": ["ag1"] }, "1", c.ticketSessions);
    expect(withLedger.total.counts.output).toBe(65);
  });
});

describe("task windows", () => {
  it("counts overlapping windows from two sessions both", () => {
    const entries = [session(), session("sess-c"), start("1", "2026-10-10T01:00:00Z"), end("1", "2026-10-10T01:10:00Z"), start("1", "2026-10-10T01:05:00Z", "sess-c"), end("1", "2026-10-10T01:15:00Z", "sess-c")];
    const { c } = run([resp("a", "2026-10-10T01:02:00Z")], entries);
    const u = taskUsage(c.records, c.entries, undefined, "1", c.ticketSessions);
    expect(u.windows).toHaveLength(2);
    expect(u.agentSeconds).toBe(600 + 600);
  });

  it("keeps the first task_start when a second arrives while one is open", () => {
    const entries = [session(), start("1", "2026-10-10T01:00:00Z"), start("1", "2026-10-10T01:05:00Z"), end("1", "2026-10-10T01:10:00Z")];
    const { c } = run([resp("a", "2026-10-10T01:07:00Z")], entries);
    const u = taskUsage(c.records, c.entries, undefined, "1", c.ticketSessions);
    expect(u.windows).toEqual([{ start: "2026-10-10T01:00:00Z", end: "2026-10-10T01:10:00Z" }]);
    expect(u.agentSeconds).toBe(600);
  });
});

describe("collectRecords", () => {
  it("lists a session with no readable transcript", () => {
    const entries = [session(), session("sess-gone")];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { c } = run([resp("a", "2026-10-10T01:10:00Z")], entries);
    expect(c.missingSessions).toEqual(["sess-gone"]);
    expect(spy).toHaveBeenCalledWith("tokens: no transcript found for session sess-gone");
    spy.mockRestore();
  });

  it("leaves countTicket output unchanged", () => {
    const entries = [session(), start("1", "2026-10-10T01:00:00Z"), end("1", "2026-10-10T02:00:00Z")];
    const { p, r } = run([resp("a", "2026-10-10T01:10:00Z", { input: 3, output: 4, cache_read: 5, w5m: 6, w1h: 7 })], entries);
    const snap = countTicket({ ticket: T, registry: r, projectsDir: p, now: () => "t" });
    expect(snap).toEqual({
      schema_version: 1, ticket: T, generated_at: "t", reader_versions: { "claude-code": "1" },
      steps: { other: { "claude-opus-5-5": { input: 3, output: 4, cache_read: 5, cache_write_5m: 6, cache_write_1h: 7, responses: 1 } } },
      tasks: { "1": { "claude-opus-5-5": { input: 3, output: 4, cache_read: 5, cache_write_5m: 6, cache_write_1h: 7, responses: 1 } } },
      sessions: [{ session_id: S, role: "worker", attribution: "registry" }],
      unattributed: {},
    });
  });
});

describe("activeSeconds", () => {
  const at = (sec: number): string => new Date(Date.UTC(2026, 9, 10, 0, 0, 0) + sec * 1000).toISOString();
  it("defaults the cap to 600 seconds", () => {
    expect(ACTIVE_GAP_CAP_SECONDS).toBe(600);
  });
  it("is 0 for no response and for one response", () => {
    expect(activeSeconds([])).toBe(0);
    expect(activeSeconds([at(0)])).toBe(0);
  });
  it("sums gaps under the cap", () => {
    expect(activeSeconds([at(0), at(100), at(250)])).toBe(250);
  });
  it("drops a gap over the cap", () => {
    expect(activeSeconds([at(0), at(100), at(100 + 601), at(100 + 601 + 50)])).toBe(150);
  });
  it("counts a gap exactly at the cap", () => {
    expect(activeSeconds([at(0), at(600)])).toBe(600);
  });
  it("sorts unsorted input", () => {
    expect(activeSeconds([at(250), at(0), at(100)])).toBe(250);
  });
  it("gives 0 for equal timestamps", () => {
    expect(activeSeconds([at(5), at(5), at(5)])).toBe(0);
  });
  it("skips unparsable timestamps and honors a custom cap", () => {
    expect(activeSeconds([at(0), "nope", at(10)])).toBe(10);
    expect(activeSeconds([at(0), at(10), at(40)], 20)).toBe(10);
  });
});
