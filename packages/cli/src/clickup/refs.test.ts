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

  it("treats a lowercase key as a key", async () => {
    const getTaskByRef = vi.fn().mockResolvedValue({ id: "x1" });
    expect(await resolveTaskId({ getTaskByRef } as unknown as ClickUpClient, "dgs-81")).toBe("x1");
  });
});
