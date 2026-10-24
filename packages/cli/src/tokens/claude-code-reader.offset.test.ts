import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FileCursor } from "./claude-code-reader.ts";
import { readClaudeCodeSession, readUsageFrom } from "./claude-code-reader.ts";

const line = (id: string, req: string, output: number, model = "claude-opus-5-5", ts = "2026-10-24T08:00:00.000Z") =>
  JSON.stringify({ type: "assistant", timestamp: ts, sessionId: "s1", requestId: req, message: { id, model, content: [{ type: "text", text: "SECRET MESSAGE" }], usage: { input_tokens: 1, output_tokens: output, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 3, ephemeral_1h_input_tokens: 2 } } } }) + "\n";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "offset-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("readUsageFrom", () => {
  it("reads only full lines and resumes at the offset", () => {
    const f = join(dir, "s1.jsonl");
    const second = line("m2", "r2", 7);
    writeFileSync(f, line("m1", "r1", 5) + second.slice(0, 20));
    const a = readUsageFrom(f, null, "s1", null);
    expect(a.records.map((r) => r.response_id)).toEqual(["m1|r1"]);
    expect(a.restarted).toBe(true);
    appendFileSync(f, second.slice(20) + line("m2", "r2", 9));
    const b = readUsageFrom(f, a.cursor, "s1", null);
    expect(b.restarted).toBe(false);
    expect(b.records.map((r) => [r.response_id, r.output])).toEqual([["m2|r2", 7], ["m2|r2", 9]]);
  });
  it("starts again from 0 when the file shrank or was replaced", () => {
    const f = join(dir, "s1.jsonl");
    writeFileSync(f, line("m1", "r1", 5) + line("m2", "r2", 6));
    const a = readUsageFrom(f, null, "s1", null);
    writeFileSync(f, line("m3", "r3", 1));
    const b = readUsageFrom(f, a.cursor, "s1", null);
    expect(b.restarted).toBe(true);
    expect(b.records.map((r) => r.response_id)).toEqual(["m3|r3"]);
  });
  it("skips a line over 1 MB and keeps going", () => {
    const f = join(dir, "s1.jsonl");
    writeFileSync(f, "x".repeat(1_100_000) + "\n" + line("m1", "r1", 5));
    expect(readUsageFrom(f, null, "s1", null).records).toHaveLength(1);
  });
  it("gives the same records as the whole-file reader, in several appends", () => {
    const f = join(dir, "s1.jsonl");
    const all = [line("m1", "r1", 5), line("m1", "r1", 8), line("m2", "r2", 3, "claude-haiku-5-5"), JSON.stringify({ type: "user" }) + "\n"].join("");
    let cursor: FileCursor | null = null;
    const seen = new Map<string, number>();
    for (let cut = 0; cut < all.length; cut += 97) {
      appendFileSync(f, all.slice(cut, cut + 97));
      const r = readUsageFrom(f, cursor, "s1", null);
      cursor = r.cursor;
      for (const rec of r.records) seen.set(rec.response_id, Math.max(seen.get(rec.response_id) ?? 0, rec.output));
    }
    const whole = readClaudeCodeSession(f);
    expect([...seen.entries()].sort()).toEqual(whole.map((r) => [r.response_id, r.output] as [string, number]).sort());
  });
  it("keeps no message text in a record", () => {
    const f = join(dir, "s1.jsonl");
    writeFileSync(f, line("m1", "r1", 5));
    expect(JSON.stringify(readUsageFrom(f, null, "s1", null))).not.toContain("SECRET");
  });
  it("uses only the file base name in the fallback id", () => {
    const f = join(dir, "s1.jsonl");
    const noReq = JSON.stringify({ type: "assistant", message: { model: "claude-opus-5-5", usage: { output_tokens: 1 } } }) + "\n";
    writeFileSync(f, line("m1", "r1", 5) + noReq);
    const ids = readUsageFrom(f, null, "s1", null).records.map((r) => r.response_id);
    expect(ids[1]).toBe(`line|s1.jsonl|${Buffer.byteLength(line("m1", "r1", 5))}`);
    expect(ids[1]).not.toContain(dir);
  });
});
