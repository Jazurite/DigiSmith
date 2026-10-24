import { describe, expect, it } from "vitest";
import { ClickUpClient } from "@digismith/clickup-client";
import { ClickUpLoTracker, IMPERIUM_LIST_ID } from "./tracker-clickup.ts";

// Fixtures shaped like probe.md (made-up ids, no secrets).
const SPACE = "space-1";
const modeField = (value?: number) => ({
  id: "field-m", name: "Mode", type: "drop_down",
  type_config: { options: [
    { id: "opt-a", name: "Autonomous", color: null, orderindex: 0 },
    { id: "opt-m", name: "Manual", color: null, orderindex: 1 },
  ] },
  ...(value === undefined ? {} : { value }),
});
const signOffField = (value?: number) => ({
  id: "field-b", name: "Sign-off", type: "drop_down",
  type_config: { options: [
    { id: "opt-auto", name: "Auto", color: null, orderindex: 0 },
    { id: "opt-jack", name: "Jack", color: null, orderindex: 1 },
  ] },
  ...(value === undefined ? {} : { value }),
});

type T = Record<string, unknown> & { id: string };
const task = (t: Partial<T> & { id: string }): T => ({
  custom_id: t.id.toUpperCase(), custom_item_id: 0, name: `Task ${t.id}`,
  text_content: "", description: "", status: { status: "to do", type: "custom" },
  date_created: "1000", due_date: null, priority: null, custom_fields: [],
  dependencies: [], linked_tasks: [], ...t,
});

const MILESTONES: T[] = [
  task({ id: "m-dawn", custom_id: "DGS-338", custom_item_id: 1, name: "Dawn", status: { status: "in progress", type: "custom" } }),
  task({ id: "m-gen", custom_id: "DGS-339", custom_item_id: 1, name: "Genesis", status: { status: "done", type: "closed" } }),
  task({ id: "m-v11", custom_id: "DGS-470", custom_item_id: 1021, name: "V1.1 ClickUp Sync", status: { status: "in progress", type: "custom" } }),
  task({ id: "i-other", custom_id: "DGS-337", custom_item_id: 1021, name: "Ledger", status: { status: "in progress", type: "custom" } }),
];

interface FakeOpts {
  search: T[];
  full?: Record<string, T>;           // getTaskByRef answers (by id or key)
  lists?: Record<string, string[]>;   // list id -> statuses
  folderLists?: string[];
  folderless?: string[];
}

function fakeClient(o: FakeOpts) {
  const calls: string[] = [];
  const byRef = (ref: string): T => {
    const hit = o.full?.[ref] ?? o.search.find((t) => t.id === ref || t.custom_id === ref)
      ?? MILESTONES.find((t) => t.id === ref || t.custom_id === ref);
    if (!hit) throw new Error(`no task ${ref}`);
    return { attachments: [], ...hit };
  };
  const client = {
    async searchTeamTasks(spaceId: string, maxPages = 10, status?: string) {
      calls.push(`searchTeamTasks ${spaceId} ${status ?? "-"}`);
      const out: T[] = [];
      for (let page = 0; page < maxPages; page++) {
        const batch = o.search.slice(page * 100, page * 100 + 100);
        out.push(...batch);
        if (batch.length < 100) break;
      }
      return out;
    },
    async getTaskByRef(ref: string) { calls.push(`getTaskByRef ${ref}`); return byRef(ref); },
    async updateTask(id: string, body: unknown) { calls.push(`updateTask ${id} ${JSON.stringify(body)}`); return byRef(id); },
    async addTaskComment(id: string, text: string) { calls.push(`addTaskComment ${id} ${text}`); return { id: 1 }; },
    async getListStatuses(listId: string) { calls.push(`getListStatuses ${listId}`); return o.lists?.[listId] ?? []; },
    async getAllListTasks(listId: string) {
      calls.push(`getAllListTasks ${listId}`);
      return listId === IMPERIUM_LIST_ID ? MILESTONES : [];
    },
    async getSpaceFolders(spaceId: string) {
      calls.push(`getSpaceFolders ${spaceId}`);
      return [{ id: "f1", name: "Clan", lists: (o.folderLists ?? []).map((id) => ({ id, name: id })) }];
    },
    async getFolderlessLists(spaceId: string) {
      calls.push(`getFolderlessLists ${spaceId}`);
      return (o.folderless ?? []).map((id) => ({ id, name: id }));
    },
  };
  return { client: client as unknown as ClickUpClient, calls };
}

