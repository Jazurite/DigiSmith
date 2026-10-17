import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { parseDateFlag } from "../clickup/parse-date.ts";
import { resolveTaskType } from "../clickup/task-types.ts";
import type { Candidate, ListTarget, NewTicket, Tracker, TicketSnapshot } from "./tracker.ts";
import type { Signoff } from "./types.ts";

const UTC7_MS = 7 * 3_600_000;
const NORMAL_PRIORITY = 3;
const SIGNOFF_FIELD = "Sign-off";
const CANDIDATE_LIMIT = 10;

/** ClickUp stores all-day dates at 04:00 UTC+7; read them back as the UTC+7 day. */
function dayOf(ms: string | null): string | null {
  return ms ? new Date(Number(ms) + UTC7_MS).toISOString().slice(0, 10) : null;
}

function signoffOf(task: ClickUpTask): Signoff {
  const field = task.custom_fields.find((f) => f.name === SIGNOFF_FIELD);
  if (!field || field.type !== "drop_down" || typeof field.value !== "number") return null;
  const name = field.type_config.options.find((o) => o.orderindex === field.value)?.name;
  return name === "Auto" || name === "Jack" ? name : null;
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
}

export class ClickUpTracker implements Tracker {
  private readonly client: ClickUpClient;
  private readonly spaceId: string;

  constructor(client: ClickUpClient, spaceId: string) {
    this.client = client;
    this.spaceId = spaceId;
  }

  private async taskOf(key: string): Promise<ClickUpTask> {
    return this.client.getTaskByRef(key);
  }

  async getTicket(key: string): Promise<TicketSnapshot> {
    const task = await this.taskOf(key);
    const list = await this.client.getList(task.list.id);
    return {
      key,
      status: task.status.status,
      signoff: signoffOf(task),
      startDate: dayOf(task.start_date),
      dueDate: dayOf(task.due_date),
      statuses: list.statuses.map((s) => s.status),
    };
  }

  async setStatus(key: string, status: string): Promise<void> {
    await this.client.updateTask((await this.taskOf(key)).id, { status });
  }

  async setDates(key: string, dates: { start?: string; due?: string }): Promise<void> {
    const body: Parameters<ClickUpClient["updateTask"]>[1] = {};
    if (dates.start) {
      const p = parseDateFlag(dates.start, "start date");
      body.start_date = p.ms;
      body.start_date_time = p.hasTime;
    }
    if (dates.due) {
      const p = parseDateFlag(dates.due, "due date");
      body.due_date = p.ms;
      body.due_date_time = p.hasTime;
    }
    await this.client.updateTask((await this.taskOf(key)).id, body);
  }

  async addComment(key: string, text: string): Promise<void> {
    await this.client.addTaskComment((await this.taskOf(key)).id, text);
  }

  async listTargets(): Promise<ListTarget[]> {
    const [folders, loose] = await Promise.all([this.client.getSpaceFolders(this.spaceId), this.client.getFolderlessLists(this.spaceId)]);
    const out: ListTarget[] = [];
    for (const f of folders) for (const l of f.lists) out.push({ id: l.id, name: l.name, folder: f.name, description: "" });
    for (const l of loose) out.push({ id: l.id, name: l.name, folder: "", description: "" });
    return out;
  }

  async findCandidates(idea: string): Promise<Candidate[]> {
    const want = words(idea);
    const tasks = await this.client.searchTeamTasks(this.spaceId);
    return tasks
      .map((t) => ({ t, score: [...words(t.name)].filter((w) => want.has(w)).length }))
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, CANDIDATE_LIMIT)
      .map(({ t }) => ({ key: t.custom_id ?? t.id, name: t.name, status: t.status.status, list: t.list.name }));
  }

  async createTicket(t: NewTicket): Promise<{ key: string; url: string }> {
    const body: Parameters<ClickUpClient["createTask"]>[1] = { name: t.name, status: "backlog", priority: NORMAL_PRIORITY };
    if (t.description) body.description = t.description;
    const type = resolveTaskType(await this.client.getTaskTypes(), t.type);
    if (type.id !== 0) body.custom_item_id = type.id;
    const created = await this.client.createTask(t.listId, body);
    return { key: created.custom_id ?? created.id, url: created.url };
  }
}
