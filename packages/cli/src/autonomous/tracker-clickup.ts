import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import type { LoTask, Tracker } from "./types.ts";

/** The Imperium list holds the milestone tasks (probe.md row a). */
export const IMPERIUM_LIST_ID = "1301150000002179";
/** Task type Milestone (probe.md row d). */
export const TYPE_MILESTONE = 1;
/** The V1.1 initiative ("after Dawn") is also a milestone link target. */
export const V11_KEY = "DGS-470";

const TO_DO = "to do";
const KEY = /^[A-Za-z]+-\d+$/;

interface Dependency { task_id?: string; depends_on?: string }
interface Link { task_id?: string; link_id?: string }
interface FieldOption { name?: string; orderindex?: number }
interface Field { name?: string; value?: unknown; type_config?: { options?: FieldOption[] } }

function isDone(t: ClickUpTask): boolean {
  const name = t.status?.status?.toLowerCase();
  return name === "done" || name === "closed" || t.status?.type === "closed";
}

function signOff(t: ClickUpTask): "Auto" | "Jack" | null {
  const field = (t.custom_fields as unknown as Field[] | undefined)?.find((f) => f.name === "Sign-off");
  if (!field || typeof field.value !== "number") return null;
  const option = field.type_config?.options?.find((o) => o.orderindex === field.value);
  return option?.name === "Auto" || option?.name === "Jack" ? option.name : null;
}

/** Tracker over the ClickUp API for one space. Reads only, except setStatus and comment. */
export class ClickUpLoTracker implements Tracker {
  private milestones: Promise<Map<string, string>> | null = null;

  constructor(private readonly client: ClickUpClient, private readonly spaceId: string) {}

  /** True when any list in the space has the status (the status is not in every list). */
  async hasStatus(name: string): Promise<boolean> {
    const want = name.toLowerCase();
    const folders = await this.client.getSpaceFolders(this.spaceId);
    const folderless = await this.client.getFolderlessLists(this.spaceId);
    const ids = [...folders.flatMap((f) => f.lists ?? []), ...folderless].map((l) => l.id);
    for (const id of ids) {
      const statuses = await this.client.getListStatuses(id);
      if (statuses.some((s) => s.toLowerCase() === want)) return true;
    }
    return false;
  }

  async listToDo(): Promise<LoTask[]> {
    const all = await this.client.searchTeamTasks(this.spaceId);
    const byId = new Map(all.map((t) => [t.id, t]));
    const out: LoTask[] = [];
    for (const hit of all) {
      if (hit.status?.status?.toLowerCase() !== TO_DO) continue;
      // Search leaves out attachments: read the full ticket, only for to-do tickets.
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
    ));
    return this.milestones;
  }

  private async milestone(t: ClickUpTask): Promise<string | null> {
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
      const b = known.get(dep.depends_on) ?? await this.client.getTaskByRef(dep.depends_on);
      out.push({ key: b.custom_id ?? b.id, done: isDone(b) });
    }
    return out;
  }

  private async toLoTask(t: ClickUpTask, known: Map<string, ClickUpTask>): Promise<LoTask> {
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
      signOff: signOff(t),
      milestone: await this.milestone(t),
      blockers: await this.blockers(t, known),
    };
  }
}
