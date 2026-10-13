import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpAttachment } from "@digismith/clickup-client";
import { createUploadAttachmentCommand } from "./upload-attachment.ts";

describe("createUploadAttachmentCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("uploads the given file to the given task and prints the result as JSON", async () => {
    const attachment = { id: "att1", title: "report.pdf" } as unknown as ClickUpAttachment;
    const uploadAttachment = vi.fn().mockResolvedValue(attachment);
    const fakeClient = { uploadAttachment } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUploadAttachmentCommand(() => fakeClient);

    await (
      command.handler as (argv: { task: string; file: string }) => Promise<void>
    )({ task: "abc", file: "/tmp/report.pdf" });

    expect(uploadAttachment).toHaveBeenCalledWith("abc", "/tmp/report.pdf");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(attachment, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const uploadAttachment = vi.fn().mockRejectedValue(new Error("ENOENT: no such file"));
    const fakeClient = { uploadAttachment } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createUploadAttachmentCommand(() => fakeClient);

    await (
      command.handler as (argv: { task: string; file: string }) => Promise<void>
    )({ task: "abc", file: "/tmp/missing.pdf" });

    expect(errorSpy).toHaveBeenCalledWith("clickup upload-attachment: ENOENT: no such file");
    expect(process.exitCode).toBe(1);
  });

  it("resolves a key to the real id before uploading", async () => {
    const uploadAttachment = vi.fn().mockResolvedValue({ id: "att1" });
    const getTaskByRef = vi.fn().mockResolvedValue({ id: "14zcebru2pr" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUploadAttachmentCommand(() => ({ uploadAttachment, getTaskByRef }) as unknown as ClickUpClient);

    await (command.handler as (argv: { task: string; file: string }) => Promise<void>)({ task: "DGS-81", file: "/tmp/a.pdf" });

    expect(getTaskByRef).toHaveBeenCalledWith("DGS-81");
    expect(uploadAttachment).toHaveBeenCalledWith("14zcebru2pr", "/tmp/a.pdf");
  });

  it("does not look a raw id up", async () => {
    const uploadAttachment = vi.fn().mockResolvedValue({ id: "att1" });
    const getTaskByRef = vi.fn();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUploadAttachmentCommand(() => ({ uploadAttachment, getTaskByRef }) as unknown as ClickUpClient);

    await (command.handler as (argv: { task: string; file: string }) => Promise<void>)({ task: "abc", file: "/tmp/a.pdf" });

    expect(getTaskByRef).not.toHaveBeenCalled();
  });
});
