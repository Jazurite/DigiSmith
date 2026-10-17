import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createTimeInStatusCommand } from "./time-in-status.ts";
import { handlerOf } from "./handler-of.test-util.ts";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

const reply = { current_status: { status: "refinement", total_time: { by_minute: 12 } }, status_history: [{ status: "concept", total_time: { by_minute: 30 } }] };
function client() {
  return { getTaskByRef: vi.fn().mockResolvedValue({ id: "abc" }), get: vi.fn().mockResolvedValue(reply) } as unknown as ClickUpClient;
}

describe("clickup time-in-status", () => {
  it("resolves the key and prints the time in each status", async () => {
    const c = client();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await handlerOf(createTimeInStatusCommand(() => c))({ task: "DGS-549" });
    expect(c.get).toHaveBeenCalledWith("/task/abc/time_in_status");
    expect(JSON.parse(log.mock.calls[0][0])).toEqual(reply);
    expect(process.exitCode).toBe(0);
  });
  it("prints the error and exits 1 when ClickUp refuses (for example the ClickApp is off)", async () => {
    const c = { getTaskByRef: vi.fn().mockResolvedValue({ id: "abc" }), get: vi.fn().mockRejectedValue(new Error("Time in Status is not enabled")) } as unknown as ClickUpClient;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await handlerOf(createTimeInStatusCommand(() => c))({ task: "DGS-549" });
    expect(err.mock.calls[0][0]).toBe("clickup time-in-status: Time in Status is not enabled");
    expect(process.exitCode).toBe(1);
  });
});
