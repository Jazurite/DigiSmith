import { describe, it, expect, vi } from "vitest";
import { ClickUpApiError, type ClickUpClient } from "@digismith/clickup-client";
import { parseFieldArg, resolveField, resolveValue, resolveFieldArgs, applyFields, parseRelationValue, parseDateTimeValue, findFieldMismatches, type ResolvedField } from "./field-set.ts";

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
    const err = new ClickUpApiError("Request failed with status code 404", { method: "POST", path: "/task/t1/field/f1", status: 404, body: { err: "Field not found" } });
    const client = { setCustomField: vi.fn().mockRejectedValue(err) } as unknown as ClickUpClient;
    await expect(applyFields(client, "t1", [{ field: fields[0], value: "o1" }])).rejects.toThrow(
      /setting field "ClickUp API Type" on task t1 failed: Request failed with status code 404 \{"err":"Field not found"\}/
    );
  });
});

describe("applyFields with a client error that already carries the body", () => {
  it("does not print the body twice", async () => {
    const err = new ClickUpApiError('Request failed with status code 400: {"err":"bad"}', { method: "POST", path: "/task/t1/field/f1", status: 400, body: { err: "bad" } });
    const client = { setCustomField: vi.fn().mockRejectedValue(err) } as unknown as ClickUpClient;
    await expect(applyFields(client, "t1", [{ field: fields[0], value: "o1" }])).rejects.toThrow(
      /^setting field "ClickUp API Type" on task t1 failed: Request failed with status code 400: \{"err":"bad"\}$/
    );
  });
});

describe("applyFields with a string error body", () => {
  it("does not print the body twice", async () => {
    const err = new ClickUpApiError("Request failed with status code 400: Bad input", { method: "POST", path: "/task/t1/field/f1", status: 400, body: "Bad input" });
    const client = { setCustomField: vi.fn().mockRejectedValue(err) } as unknown as ClickUpClient;
    await expect(applyFields(client, "t1", [{ field: fields[0], value: "o1" }])).rejects.toThrow(/400: Bad input$/);
  });
});

describe("Relationship fields", () => {
  const rel = plain("f20", "Epic", "list_relationship");
  const byKey: Record<string, string> = { "DGS-343": "id343", "DGS-344": "id344" };
  const clientWith = (setCustomField = vi.fn().mockResolvedValue(undefined)) =>
    ({
      getListFields: vi.fn().mockResolvedValue([...fields, rel]),
      getTaskByRef: vi.fn(async (ref: string) => {
        if (ref in byKey) return { id: byKey[ref] };
        if (ref === "rawid" || Object.values(byKey).includes(ref)) return { id: ref };
        throw new Error(`no task ${ref}`);
      }),
      setCustomField,
    }) as unknown as ClickUpClient;

  it("parseRelationValue splits on commas and reads a - prefix as remove", () => {
    expect(parseRelationValue("DGS-343, DGS-344,-rawid")).toEqual({ add: ["DGS-343", "DGS-344"], rem: ["rawid"] });
  });
  it("parseRelationValue refuses an empty item and the same task added and removed", () => {
    expect(() => parseRelationValue("DGS-1,,DGS-2")).toThrow("empty");
    expect(() => parseRelationValue("-")).toThrow("empty");
    expect(() => parseRelationValue("DGS-1,-DGS-1")).toThrow("both added and removed");
  });
  it("resolves keys to task ids and sends {add, rem}", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const client = clientWith(set);
    const resolved = await resolveFieldArgs(client, "L", ["Epic=DGS-343,DGS-344", "Epic=-rawid"]);
    await applyFields(client, "t1", resolved);
    expect(set).toHaveBeenNthCalledWith(1, "t1", "f20", { add: ["id343", "id344"], rem: [] });
    expect(set).toHaveBeenNthCalledWith(2, "t1", "f20", { add: [], rem: ["rawid"] });
  });
  it("an unknown key is an error before any write", async () => {
    const set = vi.fn();
    await expect(resolveFieldArgs(clientWith(set), "L", ["Epic=DGS-999"])).rejects.toThrow(/DGS-999/);
    expect(set).not.toHaveBeenCalled();
  });
  it("refuses a key in add and its id in rem after resolving", async () => {
    const set = vi.fn();
    await expect(resolveFieldArgs(clientWith(set), "L", ["Epic=DGS-343,-id343"])).rejects.toThrow("both added and removed");
    expect(set).not.toHaveBeenCalled();
  });
  it("refuses the same task added in one --field and removed in another on the same field", async () => {
    const set = vi.fn();
    await expect(resolveFieldArgs(clientWith(set), "L", ["Epic=DGS-343", "Epic=-DGS-343"])).rejects.toThrow("both added and removed");
    expect(set).not.toHaveBeenCalled();
  });
  it("refuses a ref that is not an id or a key before any lookup", async () => {
    const client = clientWith();
    await expect(resolveFieldArgs(client, "L", ["Epic=../list/123"])).rejects.toThrow(/not a task id or key/);
    await expect(resolveFieldArgs(client, "L", ["Epic=a b"])).rejects.toThrow(/not a task id or key/);
    expect(client.getTaskByRef).not.toHaveBeenCalled();
  });
  it("sends a repeated ref once", async () => {
    const resolved = await resolveFieldArgs(clientWith(), "L", ["Epic=DGS-343,DGS-343"]);
    expect(resolved[0].value).toEqual({ add: ["id343"], rem: [] });
  });
  it("allows spaces around the - prefix", () => {
    expect(parseRelationValue(" - DGS-343 , DGS-344 ")).toEqual({ add: ["DGS-344"], rem: ["DGS-343"] });
  });
  it("accepts the tasks type name and a lower-case key", async () => {
    const tasks = plain("f21", "Initiative", "tasks");
    const client = clientWith();
    (client.getListFields as ReturnType<typeof vi.fn>).mockResolvedValue([tasks]);
    (client.getTaskByRef as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "id1" });
    const resolved = await resolveFieldArgs(client, "L", ["Initiative=dgs-1"]);
    expect(client.getTaskByRef).toHaveBeenCalledWith("dgs-1");
    expect(resolved[0].value).toEqual({ add: ["id1"], rem: [] });
  });
  it("other unsupported types are still refused", async () => {
    await expect(resolveFieldArgs(clientWith(), "L", ["Tags=x"])).rejects.toThrow("not supported by --field");
  });
});

