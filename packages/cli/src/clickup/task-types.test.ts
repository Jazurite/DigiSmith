import { describe, it, expect } from "vitest";
import type { ClickUpTaskType } from "@digismith/clickup-client";
import { resolveTaskType, PLAIN_TASK_TYPE } from "./task-types.ts";

const t = (id: number, name: string, plural: string | null = null): ClickUpTaskType => ({
  id,
  name,
  name_plural: plural,
  description: null,
  avatar: null,
});
const types = [t(1, "Milestone", "Milestones"), t(1005, "Activity", "Activities"), t(1018, "Goal", "Goals"), t(1030, "Epic", "Epics"), t(1031, "Epic", "Big ones")];

describe("resolveTaskType", () => {
  it("matches the singular name, case-insensitive", () => {
    expect(resolveTaskType(types, "goal").id).toBe(1018);
  });
  it("matches the plural name", () => {
    expect(resolveTaskType(types, "Activities").id).toBe(1005);
  });
  it("accepts a numeric id, including 0 for a plain task, without needing it in the list", () => {
    expect(resolveTaskType(types, "1005").id).toBe(1005);
    expect(resolveTaskType(types, "0")).toBe(PLAIN_TASK_TYPE);
  });
  it("accepts the name Task for a plain task", () => {
    expect(resolveTaskType(types, "task").id).toBe(0);
  });
  it("errors on an unknown name and lists the valid names", () => {
    expect(() => resolveTaskType(types, "Saga")).toThrow(/unknown task type "Saga".*Milestone.*Activity.*Goal/);
  });
  it("errors on an unknown id", () => {
    expect(() => resolveTaskType(types, "999")).toThrow(/unknown task type id 999/);
  });
  it("errors when a name matches more than one type and asks for the id", () => {
    expect(() => resolveTaskType(types, "epic")).toThrow(/matches more than one.*1030.*1031.*use the id/s);
  });
});
