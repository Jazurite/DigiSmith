import { describe, it, expect } from "vitest";
import type { FrontdoorField } from "@digismith/clickup-client";
import {
  buildFieldPutBody,
  resolveDefault,
  defaultAfterRenames,
  checkDefaultNotRemoved,
  describeFieldDiff,
  resolveOptionRenames,
  resolveOptionAdds,
  resolveOptionRemoves,
} from "./field-write.ts";

const field = (over: object = {}) =>
  ({
    id: "f1",
    name: "Mode",
    type: "drop_down",
    type_config: {
      options: [
        { id: "o1", name: "Autonomous", color: "#7C4DFF", orderindex: 0 },
        { id: "o2", name: "Manual", color: "#1bbc9c", orderindex: 1 },
      ],
    },
    description: null,
    hide_from_guests: false,
    pinned: true,
    required: false,
    required_on_subtasks: false,
    private: false,
    permission_level: null,
    default_value: null,
    members: [],
    groups: [],
    ...over,
  }) as unknown as FrontdoorField;

describe("buildFieldPutBody default", () => {
  it("keeps an existing default on a rename", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    const body = buildFieldPutBody(f, undefined, resolveOptionRenames(f, ["Manual=Hand"]));
    expect(body.default_value).toEqual({ value: "Autonomous" });
  });
  it("keeps an existing default on add-option", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    const body = buildFieldPutBody(f, undefined, [], resolveOptionAdds(f, ["Hybrid"], undefined));
    expect(body.default_value).toEqual({ value: "Autonomous" });
  });
  it("sends null when the field has no default", () => {
    expect(buildFieldPutBody(field(), undefined, []).default_value).toBeNull();
  });
  it("sets the asked default", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    expect(buildFieldPutBody(f, undefined, [], [], [], { value: "Manual" }).default_value).toEqual({ value: "Manual" });
  });
  it("clears with null", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    expect(buildFieldPutBody(f, undefined, [], [], [], null).default_value).toBeNull();
  });
});

describe("resolveDefault", () => {
  it("returns the option NAME for a name (any case) and for an id", () => {
    const f = field();
    expect(resolveDefault(f, "manual")).toEqual({ value: "Manual" });
    expect(resolveDefault(f, "o1")).toEqual({ value: "Autonomous" });
  });
  it('throws "unknown option" and lists the options', () => {
    expect(() => resolveDefault(field(), "Nope")).toThrow(/unknown option "Nope".*Autonomous, Manual/);
  });
});

describe("defaultAfterRenames", () => {
  it("returns the new name when the current default option is renamed", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    expect(defaultAfterRenames(f, resolveOptionRenames(f, ["Autonomous=Auto"]))).toEqual({ value: "Auto" });
  });
  it("returns the current default otherwise", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    expect(defaultAfterRenames(f, resolveOptionRenames(f, ["Manual=Hand"]))).toEqual({ value: "Autonomous" });
    expect(defaultAfterRenames(field(), [])).toBeNull();
  });
});

describe("checkDefaultNotRemoved", () => {
  it("throws when the current default option is removed without a new default or clear", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    const removes = resolveOptionRemoves(f, [], ["Autonomous"]);
    expect(() => checkDefaultNotRemoved(f, removes, undefined)).toThrow(
      'removing "Autonomous" removes the current default; add --default <other> or --clear-default'
    );
  });
  it("passes with --default <other> or clear", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    const removes = resolveOptionRemoves(f, [], ["Autonomous"]);
    expect(() => checkDefaultNotRemoved(f, removes, { value: "Manual" })).not.toThrow();
    expect(() => checkDefaultNotRemoved(f, removes, null)).not.toThrow();
  });
});

describe("describeFieldDiff default line", () => {
  it("prints old -> new when the default changes", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    const lines = describeFieldDiff(f, undefined, [], [], [], { value: "Manual" });
    expect(lines).toContain('  default: "Autonomous" -> "Manual"');
  });
  it("prints none for a missing old default and for a cleared one", () => {
    expect(describeFieldDiff(field(), undefined, [], [], [], { value: "Manual" })).toContain('  default: none -> "Manual"');
    const f = field({ default_value: { value: "Autonomous" } });
    expect(describeFieldDiff(f, undefined, [], [], [], null)).toContain('  default: "Autonomous" -> none');
  });
  it("prints nothing when unchanged or omitted", () => {
    const f = field({ default_value: { value: "Autonomous" } });
    expect(describeFieldDiff(f, undefined, [], [], [], { value: "Autonomous" }).some((l) => l.includes("default:"))).toBe(false);
    expect(describeFieldDiff(f, undefined, []).some((l) => l.includes("default:"))).toBe(false);
    expect(describeFieldDiff(field(), undefined, [], [], [], null).some((l) => l.includes("default:"))).toBe(false);
  });
});
