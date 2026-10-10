import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDepotRegistry } from "./registry.ts";

describe("depot registry", () => {
  it("appends one JSON line per entry and reads them back by ticket", () => {
    const dir = mkdtempSync(join(tmpdir(), "reg-"));
    const reg = createDepotRegistry(dir);
    reg.append({ kind: "session", ticket: "DGS-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T01:00:00Z" });
    reg.append({ kind: "step_start", ticket: "DGS-1", step: "brainstorming", session_id: "s1", ts: "2026-10-10T01:00:01Z" });
    reg.append({ kind: "session", ticket: "DGS-2", session_id: "s2", source: "claude-code", role: "worker", ts: "2026-10-10T02:00:00Z" });
    expect(reg.read("DGS-1")).toHaveLength(2);
    expect(reg.read("DGS-2")).toHaveLength(1);
    expect(readFileSync(join(dir, "DGS-1.jsonl"), "utf-8").trim().split("\n")).toHaveLength(2);
  });

  it("returns an empty list for a ticket with no file", () => {
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    expect(reg.read("DGS-9")).toEqual([]);
  });

  it("skips malformed lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "reg-"));
    const reg = createDepotRegistry(dir);
    reg.append({ kind: "session", ticket: "DGS-1", session_id: "s1", source: "claude-code", role: "worker", ts: "t" });
    // simulate a torn write
    appendFileSync(join(dir, "DGS-1.jsonl"), "{broken\n");
    expect(reg.read("DGS-1")).toHaveLength(1);
  });

  it("rejects a ticket key that could escape the directory", () => {
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    expect(() => reg.read("../x")).toThrow(/ticket/);
  });
  it("skips valid JSON lines that are not registry entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "reg-"));
    const reg = createDepotRegistry(dir);
    reg.append({ kind: "session", ticket: "DGS-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T01:00:00Z" });
    appendFileSync(join(dir, "DGS-1.jsonl"), ["null", "[]", "5", '"x"', '{"kind":"session"}', '{"kind":"other","ts":"t"}', '{"kind":"step_start","ticket":"DGS-1","step":"nope","session_id":"s1","ts":"t"}', '{"kind":"step_end","ticket":"DGS-1","step":"finishing","session_id":2,"ts":"t"}'].join("\n") + "\n");
    reg.append({ kind: "step_start", ticket: "DGS-1", step: "finishing", session_id: "s1", ts: "2026-10-10T02:00:00Z" });
    const out = reg.read("DGS-1");
    expect(out.map((e) => e.kind)).toEqual(["session", "step_start"]);
  });
  it("keeps the next entry when the file ends in a torn line without a newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "reg-"));
    const reg = createDepotRegistry(dir);
    reg.append({ kind: "session", ticket: "DGS-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T01:00:00Z" });
    appendFileSync(join(dir, "DGS-1.jsonl"), '{"kind":"step_sta');
    reg.append({ kind: "step_start", ticket: "DGS-1", step: "finishing", session_id: "s1", ts: "2026-10-10T02:00:00Z" });
    expect(reg.read("DGS-1").map((e) => e.kind)).toEqual(["session", "step_start"]);
  });
});
