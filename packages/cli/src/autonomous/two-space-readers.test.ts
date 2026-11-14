import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { ClickUpLoTracker } from "./tracker-clickup.ts";
import { runScheduleRelease } from "./schedule-release.ts";
import { driftLines, gatherDrift } from "./drift.ts";
import { TICKET_RE } from "./phase-types.ts";
import { readEvents } from "./state.ts";

const NOW = new Date("2026-11-14T10:00:00.000Z");
const modeField = { id: "fm", name: "Mode", type: "drop_down", value: 0, type_config: { options: [{ name: "Autonomous", orderindex: 0 }, { name: "Manual", orderindex: 1 }] } };
const scheduledField = { id: "fs", name: "Scheduled at", type: "date", value: String(NOW.getTime() - 60_000) };
const ocl = (status: string) => ({
  id: "o1", custom_id: "OCL-106", custom_item_id: 0, name: "Guardrails pin", text_content: "", description: "",
  status: { status, type: "custom" }, date_created: "1000", due_date: null, priority: null,
  custom_fields: [modeField, scheduledField], dependencies: [], linked_tasks: [], attachments: [],
});

function twoSpaceClient() {
  const state = { status: "scheduled" };
  const updates: string[] = [];
  const client = {
    async searchTeamTasks(space: string, _p: number, status?: string) {
      return space === "S2" && status?.toLowerCase() === state.status ? [ocl(state.status)] : [];
    },
    async getTaskByRef(ref: string) { if (ref !== "o1" && ref !== "OCL-106") throw new Error(`no ${ref}`); return ocl(state.status); },
    async updateTask(id: string, body: { status?: string }) { updates.push(`${id} ${body.status}`); if (body.status) state.status = body.status; return ocl(state.status); },
    async addTaskComment() { return { id: 1 }; },
    async getAllListTasks() { return []; },
  };
  return { client: client as unknown as ClickUpClient, updates, state };
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "two-space-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("readers over the merged tracker", () => {
  it("schedule-release moves a due OCL ticket from the Oculus space to to do", async () => {
    const { client, updates } = twoSpaceClient();
    const tracker = new ClickUpLoTracker(client, ["S1", "S2"]);
    const r = await runScheduleRelease({ tracker, dir, now: () => NOW, dryRun: false });
    expect(updates).toEqual(["o1 to do"]);
    expect(r).toMatchObject({ scheduled: 1, moved: 1 });
    const ev = readEvents(dir, NOW.getTime() - 86_400_000, NOW.getTime() + 86_400_000);
    expect(ev.map((e) => [e.kind, e.ticket])).toEqual([["schedule-move", "OCL-106"]]);
  });
  it("the report's drift check reads an OCL ticket's status", async () => {
    const { client } = twoSpaceClient();
    const tracker = new ClickUpLoTracker(client, ["S1", "S2"]);
    const git = (() => "") as never;
    const facts = await gatherDrift({ tracker, git, repo: "/nope" }, [{ ticket: "OCL-106", taskId: "o1" }]);
    expect(facts.get("OCL-106")?.status).toBe("scheduled");
    const drifted = new Map([["OCL-106", { ...facts.get("OCL-106")!, mergedSha: "abc1234" }]]);
    const out = driftLines([{ ticket: "OCL-106", taskId: "o1" }], drifted).join("\n");
    expect(out).toContain("OCL-106: scheduled in ClickUp, merged on main (abc1234)");
    expect(out).not.toContain("DGS");
  });
  it("the watchdog's ticket key rule accepts an OCL key", () => {
    expect(TICKET_RE.test("OCL-106")).toBe(true);
  });
});
