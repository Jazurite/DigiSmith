import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import type { LoTask, Tracker } from "./types.ts";

/** The Imperium list holds the milestone tasks (probe.md row a). */
export const IMPERIUM_LIST_ID = "1301150000002179";
/** Task type Milestone (probe.md row d). */
export const TYPE_MILESTONE = 1;
/** The V1.1 initiative ("after Dawn") is also a milestone link target. */
export const V11_KEY = "DGS-470";

const KEY = /^[A-Za-z]+-\d+$/;

interface Dependency { task_id?: string; depends_on?: string }
interface Link { task_id?: string; link_id?: string }
interface FieldOption { name?: string; orderindex?: number }
interface Field { name?: string; value?: unknown; type_config?: { options?: FieldOption[] } }

function isDone(t: ClickUpTask): boolean {
  const name = t.status?.status?.toLowerCase();
  return name === "done" || name === "closed";
}

/** The option name of a dropdown field, read by its orderindex value; null when absent or not one of `allowed`. */
function dropdown<T extends string>(t: ClickUpTask, name: string, allowed: readonly T[]): T | null {
  const field = (t.custom_fields as unknown as Field[] | undefined)?.find((f) => f.name === name);
  if (!field || typeof field.value !== "number") return null;
  const option = field.type_config?.options?.find((o) => o.orderindex === field.value);
  return option?.name !== undefined && (allowed as readonly string[]).includes(option.name) ? (option.name as T) : null;
}

/** "Scheduled at" (a date field; ClickUp sends ms as a string). */
function scheduledAt(t: ClickUpTask): number | null | "invalid" {
  const field = (t.custom_fields as unknown as Field[] | undefined)?.find((f) => f.name === "Scheduled at");
  const v = field?.value;
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : "invalid";
}

/** Tracker over the ClickUp API for one space. Reads only, except setStatus and comment. */
export class ClickUpLoTracker implements Tracker {
  private milestones: Promise<Map<string, string>> | null = null;
  private lists: Promise<string[]> | null = null;
  private readonly listStatuses = new Map<string, Promise<string[]>>();

  private readonly client: ClickUpClient;
  private readonly spaceId: string;

  constructor(client: ClickUpClient, spaceId: string) {
    this.client = client;
    this.spaceId = spaceId;
  }

  /**
   * True when any list in the space has the status (the status is not in every list).
   * Stops at the first list that has it; each list's statuses are read at most once per tracker.
   */
  async hasStatus(name: string): Promise<boolean> {
    const want = name.toLowerCase();
    this.lists ??= this.loadLists().catch((err) => { this.lists = null; throw err; });
    const lists = await this.lists;
    for (const id of lists) {
      let read = this.listStatuses.get(id);
      if (!read) {
        read = this.client.getListStatuses(id).catch((err) => { this.listStatuses.delete(id); throw err; });
        this.listStatuses.set(id, read);
      }
      if ((await read).some((s) => s.toLowerCase() === want)) return true;
    }
    return false;
  }

  private async loadLists(): Promise<string[]> {
    const folders = await this.client.getSpaceFolders(this.spaceId);
    const folderless = await this.client.getFolderlessLists(this.spaceId);
    return [...folders.flatMap((f) => f.lists ?? []), ...folderless].map((l) => l.id);
  }

  async listByStatus(name: string): Promise<LoTask[]> {
    const want = name.toLowerCase();
    const all = await this.client.searchTeamTasks(this.spaceId, 10, name);
    const byId = new Map(all.map((t) => [t.id, t]));
    const out: LoTask[] = [];
    for (const hit of all) {
      if (hit.status?.status?.toLowerCase() !== want) continue;
      // Only an Autonomous ticket can be claimed: any other is built from the search hit, with no extra call.
      if (dropdown(hit, "Mode", ["Autonomous", "Manual"] as const) !== "Autonomous") {
        out.push(await this.toLoTask(hit, byId, true));
        continue;
      }
      // Search leaves out attachments: read the full ticket, only for Autonomous tickets in this status.
      const full = await this.client.getTaskByRef(hit.id);
      out.push(await this.toLoTask({ ...hit, ...full, dependencies: full.dependencies ?? hit.dependencies,
        linked_tasks: full.linked_tasks ?? hit.linked_tasks }, byId));
    }
    return out;
  }

  async setStatus(taskId: string, status: string): Promise<void> {
    await this.client.updateTask(taskId, { status });
  }

  async getStatus(taskId: string): Promise<string> {
    return (await this.client.getTaskByRef(taskId)).status.status;
  }

  async comment(ref: string, text: string): Promise<void> {
    const id = KEY.test(ref) ? (await this.client.getTaskByRef(ref)).id : ref;
    await this.client.addTaskComment(id, text);
  }

  /** Milestone task id -> name: Imperium tasks of type Milestone, plus the V1.1 initiative. Read once. */
  private loadMilestones(): Promise<Map<string, string>> {
    this.milestones ??= this.client.getAllListTasks(IMPERIUM_LIST_ID).then((tasks) => new Map(
      tasks.filter((t) => t.custom_item_id === TYPE_MILESTONE || t.custom_id === V11_KEY).map((t) => [t.id, t.name]),
    )).catch((err) => { this.milestones = null; throw err; });
    return this.milestones;
  }

  private async milestone(t: ClickUpTask): Promise<string | null> {
    // Only the link form is read. The older form, where the milestone waits on the ticket through
    // `dependencies` (probe.md row a), is not read: such a ticket reads "no milestone" until it gets a link.
    const names = await this.loadMilestones();
    for (const link of (t.linked_tasks ?? []) as Link[]) {
      const other = link.task_id === t.id ? link.link_id : link.link_id === t.id ? link.task_id : undefined;
      if (other && names.has(other)) return names.get(other)!;
    }
    return null;
  }

  private async blockers(t: ClickUpTask, known: Map<string, ClickUpTask>): Promise<LoTask["blockers"]> {
    const out: LoTask["blockers"] = [];
    for (const dep of (t.dependencies ?? []) as Dependency[]) {
      if (dep.task_id !== t.id || !dep.depends_on) continue;
      let b = known.get(dep.depends_on);
      if (!b) {
        try { b = await this.client.getTaskByRef(dep.depends_on); } catch {
          // A deleted or hidden blocker: keep the ticket blocked instead of failing the scan.
          out.push({ key: `${dep.depends_on} (unreadable)`, done: false });
          continue;
        }
      }
      out.push({ key: b.custom_id ?? b.id, done: isDone(b) });
    }
    return out;
  }

  /** light: from the ticket alone, no API call (milestone null, blockers empty, attachments as given). */
  private async toLoTask(t: ClickUpTask, known: Map<string, ClickUpTask>, light = false): Promise<LoTask> {
    return {
      id: t.id,
      key: t.custom_id ?? null,
      name: t.name,
      typeId: t.custom_item_id ?? 0,
      priority: t.priority ? Number(t.priority.id) : null,
      due: t.due_date ? Number(t.due_date) : null,
      created: Number(t.date_created),
      attachments: (t.attachments ?? []).map((a) => a.title),
      text: t.text_content || t.description || "",
      signOff: dropdown(t, "Sign-off", ["Auto", "Jack"] as const),
      mode: dropdown(t, "Mode", ["Autonomous", "Manual"] as const),
      scheduledAt: scheduledAt(t),
      milestone: light ? null : await this.milestone(t),
      blockers: light ? [] : await this.blockers(t, known),
    };
  }
}