const READY = task({
  id: "t1", custom_id: "DGS-600", name: "Ready one", text_content: "see .digismith/board/DGS-600—x",
  priority: { id: "2", priority: "high", color: "", orderindex: "2" },
  due_date: "1792372602438", date_created: "1792000000000",
  custom_fields: [signOffField(1)],
  linked_tasks: [
    { task_id: "t1", link_id: "peer", date_created: "1", userid: "u", workspace_id: "w" },
    { task_id: "m-v11", link_id: "t1", date_created: "1", userid: "u", workspace_id: "w" },
    { task_id: "t1", link_id: "m-dawn", date_created: "1", userid: "u", workspace_id: "w" },
  ],
  dependencies: [
    { task_id: "t1", depends_on: "b-open", chain_id: null, type: 1, lag_ms: null },
    { task_id: "t1", depends_on: "b-done", chain_id: null, type: 1, lag_ms: null },
    { task_id: "t1", depends_on: "b-closed", chain_id: null, type: 1, lag_ms: null },
    { task_id: "other", depends_on: "t1", chain_id: null, type: 1, lag_ms: null },
  ],
});
const BLOCKERS: Record<string, T> = {
  "b-done": task({ id: "b-done", custom_id: "DGS-601", status: { status: "done", type: "custom" } }),
  "b-closed": task({ id: "b-closed", custom_id: "DGS-602", status: { status: "Closed", type: "closed" } }),
};
const OPEN_BLOCKER = task({ id: "b-open", custom_id: "DGS-603", status: { status: "in progress", type: "custom" } });
const WIP = task({ id: "t2", custom_id: "DGS-604", status: { status: "in progress", type: "custom" } });