describe("date fields", () => {
  const dateField = { id: "fd", name: "Scheduled at", type: "date" };
  it("reads YYYY-MM-DD HH:MM as UTC+7", () => {
    expect(parseDateTimeValue("2026-10-25 22:00", "Scheduled at")).toBe(Date.parse("2026-10-25T15:00:00Z"));
  });
  it("reads an ISO time with an offset", () => {
    expect(parseDateTimeValue("2026-10-25T22:00:00+07:00", "Scheduled at")).toBe(Date.parse("2026-10-25T15:00:00Z"));
  });
  it("reads an ISO time ending in Z", () => {
    expect(parseDateTimeValue("2026-10-25T15:00:00Z", "Scheduled at")).toBe(Date.parse("2026-10-25T15:00:00Z"));
  });
  it("refuses a plain day, a missing offset and a day that does not exist", () => {
    for (const bad of ["2026-10-25", "2026-10-25T22:00", "2026-02-30 10:00", "tomorrow", "2026-10-25 24:00"]) {
      expect(() => parseDateTimeValue(bad, "Scheduled at")).toThrow(/Scheduled at/);
    }
  });
  it("resolveFieldArgs gives the ms and time: true; applyFields sends value_options", async () => {
    const setCustomField = vi.fn();
    const client = { getListFields: vi.fn().mockResolvedValue([dateField]), setCustomField } as unknown as ClickUpClient;
    const resolved = await resolveFieldArgs(client, "l1", ["Scheduled at=2026-10-25 22:00"]);
    expect(resolved).toEqual([{ field: dateField, value: Date.parse("2026-10-25T15:00:00Z"), valueOptions: { time: true } }]);
    await applyFields(client, "t1", resolved);
    expect(setCustomField).toHaveBeenCalledWith("t1", "fd", Date.parse("2026-10-25T15:00:00Z"), { time: true });
  });
  it("other fields are sent without value options", async () => {
    const setCustomField = vi.fn();
    const client = { setCustomField } as unknown as ClickUpClient;
    await applyFields(client, "t1", [{ field: { id: "x", name: "N", type: "text" }, value: "a" }]);
    expect(setCustomField).toHaveBeenCalledWith("t1", "x", "a");
  });
});

