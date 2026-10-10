import { describe, it, expect } from "vitest";
import type { ClickUpTaskType } from "@digismith/clickup-client";
import { assertNameFree, assertCustomType } from "./task-type-write.ts";

const t = (id: number, name: string, plural: string | null): ClickUpTaskType => ({
  id,
  name,
  name_plural: plural,
  description: null,
  avatar: null,
});
const types = [t(1, "milestone", null), t(1005, "Activity", "Activities")];

describe("assertNameFree", () => {
  it("passes for a name no type has", () => {
    expect(() => assertNameFree(types, ["Epic", "Epics"])).not.toThrow();
  });
  it("fails on an existing singular, plural or built-in name, case-insensitive", () => {
    expect(() => assertNameFree(types, ["activity", "x"])).toThrow(/already used by .*Activity \(1005\)/);
    expect(() => assertNameFree(types, ["x", "ACTIVITIES"])).toThrow(/already used/);
    expect(() => assertNameFree(types, ["Milestone", "x"])).toThrow(/already used/);
  });
  it("fails on the reserved plain task name", () => {
    expect(() => assertNameFree(types, ["Task", "x"])).toThrow(/already used/);
  });
  it("ignores the type being edited", () => {
    expect(() => assertNameFree(types, ["Activity", "Activities"], 1005)).not.toThrow();
  });
});

describe("assertCustomType", () => {
  it("rejects built-in ids below 1000, including 0", () => {
    expect(() => assertCustomType(t(1, "milestone", null))).toThrow(/built-in/);
    expect(() => assertCustomType(t(0, "Task", "Tasks"))).toThrow(/built-in/);
  });
  it("accepts a custom type", () => {
    expect(() => assertCustomType(t(1005, "Activity", "Activities"))).not.toThrow();
  });
});