describe("ClickUpLoTracker.listByStatus", () => {
  it("keeps only the named status, any case, and passes it to the search", async () => {
    const { client, calls } = fakeClient({ search: [
      task({ id: "r1", status: { status: "Ready", type: "custom" } }),
      task({ id: "d1", status: { status: "to do", type: "custom" } }),
    ] });
    const got = await new ClickUpLoTracker(client, SPACE).listByStatus("ready");
    expect(got.map((t) => t.id)).toEqual(["r1"]);
    expect(calls).toContain(`searchTeamTasks ${SPACE} ready`);
  });
  it("reads Mode Autonomous, Manual, and null for no value or an unknown index", async () => {
    const mk = (id: string, v?: number) => task({ id, status: { status: "ready", type: "custom" }, custom_fields: [modeField(v)] });
    const { client } = fakeClient({ search: [mk("a", 0), mk("m", 1), mk("n"), mk("x", 7)] });
    const got = await new ClickUpLoTracker(client, SPACE).listByStatus("ready");
    expect(got.map((t) => t.mode)).toEqual(["Autonomous", "Manual", null, null]);
  });
  it("keeps only to do tickets and maps every field", async () => {
    const { client, calls } = fakeClient({
      search: [READY, WIP, OPEN_BLOCKER],
      full: { ...BLOCKERS, t1: { ...READY, attachments: [
        { id: "a1", title: "design.md", extension: "md" }, { id: "a2", title: "plan.md", extension: "md" },
      ] } },
    });
    const out = await new ClickUpLoTracker(client, SPACE).listByStatus("to do");
    expect(calls[0]).toBe(`searchTeamTasks ${SPACE} to do`);
    expect(out).toEqual([{
      id: "t1", key: "DGS-600", name: "Ready one", typeId: 0,
      priority: 2, due: 1792372602438, created: 1792000000000,
      attachments: ["design.md", "plan.md"], text: "see .digismith/board/DGS-600—x",
      signOff: "Jack", mode: null, milestone: "V1.1 ClickUp Sync",
      blockers: [
        { key: "DGS-603", done: false },
        { key: "DGS-601", done: true },
        { key: "DGS-602", done: true },
      ],
    }]);
    // The open blocker came from the search; only to-do tickets and unknown blockers are fetched.
    expect(calls).not.toContain("getTaskByRef b-open");
    expect(calls).not.toContain("getTaskByRef t2");
    expect(calls.filter((c) => c.startsWith("getTaskByRef")).sort())
      .toEqual(["getTaskByRef b-closed", "getTaskByRef b-done", "getTaskByRef t1"]);
  });

  it("maps a missing sign-off, milestone, priority and due to null", async () => {
    const bare = task({ id: "t3", custom_fields: [signOffField()], linked_tasks: [
      { task_id: "t3", link_id: "i-other" },
    ] });
    const { client } = fakeClient({ search: [bare] });
    const [t] = await new ClickUpLoTracker(client, SPACE).listByStatus("to do");
    expect(t).toMatchObject({ signOff: null, milestone: null, priority: null, due: null, blockers: [], attachments: [] });
  });

  it("reads Auto by the option order index of that clan's own field", async () => {
    const auto = task({ id: "t4", custom_fields: [{ ...signOffField(0), id: "field-other-clan" }] });
    const { client } = fakeClient({ search: [auto] });
    const [t] = await new ClickUpLoTracker(client, SPACE).listByStatus("to do");
    expect(t.signOff).toBe("Auto");
  });

  it("fetches no ticket that is not to do and reads the milestones once", async () => {
    const { client, calls } = fakeClient({ search: [WIP] });
    const tr = new ClickUpLoTracker(client, SPACE);
    expect(await tr.listByStatus("to do")).toEqual([]);
    expect(calls.some((c) => c.startsWith("getTaskByRef"))).toBe(false);

    const two = fakeClient({ search: [task({ id: "a" }), task({ id: "b" })] });
    const tr2 = new ClickUpLoTracker(two.client, SPACE);
    await tr2.listByStatus("to do");
    await tr2.listByStatus("to do");
    expect(two.calls.filter((c) => c.startsWith("getAllListTasks"))).toEqual([`getAllListTasks ${IMPERIUM_LIST_ID}`]);
  });

  it("finds a to do ticket on page 3 of a 250-task space", async () => {
    const search = Array.from({ length: 250 }, (_, i) =>
      task({ id: `p${i}`, status: { status: i === 230 ? "to do" : "backlog", type: "custom" } }));
    const { client } = fakeClient({ search });
    const out = await new ClickUpLoTracker(client, SPACE).listByStatus("to do");
    expect(out.map((t) => t.id)).toEqual(["p230"]);
  });

  it("finds a to do ticket on page 3 through the real client's paging (100 per page, page cap)", async () => {
    const search = Array.from({ length: 250 }, (_, i) =>
      task({ id: `p${i}`, status: { status: i === 230 ? "to do" : "backlog", type: "custom" } }));
    const pages: number[] = [];
    // The real ClickUpClient with only its HTTP layer replaced: searchTeamTasks runs unchanged.
    class OfflineClient extends ClickUpClient {
      override async get<R>(path: string, opts?: { params?: Record<string, unknown> }): Promise<R> {
        if (path.startsWith("/team/")) {
          const page = Number(opts?.params?.page);
          pages.push(page);
          return { tasks: search.slice(page * 100, page * 100 + 100) } as R;
        }
        if (path.startsWith("/task/")) return { ...search.find((t) => `/task/${t.id}` === path), attachments: [] } as R;
        if (path.startsWith("/list/")) return { tasks: [] } as R;
        throw new Error(`unexpected GET ${path}`);
      }
    }
    const client = new OfflineClient({ CLICKUP_TEAM_ID: "team-1", CLICKUP_API_TOKEN: "not-a-token" });
    const out = await new ClickUpLoTracker(client, SPACE).listByStatus("to do");
    expect(out.map((t) => t.id)).toEqual(["p230"]);
    expect(pages).toEqual([0, 1, 2]);
  });

  it("does not keep a failed milestone read cached", async () => {
    const { client, calls } = fakeClient({ search: [task({ id: "a" })] });
    const real = client.getAllListTasks.bind(client);
    let fail = true;
    (client as unknown as { getAllListTasks: typeof real }).getAllListTasks = async (id: string) => {
      if (fail) { fail = false; throw new Error("network down"); }
      return real(id);
    };
    const tr = new ClickUpLoTracker(client, SPACE);
    await expect(tr.listByStatus("to do")).rejects.toThrow("network down");
    const out = await tr.listByStatus("to do");
    expect(out.map((t) => t.id)).toEqual(["a"]);
    expect(calls.filter((c) => c.startsWith("getAllListTasks"))).toHaveLength(1);
  });

  it("keeps a discarded blocker blocking (done only for status name done or closed)", async () => {
    const t = task({ id: "t5", dependencies: [{ task_id: "t5", depends_on: "b-disc" }] });
    const { client } = fakeClient({ search: [t], full: {
      "b-disc": task({ id: "b-disc", custom_id: "DGS-605", status: { status: "discarded", type: "closed" } }),
    } });
    const [out] = await new ClickUpLoTracker(client, SPACE).listByStatus("to do");
    expect(out.blockers).toEqual([{ key: "DGS-605", done: false }]);
  });

  it("maps an unreadable blocker to an open blocker and still returns the other tickets", async () => {
    const bad = task({ id: "t6", dependencies: [{ task_id: "t6", depends_on: "gone" }] });
    const good = task({ id: "t7" });
    const { client } = fakeClient({ search: [bad, good] });
    const out = await new ClickUpLoTracker(client, SPACE).listByStatus("to do");
    expect(out.map((t) => t.id)).toEqual(["t6", "t7"]);
    expect(out[0].blockers).toEqual([{ key: "gone (unreadable)", done: false }]);
  });
});

