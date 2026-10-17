import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildPrompt, parsePick, fileIdea, type FileDeps } from "./file.ts";
import { readState } from "./state.ts";
import { FakeTracker, snapshot } from "./fake-tracker.test-util.ts";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stfile-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const targets = [
  { id: "L5", name: "B.5: Autonomous Engineering", folder: "B: Agentic", description: "" },
  { id: "L0", name: "B.0: Pavilion", folder: "B: Agentic", description: "" },
];
const cands = [{ key: "DGS-3", name: "Steward role keeps sync", status: "refinement", list: "B.5" }];
function tracker() {
  const t = new FakeTracker(snapshot("backlog"));
  t.targets = targets;
  t.candidates = cands;
  return t;
}
const deps = (t: FakeTracker, reply: string | Error): FileDeps => ({
  tracker: t, dir, now: () => new Date("2026-10-18T05:00:00Z"),
  runModel: async () => { if (reply instanceof Error) throw reply; return reply; },
});
const pick = (o: object) => JSON.stringify({ duplicate_of: null, list: "L5", type: "Task", title: "Idea", ...o });

describe("buildPrompt", () => {
  it("names the idea, every list, every candidate, and the rules", () => {
    const p = buildPrompt("Add retries", targets, cands);
    expect(p).toContain("Add retries");
    expect(p).toContain("L5");
    expect(p).toContain("DGS-3");
    expect(p).toMatch(/Pavilion/);
    expect(p).toMatch(/JSON/);
  });
});

describe("parsePick", () => {
  it("accepts a valid pick, also inside a code fence", () => {
    expect(parsePick(pick({}), targets, cands).list).toBe("L5");
    expect(parsePick("```json\n" + pick({}) + "\n```", targets, cands).title).toBe("Idea");
  });
  it("rejects bad JSON, an unknown list, an unknown type, an unknown duplicate and a blank title", () => {
    for (const raw of ["nope", pick({ list: "ZZ" }), pick({ type: "Story" }), pick({ duplicate_of: "DGS-77" }), pick({ title: " " })])
      expect(() => parsePick(raw, targets, cands)).toThrow();
  });
  it("accepts a known duplicate", () => {
    expect(parsePick(pick({ duplicate_of: "DGS-3" }), targets, cands).duplicate_of).toBe("DGS-3");
  });
});

describe("fileIdea", () => {
  it("creates a backlog ticket in the chosen list and writes its state", async () => {
    const t = tracker();
    const lines = (await fileIdea(deps(t, pick({ type: "Spike", title: "Try x" })), "try x")).out;
    expect(t.created).toEqual([{ listId: "L5", name: "Try x", type: "Spike", description: "try x" }]);
    expect(lines[0]).toBe("steward: filed DGS-900 in B.5: Autonomous Engineering as Spike (backlog)");
    expect(readState(dir, "DGS-900")).toMatchObject({ status_written: "backlog", signoff: null });
  });
  it("an explicit --type wins over the model's", async () => {
    const t = tracker();
    await fileIdea(deps(t, pick({ type: "Task" })), "x", { type: "Bug" });
    expect(t.created[0].type).toBe("Bug");
  });
  it("a duplicate creates nothing and names the existing ticket", async () => {
    const t = tracker();
    const lines = (await fileIdea(deps(t, pick({ duplicate_of: "DGS-3" })), "steward sync")).out;
    expect(t.created).toEqual([]);
    expect(lines[0]).toContain("duplicate of DGS-3");
  });
  it("a model failure files a Task in the B.0 Pavilion with a comment", async () => {
    const t = tracker();
    const lines = (await fileIdea(deps(t, new Error("model down")), "lost idea")).out;
    expect(t.created[0]).toMatchObject({ listId: "L0", type: "Task", name: "lost idea" });
    expect(t.comments[0]).toMatch(/filed unsorted: model call failed/);
    expect(lines[0]).toContain("unsorted");
  });
  it("when addComment throws on the fallback path the new key is still printed with a warning", async () => {
    const t = tracker();
    t.addComment = async () => { throw new Error("comment down"); };
    const r = await fileIdea(deps(t, new Error("model down")), "lost idea");
    expect(r.out[0]).toContain("DGS-900");
    expect(r.warn.join("\n")).toMatch(/DGS-900.*comment down/);
  });
  it("malformed model output takes the same fallback", async () => {
    const t = tracker();
    await fileIdea(deps(t, "I think it is a bug"), "lost idea");
    expect(t.created[0].listId).toBe("L0");
  });
  it("with no Pavilion to fall back to, a model failure throws", async () => {
    const t = tracker();
    t.targets = [targets[0]];
    await expect(fileIdea(deps(t, new Error("down")), "x")).rejects.toThrow(/no B\.0 Pavilion/);
  });
  it("rejects a blank idea and a type that is not one of the five", async () => {
    await expect(fileIdea(deps(tracker(), pick({})), "  ")).rejects.toThrow(/idea/);
    await expect(fileIdea(deps(tracker(), pick({})), "x", { type: "Story" })).rejects.toThrow(/type/);
  });
});
