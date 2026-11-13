import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { runTable } from "../reviewer/table.ts";
import { attachFile, createAttachRecordCommand } from "./attach-record.ts";
import { handlerOf } from "./handler-of.test-util.ts";

vi.mock("../reviewer/table.ts", async (orig) => {
  const actual = await orig<typeof import("../reviewer/table.ts")>();
  return { ...actual, runTable: vi.fn(actual.runTable) };
});

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
    const msg = "warn: attached plan.md (a5) but the depot record failed; a rerun adds a copy";
    expect(err.mock.calls.map((c) => String(c[0]))).toContain(msg);
    expect(log.mock.calls.map((c) => String(c[0]))).not.toContain(msg);
    expect(process.exitCode).toBe(1);
  });
  const failingWrite = () => { mkdirSync(join(dir, `DGS-9.attachments.json.${process.pid}.tmp`)); };
  it("keeps the superseded line when the record write fails", async () => {
    const getTaskByRef = vi.fn().mockResolvedValueOnce({ id: "t1", attachments: [] }).mockResolvedValue({ id: "t1", attachments: [{ id: "a1", title: "plan.md" }] });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getTaskByRef, uploadAttachment: vi.fn().mockResolvedValue({ id: "a1" }) } as never, { task: "DGS-9", file });
    writeFileSync(file, "v2");
    failingWrite();
    const r = await attachFile({ getTaskByRef, uploadAttachment: vi.fn().mockResolvedValue({ id: "a2" }) } as never, "DGS-9", file);
    expect(r.failed).toBe(true);
    expect(r.lines).toContain("superseded: a1");
    expect(r.errorLines.some((l) => l.includes("depot record failed"))).toBe(true);
    expect(r.lines.some((l) => l.includes("depot record failed"))).toBe(false);
  });
  it("keeps the decision warn when the record write fails", async () => {
    failingWrite();
    const r = await attachFile({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [{ id: "decoy", title: "plan.md" }] }), uploadAttachment: vi.fn().mockResolvedValue({ id: "a3" }) } as never, "DGS-9", file);
    expect(r.failed).toBe(true);
    expect(r.lines.some((l) => l.startsWith("warn: same-named attachment"))).toBe(true);
    expect(r.errorLines).toHaveLength(1);
    expect(r.lines.some((l) => l.includes("depot record failed"))).toBe(false);
  });
  it("returns failed false on a clean upload and on a skip", async () => {
    const ok = await attachFile({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment: vi.fn().mockResolvedValue({ id: "a1" }) } as never, "DGS-9", file);
    expect(ok).toEqual({ lines: ["attached plan.md (a1)"], errorLines: [], failed: false });
    const skip = await attachFile({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [{ id: "a1", title: "plan.md" }] }), uploadAttachment: vi.fn() } as never, "DGS-9", file);
    expect(skip.failed).toBe(false);
  });
  it("says so when no --file is given", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({} as never, { task: "DGS-9" } as never);
    expect(log).toHaveBeenCalledWith("skipped: no --file given");
    expect(process.exitCode).toBe(0);
  });
});

describe("attach-record kinds", () => {
  type KArgv = { task: string; kind?: string; workspace?: string; file?: string };
  const runKind = (client: unknown, argv: KArgv) => handlerOf<KArgv>(createAttachRecordCommand(() => client as ClickUpClient))(argv);
  const okClient = (up = vi.fn().mockResolvedValue({ id: "a1" })) => ({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment: up });
  it("renders and attaches the ledger summary under its own name", async () => {
    const ws = join(dir, "ws"); mkdirSync(ws);
    writeFileSync(join(ws, "progress.md"), "# SDD ledger — plan: p.md\nTask 1: complete (commits abc)\n");
    const up = vi.fn().mockResolvedValue({ id: "a1" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runKind(okClient(up), { task: "DGS-9", kind: "ledger-summary", workspace: ws });
    expect(log).toHaveBeenCalledWith("attached ledger-summary.md (a1)");
    expect(up.mock.calls[0][1]).toMatch(/ledger-summary\.md$/);
  });
  it("removes the temp folder after the upload", async () => {
    const ws = join(dir, "ws"); mkdirSync(ws);
    writeFileSync(join(ws, "progress.md"), "# SDD ledger — plan: p.md\n");
    const up = vi.fn().mockResolvedValue({ id: "a1" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runKind(okClient(up), { task: "DGS-9", kind: "ledger-summary", workspace: ws });
    const { existsSync } = await import("node:fs");
    expect(existsSync(up.mock.calls[0][1])).toBe(false);
  });
  it("skips when there is no ledger", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runKind({}, { task: "DGS-9", kind: "ledger-summary", workspace: join(dir, "none") });
    expect(log).toHaveBeenCalledWith("skipped ledger-summary.md: no ledger");
    expect(process.exitCode).toBe(0);
  });
  it("attaches the reviews table under reviews.md", async () => {
    const ws = join(dir, "ws"); mkdirSync(ws);
    vi.mocked(runTable).mockImplementationOnce((o) => { writeFileSync(o.out as string, "| table |"); return { written: true, message: "ok" }; });
    const up = vi.fn().mockResolvedValue({ id: "r1" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runKind(okClient(up), { task: "DGS-9", kind: "reviews", workspace: ws });
    expect(runTable).toHaveBeenCalledWith({ workspace: ws, out: expect.stringMatching(/reviews\.md$/) });
    expect(log).toHaveBeenCalledWith("attached reviews.md (r1)");
    expect(up.mock.calls[0][1]).toMatch(/reviews\.md$/);
  });
  it("skips reviews when the workspace has none", async () => {
    const ws = join(dir, "ws"); mkdirSync(ws);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runKind({}, { task: "DGS-9", kind: "reviews", workspace: ws });
    expect(log).toHaveBeenCalledWith("skipped reviews.md: no reviews found");
    expect(process.exitCode).toBe(0);
  });
  it("refuses --file with --kind", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runKind({}, { task: "DGS-9", file, kind: "reviews", workspace: dir });
    expect(err).toHaveBeenCalledWith(expect.stringContaining("--file"));
    expect(process.exitCode).toBe(1);
  });
  it("sets exit 1 when the record write fails for a rendered kind", async () => {
    const ws = join(dir, "ws"); mkdirSync(ws);
    writeFileSync(join(ws, "progress.md"), "# SDD ledger — plan: p.md\n");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.DIGISMITH_TOKEN_REGISTRY_DIR = join(file, "not-a-dir");
    await runKind(okClient(), { task: "DGS-9", kind: "ledger-summary", workspace: ws });
    expect(err.mock.calls.some((c) => String(c[0]).includes("depot record failed"))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});