describe("ClickUpLoTracker writes and reads", () => {
  it("hasStatus is true when a list in the space has it (case-insensitive)", async () => {
    const { client } = fakeClient({ search: [], folderLists: ["l1", "l2"], folderless: ["l3"],
      lists: { l1: ["backlog", "in progress"], l2: ["To Do", "done"], l3: ["backlog"] } });
    const tr = new ClickUpLoTracker(client, SPACE);
    expect(await tr.hasStatus("to do")).toBe(true);
    expect(await tr.hasStatus("In Progress")).toBe(true);
  });

  it("hasStatus reads the lists once per tracker", async () => {
    const { client, calls } = fakeClient({ search: [], folderLists: ["l1"], folderless: ["l3"],
      lists: { l1: ["backlog"], l3: ["done"] } });
    const tr = new ClickUpLoTracker(client, SPACE);
    expect(await tr.hasStatus("to do")).toBe(false);
    const after = calls.length;
    expect(await tr.hasStatus("To Do")).toBe(false);
    expect(await tr.hasStatus("done")).toBe(true);
    expect(calls.length).toBe(after);
  });

  it("hasStatus stops at the first list that has the status", async () => {
    const { client, calls } = fakeClient({ search: [], folderLists: ["l1", "l2", "l3"], folderless: ["l4"],
      lists: { l1: ["backlog"], l2: ["to do"], l3: ["to do"], l4: ["to do"] } });
    expect(await new ClickUpLoTracker(client, SPACE).hasStatus("To Do")).toBe(true);
    expect(calls.filter((c) => c.startsWith("getListStatuses"))).toEqual(["getListStatuses l1", "getListStatuses l2"]);
  });

  it("hasStatus is false when no list in the space has it", async () => {
    const { client } = fakeClient({ search: [], folderLists: ["l1"], folderless: ["l3"],
      lists: { l1: ["backlog", "in progress"], l3: ["done"] } });
    expect(await new ClickUpLoTracker(client, SPACE).hasStatus("to do")).toBe(false);
  });

  it("hasStatus is false for a space without lists", async () => {
    const { client } = fakeClient({ search: [] });
    expect(await new ClickUpLoTracker(client, SPACE).hasStatus("to do")).toBe(false);
  });

  it("setStatus sends the status only", async () => {
    const { client, calls } = fakeClient({ search: [READY] });
    await new ClickUpLoTracker(client, SPACE).setStatus("t1", "in progress");
    expect(calls).toEqual(['updateTask t1 {"status":"in progress"}']);
  });

  it("getStatus returns the status text", async () => {
    const { client } = fakeClient({ search: [WIP] });
    expect(await new ClickUpLoTracker(client, SPACE).getStatus("t2")).toBe("in progress");
  });

  it("comment resolves a key to the task id first", async () => {
    const { client, calls } = fakeClient({ search: [], full: { "DGS-548": task({ id: "id-548", custom_id: "DGS-548" }) } });
    await new ClickUpLoTracker(client, SPACE).comment("DGS-548", "hello");
    expect(calls).toEqual(["getTaskByRef DGS-548", "addTaskComment id-548 hello"]);
  });

  it("comment on a task id posts directly", async () => {
    const { client, calls } = fakeClient({ search: [] });
    await new ClickUpLoTracker(client, SPACE).comment("14zcebrw02y", "hi");
    expect(calls).toEqual(["addTaskComment 14zcebrw02y hi"]);
  });
});
