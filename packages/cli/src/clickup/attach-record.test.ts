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

const run = (client: Partial<ClickUpClient>, argv: { task: string; file: string; name?: string }) =>
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
  it("never calls a delete", async () => {
    const client = { getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment: vi.fn().mockResolvedValue({ id: "a1" }) };
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client as never, { task: "DGS-9", file });
    expect(Object.keys(client).some((k) => /delete/i.test(k))).toBe(false);
  });
});
