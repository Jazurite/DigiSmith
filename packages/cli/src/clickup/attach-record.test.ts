import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createAttachRecordCommand } from "./attach-record.ts";
import { handlerOf } from "./handler-of.test-util.ts";

let dir: string; let file: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ar-")); process.env.DIGISMITH_TOKEN_REGISTRY_DIR = dir; file = join(dir, "plan.md"); writeFileSync(file, "v1"); });
afterEach(() => { delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR; rmSync(dir, { recursive: true, force: true }); process.exitCode = 0; vi.restoreAllMocks(); });

const run = (client: Partial<ClickUpClient>, argv: { task: string; file: string }) =>
  handlerOf<typeof argv>(createAttachRecordCommand(() => client as ClickUpClient))(argv);

describe("attach-record", () => {
  it("uploads a new file and records it", async () => {
    const uploadAttachment = vi.fn().mockResolvedValue({ id: "a1" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment } as never, { task: "DGS-9", file });
    expect(uploadAttachment).toHaveBeenCalledWith("t1", file);
    expect(log).toHaveBeenCalledWith("attached plan.md (a1)");
  });
  it("a second run with the same content uploads nothing", async () => {
    const uploadAttachment = vi.fn().mockResolvedValue({ id: "a1" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const getTaskByRef = vi.fn().mockResolvedValueOnce({ id: "t1", attachments: [] }).mockResolvedValue({ id: "t1", attachments: [{ id: "a1", title: "plan.md" }] });
    await run({ getTaskByRef, uploadAttachment } as never, { task: "DGS-9", file });
    await run({ getTaskByRef, uploadAttachment } as never, { task: "DGS-9", file });
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
  });
  it("prints superseded and keeps the old copy when the content changed", async () => {
    const uploadAttachment = vi.fn().mockResolvedValueOnce({ id: "a1" }).mockResolvedValueOnce({ id: "a2" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const getTaskByRef = vi.fn().mockResolvedValueOnce({ id: "t1", attachments: [] }).mockResolvedValue({ id: "t1", attachments: [{ id: "a1", title: "plan.md" }] });
    await run({ getTaskByRef, uploadAttachment } as never, { task: "DGS-9", file });
    writeFileSync(file, "v2");
    await run({ getTaskByRef, uploadAttachment } as never, { task: "DGS-9", file });
    expect(log).toHaveBeenCalledWith("superseded: a1");
    expect(uploadAttachment).toHaveBeenCalledTimes(2);
  });
  it("skips a non-ClickUp key without a client call", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const factory = vi.fn();
    await handlerOf<{ task: string; file: string }>(createAttachRecordCommand(factory as never))({ task: "EMKT-1", file });
    expect(log).toHaveBeenCalledWith("not a ClickUp key, skipped");
    expect(factory).not.toHaveBeenCalled();
  });
  it("skips a missing file with exit 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({} as never, { task: "DGS-9", file: join(dir, "nope.html") });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not found"));
    expect(process.exitCode).toBe(0);
  });
  it("warns and sets exit 1 when the upload fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment: vi.fn().mockRejectedValue(new Error("boom")) } as never, { task: "DGS-9", file });
    expect(err).toHaveBeenCalledWith("warn: boom");
    expect(process.exitCode).toBe(1);
  });
  const watched = (base: Record<string, unknown>) => {
    const deletes: string[] = [];
    const client = new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : /delete/i.test(String(k)) ? (...a: unknown[]) => { deletes.push(String(k)); return a; } : undefined) });
    return { client, deletes };
  };
  it("never calls a delete on the upload, skip and warn paths", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const up = watched({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment: vi.fn().mockResolvedValue({ id: "a1" }) });
    await run(up.client as never, { task: "DGS-9", file });
    const skip = watched({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [{ id: "a1", title: "plan.md" }] }), uploadAttachment: vi.fn() });
    await run(skip.client as never, { task: "DGS-9", file });
    const warn = watched({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [{ id: "x", title: "plan.md" }] }), uploadAttachment: vi.fn().mockResolvedValue({ id: "a2" }) });
    writeFileSync(file, "v3");
    await run(warn.client as never, { task: "DGS-9", file });
    expect([...up.deletes, ...skip.deletes, ...warn.deletes]).toEqual([]);
    // sanity: the proxy does record a delete call
    const probe = watched({});
    (probe.client as unknown as { deleteAttachment: () => void }).deleteAttachment();
    expect(probe.deletes).toEqual(["deleteAttachment"]);
  });
  it("names the attachment by the file's basename and warns on a decoy same-title attachment", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const uploadAttachment = vi.fn().mockResolvedValue({ id: "a9" });
    await run({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [{ id: "decoy", title: "plan.md" }] }), uploadAttachment } as never, { task: "DGS-9", file });
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("attached plan.md (a9)");
    expect(log.mock.calls.some((c) => String(c[0]).startsWith("warn:"))).toBe(true);
  });
  it("warns when the record is lost and the same title is on the task", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const uploadAttachment = vi.fn().mockResolvedValue({ id: "a1" });
    await run({ getTaskByRef: vi.fn().mockResolvedValueOnce({ id: "t1", attachments: [] }).mockResolvedValue({ id: "t1", attachments: [{ id: "other", title: "plan.md" }] }), uploadAttachment } as never, { task: "DGS-9", file });
    log.mockClear();
    await run({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [{ id: "other", title: "plan.md" }] }), uploadAttachment } as never, { task: "DGS-9", file });
    expect(log.mock.calls.some((c) => String(c[0]).startsWith("warn:"))).toBe(true);
  });
  it("warns with the id and exits 1 when the record write fails after a good upload", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.DIGISMITH_TOKEN_REGISTRY_DIR = join(file, "not-a-dir");
    await run({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment: vi.fn().mockResolvedValue({ id: "a5" }) } as never, { task: "DGS-9", file });
    const out = [...err.mock.calls, ...log.mock.calls].map((c) => String(c[0]));
    expect(out).toContain("warn: attached plan.md (a5) but the depot record failed; a rerun adds a copy");
    expect(process.exitCode).toBe(1);
  });
  it("says so when no --file is given", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({} as never, { task: "DGS-9" } as never);
    expect(log).toHaveBeenCalledWith("skipped: no --file given");
    expect(process.exitCode).toBe(0);
  });
});
