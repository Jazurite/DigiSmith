import { describe, it, expect, vi } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { parseFieldArg, resolveField, resolveValue, resolveFieldArgs, applyFields } from "./field-set.ts";

const dd = (id: string, name: string, options: { id: string; name: string }[]) => ({
  id,
  name,
  type: "drop_down",
  type_config: { options },
});
const plain = (id: string, name: string, type: string) => ({ id, name, type, type_config: {} });

const apiType = dd("f1", "ClickUp API Type", [
  { id: "o1", name: "Frontdoor" },
  { id: "o2", name: "Public" },
]);
const fields = [
  apiType,
  plain("f2", "Bucket", "currency"),
  plain("f3", "Bucket", "drop_down"),
  plain("f4", "Notes", "text"),
  plain("f5", "Title", "short_text"),
  plain("f6", "Points", "number"),
  plain("f7", "Done", "checkbox"),
  plain("f8", "Cost", "currency"),
  plain("f9", "Tags", "labels"),
  plain("f10", "Progress", "automatic_progress"),
];

describe("parseFieldArg", () => {
  it("splits at the first =", () => {
    expect(parseFieldArg("Notes=a=b")).toEqual({ key: "Notes", value: "a=b" });
  });
  it("rejects an empty name or value, or no =", () => {
    expect(() => parseFieldArg("Notes")).toThrow(/must look like/);
    expect(() => parseFieldArg("=x")).toThrow(/must look like/);
    expect(() => parseFieldArg("Notes=")).toThrow(/must look like/);
  });
});

describe("resolveField", () => {
  it("matches a name case-insensitively", () => {
    expect(resolveField(fields, "clickup api type").id).toBe("f1");
  });
  it("lets a field id win over a name", () => {
    expect(resolveField(fields, "f3").id).toBe("f3");
  });
  it("lists the valid names for an unknown field", () => {
    expect(() => resolveField(fields, "Nope")).toThrow(/unknown field "Nope"; fields: ClickUp API Type, Bucket, Bucket/);
  });
  it("asks for the id when a name matches more than one field", () => {
    expect(() => resolveField(fields, "Bucket")).toThrow(/matches 2 fields.*use the field id: f2 \(currency\), f3 \(drop_down\)/);
  });
});

describe("resolveValue", () => {
  it("drop_down: option name becomes the option id", () => {
    expect(resolveValue(apiType, "frontdoor")).toBe("o1");
  });
  it("drop_down: option id is accepted", () => {
    expect(resolveValue(apiType, "o2")).toBe("o2");
  });
  it("drop_down: unknown option lists the options", () => {
    expect(() => resolveValue(apiType, "Z")).toThrow(/unknown option "Z" for field "ClickUp API Type"; options: Frontdoor, Public/);
  });
  it("drop_down: two options with one name ask for the option id", () => {
    const f = dd("x", "X", [{ id: "a", name: "Same" }, { id: "b", name: "same" }]);
    expect(() => resolveValue(f, "Same")).toThrow(/more than one option.*use the option id/);
  });
  it("text and short_text pass the string", () => {
    expect(resolveValue(fields[3], "hello world")).toBe("hello world");
    expect(resolveValue(fields[4], "hi")).toBe("hi");
  });
  it("number and currency need a finite number", () => {
    expect(resolveValue(fields[5], "3.5")).toBe(3.5);
    expect(resolveValue(fields[7], "12")).toBe(12);
    expect(() => resolveValue(fields[5], "abc")).toThrow(/needs a number/);
    expect(() => resolveValue(fields[7], "Infinity")).toThrow(/needs a number/);
  });
  it("checkbox takes true or false only", () => {
    expect(resolveValue(fields[6], "true")).toBe(true);
    expect(resolveValue(fields[6], "FALSE")).toBe(false);
    expect(() => resolveValue(fields[6], "yes")).toThrow(/true or false/);
  });
  it("labels and automatic_progress are not supported", () => {
    expect(() => resolveValue(fields[8], "a")).toThrow(/field type labels is not supported by --field/);
    expect(() => resolveValue(fields[9], "1")).toThrow(/field type automatic_progress is not supported/);
  });
});

describe("applyFields", () => {
  it("resolves every arg before any write", async () => {
    const setCustomField = vi.fn();
    const client = { getListFields: vi.fn().mockResolvedValue(fields), setCustomField } as unknown as ClickUpClient;
    const resolved = await resolveFieldArgs(client, "L", ["Notes=ok", "Nope=1"]).catch((e: Error) => e);
    expect(resolved).toBeInstanceOf(Error);
    expect(setCustomField).not.toHaveBeenCalled();
  });
  it("sets each resolved field", async () => {
    const setCustomField = vi.fn().mockResolvedValue(undefined);
    const client = { getListFields: vi.fn().mockResolvedValue(fields), setCustomField } as unknown as ClickUpClient;
    const resolved = await resolveFieldArgs(client, "L", ["ClickUp API Type=Public", "Points=2"]);
    await applyFields(client, "t1", resolved);
    expect(setCustomField).toHaveBeenNthCalledWith(1, "t1", "f1", "o2");
    expect(setCustomField).toHaveBeenNthCalledWith(2, "t1", "f6", 2);
    expect(client.getListFields).toHaveBeenCalledTimes(1);
  });
  it("names the field and shows ClickUp's error body when a write fails", async () => {
    const err = Object.assign(new Error("Request failed with status code 404"), { response: { data: { err: "Field not found" } } });
    const client = { setCustomField: vi.fn().mockRejectedValue(err) } as unknown as ClickUpClient;
    await expect(applyFields(client, "t1", [{ field: fields[0], value: "o1" }])).rejects.toThrow(
      /setting field "ClickUp API Type" on task t1 failed: Request failed with status code 404 \{"err":"Field not found"\}/
    );
  });
});
