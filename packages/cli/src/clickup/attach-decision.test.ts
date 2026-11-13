import { describe, expect, it } from "vitest";
import { decideAttach } from "./attach-decision.ts";

const rec = (sha: string, id = "1") => ({ name: "plan.md", sha256: sha, id, attached_at: "t" });
describe("decideAttach", () => {
  it("skips an unchanged file still on the task", () => {
    expect(decideAttach({ name: "plan.md", sha256: "a", recorded: [rec("a")], onTask: [{ id: "1", title: "plan.md" }] })).toEqual({ action: "skip", reason: "unchanged" });
  });
  it("uploads again when the recorded copy is gone from the task", () => {
    expect(decideAttach({ name: "plan.md", sha256: "a", recorded: [rec("a")], onTask: [] }).action).toBe("upload");
  });
  it("names the superseded id when the content changed", () => {
    expect(decideAttach({ name: "plan.md", sha256: "b", recorded: [rec("a", "9")], onTask: [{ id: "9", title: "plan.md" }] })).toEqual({ action: "upload", supersedes: "9" });
  });
  it("warns on an unknown same-named attachment", () => {
    const d = decideAttach({ name: "plan.md", sha256: "b", recorded: [], onTask: [{ id: "5", title: "plan.md" }] });
    expect(d).toMatchObject({ action: "upload" });
    expect((d as { warn?: string }).warn).toMatch(/unknown to the depot/);
  });
  it("warns when the recorded copy is gone but a same-titled one is on the task", () => {
    expect(decideAttach({ name: "plan.md", sha256: "a", recorded: [rec("a", "1")], onTask: [{ id: "7", title: "plan.md" }] }))
      .toEqual({ action: "upload", warn: "a same-titled attachment is already on the task" });
  });
  it("uploads a new name", () => {
    expect(decideAttach({ name: "spec.md", sha256: "a", recorded: [], onTask: [] })).toEqual({ action: "upload" });
  });
});
