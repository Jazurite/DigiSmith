import { describe, it, expect, vi } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { resolveTaskId } from "./refs.ts";

describe("resolveTaskId", () => {
  it("returns a raw id as is, with no call", async () => {
    const getTaskByRef = vi.fn();
    expect(await resolveTaskId({ getTaskByRef } as unknown as ClickUpClient, "14zcebru2pr")).toBe("14zcebru2pr");
    expect(getTaskByRef).not.toHaveBeenCalled();
  });

  it("looks a key up and returns the real id", async () => {
    const getTaskByRef = vi.fn().mockResolvedValue({ id: "14zcebru2pr" });
    expect(await resolveTaskId({ getTaskByRef } as unknown as ClickUpClient, "DGS-81")).toBe("14zcebru2pr");
    expect(getTaskByRef).toHaveBeenCalledWith("DGS-81");
  });

  it("detects a lowercase key and sends it unchanged; ClickUp decides", async () => {
    const getTaskByRef = vi.fn().mockResolvedValue({ id: "x1" });
    expect(await resolveTaskId({ getTaskByRef } as unknown as ClickUpClient, "dgs-81")).toBe("x1");
    expect(getTaskByRef).toHaveBeenCalledWith("dgs-81");
  });

  it("says a key was not found on a 404", async () => {
    const getTaskByRef = vi.fn().mockRejectedValue(Object.assign(new Error("Request failed with status code 404"), { response: { status: 404 } }));
    await expect(resolveTaskId({ getTaskByRef } as unknown as ClickUpClient, "DGS-999")).rejects.toThrow(
      "task key DGS-999 not found (checked with custom_task_ids and the team id)",
    );
  });

  it("keeps other errors unchanged", async () => {
    const err = Object.assign(new Error("Request failed with status code 500"), { response: { status: 500 } });
    const getTaskByRef = vi.fn().mockRejectedValue(err);
    await expect(resolveTaskId({ getTaskByRef } as unknown as ClickUpClient, "DGS-81")).rejects.toBe(err);
  });
});