describe("findFieldMismatches", () => {
  const signOff = {
    id: "fs",
    name: "Sign-off",
    type: "drop_down",
    type_config: { options: [{ id: "s-auto", name: "Auto", orderindex: 0 }, { id: "s-jack", name: "Jack", orderindex: 1 }] },
  };
  const mode = {
    id: "fm",
    name: "Mode",
    type: "drop_down",
    type_config: { options: [{ id: "m-auto", name: "Autonomous", orderindex: 0 }, { id: "m-man", name: "Manual", orderindex: 1 }] },
  };
  const want = [
    { field: signOff, value: "s-auto" },
    { field: mode, value: "m-man" },
  ] as ResolvedField[];

  it("returns nothing when every dropdown value matches", () => {
    const task = { custom_fields: [{ id: "fs", value: 0 }, { id: "fm", value: 1 }] };
    expect(findFieldMismatches(task, want)).toEqual([]);
  });

  it("reports Mode read as Autonomous when Manual was set", () => {
    const task = { custom_fields: [{ id: "fs", value: 0 }, { id: "fm", value: 0 }] };
    expect(findFieldMismatches(task, want)).toEqual([{ id: "fm", field: "Mode", wanted: "Manual (1)", got: "Autonomous (0)" }]);
  });

  it("accepts a dropdown value given as the option id", () => {
    const task = { custom_fields: [{ id: "fs", value: "s-auto" }, { id: "fm", value: "m-man" }] };
    expect(findFieldMismatches(task, want)).toEqual([]);
  });

  it("reports an empty value", () => {
    const task = { custom_fields: [{ id: "fs", value: 0 }] };
    expect(findFieldMismatches(task, want)).toEqual([{ id: "fm", field: "Mode", wanted: "Manual (1)", got: "(empty)" }]);
    expect(findFieldMismatches({}, [want[1]])).toEqual([{ id: "fm", field: "Mode", wanted: "Manual (1)", got: "(empty)" }]);
  });

  it("compares text, number and checkbox with ===", () => {
    const resolved = [
      { field: plain("t1", "Notes", "text"), value: "hello" },
      { field: plain("n1", "Points", "number"), value: 3 },
      { field: plain("c1", "Done", "checkbox"), value: true },
    ] as ResolvedField[];
    const good = { custom_fields: [{ id: "t1", value: "hello" }, { id: "n1", value: 3 }, { id: "c1", value: true }] };
    expect(findFieldMismatches(good, resolved)).toEqual([]);
    const bad = { custom_fields: [{ id: "t1", value: "bye" }, { id: "n1", value: 4 }, { id: "c1", value: false }] };
    expect(findFieldMismatches(bad, resolved)).toEqual([
      { id: "t1", field: "Notes", wanted: "hello", got: "bye" },
      { id: "n1", field: "Points", wanted: "3", got: "4" },
      { id: "c1", field: "Done", wanted: "true", got: "false" },
    ]);
  });

  it("trims a string read before comparing text", () => {
    const resolved = [{ field: plain("t1", "Notes", "text"), value: "hello" }] as ResolvedField[];
    expect(findFieldMismatches({ custom_fields: [{ id: "t1", value: " hello\n" }] }, resolved)).toEqual([]);
  });

  it("compares number and currency numerically", () => {
    const resolved = [
      { field: plain("n1", "Points", "number"), value: 3 },
      { field: plain("n2", "Cost", "currency"), value: 2.5 },
    ] as ResolvedField[];
    expect(findFieldMismatches({ custom_fields: [{ id: "n1", value: "3" }, { id: "n2", value: "2.5" }] }, resolved)).toEqual([]);
    expect(findFieldMismatches({ custom_fields: [{ id: "n1", value: "4" }] }, resolved)).toEqual([
      { id: "n1", field: "Points", wanted: "3", got: "4" },
      { id: "n2", field: "Cost", wanted: "2.5", got: "(empty)" },
    ]);
  });

  it("treats an empty checkbox read as false and accepts string booleans", () => {
    const off = [{ field: plain("c1", "Done", "checkbox"), value: false }] as ResolvedField[];
    const on = [{ field: plain("c1", "Done", "checkbox"), value: true }] as ResolvedField[];
    expect(findFieldMismatches({ custom_fields: [] }, off)).toEqual([]);
    expect(findFieldMismatches({ custom_fields: [{ id: "c1", value: "false" }] }, off)).toEqual([]);
    expect(findFieldMismatches({ custom_fields: [{ id: "c1", value: "true" }] }, on)).toEqual([]);
    expect(findFieldMismatches({ custom_fields: [] }, on)).toEqual([{ id: "c1", field: "Done", wanted: "true", got: "false" }]);
  });

  it("skips date and relationship fields", () => {
    const resolved = [
      { field: plain("d1", "Due", "date"), value: 1 },
      { field: plain("r1", "Epic", "list_relationship"), value: { add: ["x"], rem: [] } },
    ] as ResolvedField[];
    expect(findFieldMismatches({ custom_fields: [] }, resolved)).toEqual([]);
  });
});
