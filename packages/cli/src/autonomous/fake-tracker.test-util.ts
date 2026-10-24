import type { LoTask, Tracker } from "./types.ts";

export type FakeTask = LoTask & { status: string };

export class FakeTracker implements Tracker {
  tasks = new Map<string, FakeTask>();
  comments: { ref: string; text: string }[] = [];
  statuses = new Set<string>(["to do", "ready", "scheduled", "in progress", "complete"]);
  calls: string[] = [];
  failSetStatus = false;
  readBackWrong = false;

  add(t: Partial<FakeTask> & { id: string }): FakeTask {
    const task: FakeTask = {
      key: t.id.toUpperCase(), name: `Task ${t.id}`, typeId: 0, priority: 3, due: null, created: 1,
      attachments: ["design.md", "plan.md"], text: "", signOff: "Auto", mode: "Autonomous", scheduledAt: null, milestone: "Dawn", blockers: [],
      status: "ready", ...t,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  async hasStatus(name: string): Promise<boolean> {
    this.calls.push(`hasStatus ${name}`);
    return this.statuses.has(name);
  }

  async listByStatus(name: string): Promise<LoTask[]> {
    this.calls.push(`listByStatus ${name}`);
    return [...this.tasks.values()].filter((t) => t.status.toLowerCase() === name.toLowerCase()).map(({ status: _s, ...t }) => ({ ...t }));
  }

  async setStatus(taskId: string, status: string): Promise<void> {
    this.calls.push(`setStatus ${taskId} ${status}`);
    if (this.failSetStatus) throw new Error("setStatus failed");
    const t = this.tasks.get(taskId);
    if (!t) throw new Error(`no task ${taskId}`);
    t.status = status;
  }

  async getStatus(taskId: string): Promise<string> {
    this.calls.push(`getStatus ${taskId}`);
    const t = this.tasks.get(taskId);
    if (!t) throw new Error(`no task ${taskId}`);
    return this.readBackWrong ? "ready" : t.status;
  }

  async comment(ref: string, text: string): Promise<void> {
    this.calls.push(`comment ${ref}`);
    this.comments.push({ ref, text });
  }

  writeCalls(): string[] {
    return this.calls.filter((c) => c.startsWith("setStatus") || c.startsWith("comment"));
  }
}
