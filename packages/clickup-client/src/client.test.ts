import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { inspect } from "node:util";
import { ClickUpClient, type ClickUpClientConfig } from "./client.ts";
import { ClickUpApiError } from "./errors.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("axios");

const request = vi.fn();
const configStub: ClickUpClientConfig = {
  CLICKUP_TEAM_ID: "5738747",
  CLICKUP_API_TOKEN: "tok_123",
};

function makeClient(): ClickUpClient {
  vi.mocked(axios.create).mockReturnValue({ request } as unknown as ReturnType<typeof axios.create>);
  return new ClickUpClient(configStub);
}

describe("ClickUpClient core", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("configures axios with the base URL and Authorization header", () => {
    makeClient();

    expect(vi.mocked(axios.create)).toHaveBeenCalledWith({
      baseURL: "https://api.clickup.com/api/v2",
      headers: { Authorization: "tok_123" },
    });
  });

  it("get() issues a GET and returns the response body", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { hello: "world" } });

    const result = await client.get<{ hello: string }>("/ping", {
      params: { a: 1 },
    });

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/ping",
      params: { a: 1 },
      data: undefined,
    });
    expect(result).toEqual({ hello: "world" });
  });

  it("paginate() walks pages until selectPage returns empty, concatenating results", async () => {
    const client = makeClient();
    request
      .mockResolvedValueOnce({ data: { items: ["a", "b"] } })
      .mockResolvedValueOnce({ data: { items: ["c"] } })
      .mockResolvedValueOnce({ data: { items: [] } });

    const select = (resp: unknown) => (resp as { items: string[] }).items;
    const all = await client.paginate<string>("/things", { params: { x: 9 } }, select);

    expect(all).toEqual(["a", "b", "c"]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      url: "/things",
      params: { x: 9, page: 0 },
      data: undefined,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "GET",
      url: "/things",
      params: { x: 9, page: 1 },
      data: undefined,
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "GET",
      url: "/things",
      params: { x: 9, page: 2 },
      data: undefined,
    });
  });
});

describe("ClickUpClient domain methods", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("getTaskTypes() GETs the team custom_item endpoint and returns custom_items", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: { custom_items: [{ id: 1007, name: "Expense" }] },
    });

    const types = await client.getTaskTypes();

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/team/5738747/custom_item",
      params: undefined,
      data: undefined,
    });
    expect(types).toEqual([{ id: 1007, name: "Expense" }]);
  });

  it("getTaskTypes() throws when custom_items is missing", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });

    await expect(client.getTaskTypes()).rejects.toThrow("custom_items");
  });

  it("countTasksOfType() counts the workspace tasks of one type, closed and subtasks included", async () => {
    const client = makeClient();
    request
      .mockResolvedValueOnce({ data: { tasks: [{ id: "1" }, { id: "2" }] } })
      .mockResolvedValueOnce({ data: { tasks: [{ id: "3" }] } })
      .mockResolvedValueOnce({ data: { tasks: [] } });

    expect(await client.countTasksOfType(1030)).toBe(3);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      url: "/team/5738747/task?custom_items[]=1030",
      params: { include_closed: true, subtasks: true, page: 0 },
      data: undefined,
    });
  });

  it("getListTasks() paginates the list task endpoint", async () => {
    const client = makeClient();
    request
      .mockResolvedValueOnce({ data: { tasks: [{ id: "1" }] } })
      .mockResolvedValueOnce({ data: { tasks: [] } });

    const tasks = await client.getListTasks("901", { params: { subtasks: true } });

    expect(tasks).toEqual([{ id: "1" }]);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      url: "/list/901/task",
      params: { subtasks: true, page: 0 },
      data: undefined,
    });
  });

  it("getAllListTasks requests closed tasks and subtasks", async () => {
    const client = new ClickUpClient({ CLICKUP_TEAM_ID: "t", CLICKUP_API_TOKEN: "k" });
    const get = vi.spyOn(client, "get").mockResolvedValue({ tasks: [] });

    await client.getAllListTasks("L1");

    expect(get).toHaveBeenCalledWith("/list/L1/task", {
      params: { include_closed: true, subtasks: true, page: 0 },
    });
  });
});

describe("ClickUpClient write support", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("post() issues a POST with a JSON body", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "9" } });

    const result = await client.post<{ id: string }>("/list/1/task", {
      data: { name: "Breakfast" },
    });

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/list/1/task",
      params: undefined,
      data: { name: "Breakfast" },
    });
    expect(result).toEqual({ id: "9" });
  });

  it("put() issues a PUT with a JSON body", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "9", status: "Done" } });

    await client.put("/task/9", { data: { status: "Done" } });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/task/9",
      params: undefined,
      data: { status: "Done" },
    });
  });
});

describe("ClickUpClient domain write/read methods", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("createTask() POSTs the task body to the list task endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "abc" } });

    const task = await client.createTask("901", { name: "Breakfast", time_estimate: 600000 });

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/list/901/task",
      params: undefined,
      data: { name: "Breakfast", time_estimate: 600000 },
    });
    expect(task).toEqual({ id: "abc" });
  });

  it("updateTask() PUTs the body to the task endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "abc", status: "Done" } });

    await client.updateTask("abc", { status: "Done" });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/task/abc",
      params: undefined,
      data: { status: "Done" },
    });
  });

  it("moveTask() PUTs the options to the absolute v3 home_list URL", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: { data: { task_id: "14zcebru2p7", new_list_id: "1301150000002300" } },
    });

    const result = await client.moveTask("14zcebru2p7", "1301150000002300", {
      move_custom_fields: true,
      status_mappings: [{ source_status: "s1", destination_status: "s2" }],
    });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "https://api.clickup.com/api/v3/workspaces/5738747/tasks/14zcebru2p7/home_list/1301150000002300",
      params: undefined,
      data: {
        move_custom_fields: true,
        status_mappings: [{ source_status: "s1", destination_status: "s2" }],
      },
    });
    expect(result).toEqual({
      data: { task_id: "14zcebru2p7", new_list_id: "1301150000002300" },
    });
  });

  it("moveTask() sends an empty body when no options are given", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { data: { task_id: "t1", new_list_id: "l1" } } });

    await client.moveTask("t1", "l1");

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "https://api.clickup.com/api/v3/workspaces/5738747/tasks/t1/home_list/l1",
      params: undefined,
      data: {},
    });
  });

  it("createFolder() POSTs the name to the space folder endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "f1", name: "New Folder", hidden: false } });

    const folder = await client.createFolder("90165960730", "New Folder");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/space/90165960730/folder",
      params: undefined,
      data: { name: "New Folder" },
    });
    expect(folder).toEqual({ id: "f1", name: "New Folder", hidden: false });
  });

  it("createListInFolder() POSTs the name to the folder list endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "l1", name: "New List" } });

    const list = await client.createListInFolder("f1", "New List");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/folder/f1/list",
      params: undefined,
      data: { name: "New List" },
    });
    expect(list).toEqual({ id: "l1", name: "New List" });
  });

  it("createListInSpace() POSTs the name to the space list endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "l2", name: "Folderless List" } });

    const list = await client.createListInSpace("90165960730", "Folderless List");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/space/90165960730/list",
      params: undefined,
      data: { name: "Folderless List" },
    });
    expect(list).toEqual({ id: "l2", name: "Folderless List" });
  });

  it("updateList() PUTs the body to the list endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "l1", name: "Town Hall", content: "- scope" } });

    const list = await client.updateList("l1", { name: "Town Hall", content: "- scope" });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/list/l1",
      params: undefined,
      data: { name: "Town Hall", content: "- scope" },
    });
    expect(list).toEqual({ id: "l1", name: "Town Hall", content: "- scope" });
  });

  it("updateFolder() PUTs { name } to the folder endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "f1", name: "A: Reactor", hidden: false } });

    const folder = await client.updateFolder("f1", "A: Reactor");

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/folder/f1",
      params: undefined,
      data: { name: "A: Reactor" },
    });
    expect(folder).toEqual({ id: "f1", name: "A: Reactor", hidden: false });
  });

  it("getFolder() GETs the folder endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "f1", name: "A: Reactor", hidden: false } });

    const folder = await client.getFolder("f1");

    expect(request).toHaveBeenCalledWith({ method: "GET", url: "/folder/f1", params: undefined, data: undefined });
    expect(folder.name).toBe("A: Reactor");
  });

  it("setCustomField() POSTs { value } to the field endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });

    await client.setCustomField("abc", "field-uuid", "option-uuid");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/task/abc/field/field-uuid",
      params: undefined,
      data: { value: "option-uuid" },
    });
  });

  it("getSpaceFolders() returns folders with their lists", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: {
        folders: [
          { id: "f1", name: "Weeks", lists: [{ id: "l1", name: "CW-30: 20/7 - 26/7" }] },
        ],
      },
    });

    const folders = await client.getSpaceFolders("90165960730");

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/space/90165960730/folder",
      params: undefined,
      data: undefined,
    });
    expect(folders[0].lists[0].name).toBe("CW-30: 20/7 - 26/7");
  });

  it("deleteTask() sends DELETE /task/{id} and returns nothing (mocked transport)", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });

    await expect(client.deleteTask("abc")).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith({ method: "DELETE", url: "/task/abc", params: undefined, data: undefined });
  });

  it("deleteList() sends DELETE /list/{id} and returns nothing", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });

    await expect(client.deleteList("42")).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith({
      method: "DELETE",
      url: "/list/42",
      params: undefined,
      data: undefined,
    });
  });

  it("moveFolder() PUTs parent_folder_id to the folder's position path", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });

    await client.moveFolder("55", { parentFolderId: "77" });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/folder/55/position",
      params: undefined,
      data: { parent_folder_id: "77" },
    });
  });

  it("moveFolder() PUTs space_id and an optional position", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });

    await client.moveFolder("55", { spaceId: "9", position: 2 });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/folder/55/position",
      params: undefined,
      data: { space_id: "9", position: 2 },
    });
  });

  it("getList() GETs /list/{id} and returns the folder", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "7", name: "B.0", folder: { id: "55", hidden: false } } });

    const list = await client.getList("7");

    expect(request).toHaveBeenCalledWith({ method: "GET", url: "/list/7", params: undefined, data: undefined });
    expect(list.folder).toEqual({ id: "55", hidden: false });
  });

  it("deleteFolder() sends DELETE /folder/{id}", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });

    await client.deleteFolder("55");

    expect(request).toHaveBeenCalledWith({ method: "DELETE", url: "/folder/55", params: undefined, data: undefined });
  });

  it("getFolderLists() reads active and archived lists and merges them by id", async () => {
    const client = makeClient();
    request
      .mockResolvedValueOnce({ data: { lists: [{ id: "l1", name: "A" }, { id: "l2", name: "B" }] } })
      .mockResolvedValueOnce({ data: { lists: [{ id: "l2", name: "B" }, { id: "l3", name: "C" }] } });

    const lists = await client.getFolderLists("55");

    expect(request).toHaveBeenNthCalledWith(1, { method: "GET", url: "/folder/55/list", params: { archived: false }, data: undefined });
    expect(request).toHaveBeenNthCalledWith(2, { method: "GET", url: "/folder/55/list", params: { archived: true }, data: undefined });
    expect(lists.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("getFolderLists() keeps a list that only the active read returns (gate must refuse)", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { lists: [{ id: "l1", name: "A" }] } }).mockResolvedValueOnce({ data: { lists: [] } });

    expect(await client.getFolderLists("55")).toEqual([{ id: "l1", name: "A" }]);
  });

  it("getFolderLists() keeps a list that only the archived read returns (gate must refuse)", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { lists: [] } }).mockResolvedValueOnce({ data: { lists: [{ id: "l2", name: "Old" }] } });

    expect(await client.getFolderLists("55")).toEqual([{ id: "l2", name: "Old" }]);
  });

  it("getFolderLists() returns [] when both reads are empty", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { lists: [] } }).mockResolvedValueOnce({ data: { lists: [] } });

    expect(await client.getFolderLists("55")).toEqual([]);
  });

  it.each([[{}, { lists: [] }], [{ lists: [] }, {}], [{ lists: null }, { lists: [] }]])(
    "getFolderLists() throws on a body without a lists array, so the gate fails closed",
    async (first, second) => {
      const client = makeClient();
      request.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: second });

      await expect(client.getFolderLists("55")).rejects.toThrow(/lists/);
    },
  );

  it("getFolderlessLists() returns the lists array", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { lists: [{ id: "l9", name: "Workflows" }] } });

    const lists = await client.getFolderlessLists("90165960730");

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/space/90165960730/list",
      params: undefined,
      data: undefined,
    });
    expect(lists).toEqual([{ id: "l9", name: "Workflows" }]);
  });

  it("getListFields() returns the fields array", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: { fields: [{ id: "cf1", name: "Activity", type: "drop_down" }] },
    });

    const fields = await client.getListFields("901");

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/list/901/field",
      params: undefined,
      data: undefined,
    });
    expect(fields[0].name).toBe("Activity");
  });

  it("getListStatuses() returns the status name strings from a list", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: { id: "901", name: "CW-30", statuses: [{ status: "to do" }, { status: "done" }] },
    });

    const statuses = await client.getListStatuses("901");

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/list/901",
      params: undefined,
      data: undefined,
    });
    expect(statuses).toEqual(["to do", "done"]);
  });
});

describe("ClickUpClient uploadAttachment", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("POSTs multipart form data to the task attachment endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: {
        id: "att1",
        version: "1",
        date: 1790000000000,
        title: "report.pdf",
        extension: "pdf",
        thumbnail_small: null,
        thumbnail_large: null,
        url: "https://t.clickup.com/att1",
      },
    });

    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-upload-"));
    const filePath = join(tmpDir, "report.pdf");
    writeFileSync(filePath, Buffer.from([1, 2, 3]));

    const result = await client.uploadAttachment("abc", filePath);

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/task/abc/attachment",
      params: undefined,
      data: expect.any(FormData),
    });
    const sentForm = request.mock.calls[0][0].data as FormData;
    expect(sentForm.get("attachment")).toBeInstanceOf(Blob);
    expect(result.id).toBe("att1");
    expect(result.title).toBe("report.pdf");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sends the file's base name as the attachment filename, not its path", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "att1" } });
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-upload-"));
    const filePath = join(tmpDir, "report.pdf");
    try {
      writeFileSync(filePath, Buffer.from([1, 2, 3]));

      await client.uploadAttachment("abc", filePath);

      const sentForm = request.mock.calls[0][0].data as FormData;
      expect((sentForm.get("attachment") as File).name).toBe("report.pdf");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects a missing local file before any HTTP request", async () => {
    const client = makeClient();
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-upload-"));

    try {
      await expect(client.uploadAttachment("abc", join(tmpDir, "missing.pdf"))).rejects.toThrow(/ENOENT/);

      expect(request).not.toHaveBeenCalled();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("ClickUpClient relations", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("getTaskByRef() reads a plain id as is", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "abc" } });

    await client.getTaskByRef("abc");

    expect(request).toHaveBeenCalledWith({ method: "GET", url: "/task/abc", params: undefined, data: undefined });
  });

  it("getTaskByRef() reads a key with custom_task_ids and the team id", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "abc" } });

    await client.getTaskByRef("DGS-343");

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/task/DGS-343",
      params: { custom_task_ids: true, team_id: "5738747" },
      data: undefined,
    });
  });

  it("getTaskByRef() adds extra params next to the key params", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "abc" } });

    await client.getTaskByRef("DGS-343", { include_markdown_description: true });

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/task/DGS-343",
      params: { custom_task_ids: true, team_id: "5738747", include_markdown_description: true },
      data: undefined,
    });
  });

  it("addDependency() POSTs depends_on or dependency_of in the body", async () => {
    const client = makeClient();
    request.mockResolvedValue({ data: {} });

    await client.addDependency("a", { dependsOn: "b" });
    await client.addDependency("a", { dependencyOf: "c" });

    expect(request).toHaveBeenNthCalledWith(1, { method: "POST", url: "/task/a/dependency", params: undefined, data: { depends_on: "b" } });
    expect(request).toHaveBeenNthCalledWith(2, { method: "POST", url: "/task/a/dependency", params: undefined, data: { dependency_of: "c" } });
  });

  it("removeDependency() DELETEs with the relation in the query, not the body", async () => {
    const client = makeClient();
    request.mockResolvedValue({ data: {} });

    await client.removeDependency("a", { dependsOn: "b" });
    await client.removeDependency("a", { dependencyOf: "c" });

    expect(request).toHaveBeenNthCalledWith(1, { method: "DELETE", url: "/task/a/dependency", params: { depends_on: "b" }, data: undefined });
    expect(request).toHaveBeenNthCalledWith(2, { method: "DELETE", url: "/task/a/dependency", params: { dependency_of: "c" }, data: undefined });
  });

  it("addLink() and removeLink() use POST and DELETE on /link/{to}", async () => {
    const client = makeClient();
    request.mockResolvedValue({ data: { task: {} } });

    await client.addLink("a", "b");
    await client.removeLink("a", "b");

    expect(request).toHaveBeenNthCalledWith(1, { method: "POST", url: "/task/a/link/b", params: undefined, data: undefined });
    expect(request).toHaveBeenNthCalledWith(2, { method: "DELETE", url: "/task/a/link/b", params: undefined, data: undefined });
  });

  it("addTaskComment() posts comment_text with notify_all false; getTaskComments() reads the list", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: 77, hist_id: "h", date: 1 } });
    request.mockResolvedValueOnce({ data: { comments: [{ id: "77", comment_text: "hi" }] } });

    const created = await client.addTaskComment("a", "hi");
    const list = await client.getTaskComments("a");

    expect(created.id).toBe(77);
    expect(list).toEqual([{ id: "77", comment_text: "hi" }]);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "POST",
      url: "/task/a/comment",
      params: undefined,
      data: { comment_text: "hi", notify_all: false },
    });
    expect(request).toHaveBeenNthCalledWith(2, { method: "GET", url: "/task/a/comment", params: undefined, data: undefined });
  });

  /** An error shaped like an AxiosError: config, request header block and response all carry the token. */
  function axiosLike(status: number | undefined, data?: unknown): Error {
    const config = { headers: { Authorization: "tok_123" } };
    return Object.assign(new Error(status ? `Request failed with status code ${status}` : "connect ECONNREFUSED"), {
      isAxiosError: true,
      code: status ? "ERR_BAD_REQUEST" : "ECONNREFUSED",
      config,
      request: { _header: "GET /x HTTP/1.1\r\nAuthorization: tok_123\r\n" },
      response: status ? { status, data, config } : undefined,
      toJSON: () => ({ config }),
    });
  }

  function everyView(e: unknown): string[] {
    const err = e as Error & { toJSON?: () => unknown };
    return [JSON.stringify(err), inspect(err, { depth: null, showHidden: true }), String(err.stack), err.message, JSON.stringify(err.toJSON?.() ?? null)];
  }

  it("throws a ClickUpApiError with method, path, status and ClickUp's body in the message", async () => {
    const client = makeClient();
    const data = { err: "Start date must be before due date", ECODE: "DATE_001" };
    request.mockRejectedValueOnce(axiosLike(400, data));

    const caught = await client.post("/task/x", { data: {} }).catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(ClickUpApiError);
    const e = caught as ClickUpApiError;
    expect([e.method, e.path, e.status, e.body]).toEqual(["POST", "/task/x", 400, data]);
    expect(e.message).toBe(`Request failed with status code 400: ${JSON.stringify(data)}`);
  });

  it("keeps the token out of the thrown error: JSON, inspect, stack, message, toJSON", async () => {
    const client = makeClient();
    request.mockRejectedValueOnce(axiosLike(400, { err: "bad", ECODE: "X" }));
    const caught = await client.get("/task/x").catch((e: unknown) => e);
    for (const view of everyView(caught)) expect(view).not.toContain("tok_123");
    const e = caught as Record<string, unknown>;
    for (const key of ["config", "headers", "request", "response", "cause"]) expect(e[key]).toBeUndefined();
  });

  it("wraps a network error (no response) and drops its request headers", async () => {
    const client = makeClient();
    request.mockRejectedValueOnce(axiosLike(undefined));
    const caught = await client.get("/x").catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ClickUpApiError);
    expect((caught as ClickUpApiError).status).toBeUndefined();
    expect((caught as ClickUpApiError).code).toBe("ECONNREFUSED");
    expect((caught as Error).message).toBe("connect ECONNREFUSED");
    for (const view of everyView(caught)) expect(view).not.toContain("tok_123");
  });

  it("rethrows a plain Error that only has a response field, unchanged", async () => {
    const client = makeClient();
    const err = Object.assign(new Error("my own bug"), { response: { status: 500, data: "x" } });
    request.mockRejectedValueOnce(err);
    const caught = await client.get("/x").catch((e: unknown) => e);
    expect(caught).toBe(err);
    expect(caught).not.toBeInstanceOf(ClickUpApiError);
  });

  it("keeps the token out when the error is a REAL AxiosError", async () => {
    const { AxiosError } = await vi.importActual<typeof import("axios")>("axios");
    const config = { headers: { Authorization: "tok_123" } } as never;
    const real = new AxiosError(
      "Request failed with status code 400",
      "ERR_BAD_REQUEST",
      config,
      { _header: "GET /x HTTP/1.1\r\nAuthorization: tok_123\r\n" },
      { status: 400, statusText: "Bad Request", headers: {}, config, data: { err: "bad", ECODE: "X" } },
    );
    expect(JSON.stringify(real)).toContain("tok_123"); // the premise: axios itself leaks
    const client = makeClient();
    request.mockRejectedValueOnce(real);
    const caught = await client.get("/task/x").catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ClickUpApiError);
    expect((caught as ClickUpApiError).status).toBe(400);
    for (const view of everyView(caught)) expect(view).not.toContain("tok_123");
  });

  it("does not let an unserializable body replace the real error", async () => {
    const client = makeClient();
    const circular: Record<string, unknown> = { err: "loop" };
    circular.self = circular;
    request.mockRejectedValueOnce(axiosLike(400, circular));
    const caught = await client.get("/x").catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ClickUpApiError);
    expect((caught as ClickUpApiError).status).toBe(400);
    expect((caught as Error).message).toContain("Request failed with status code 400");
    request.mockRejectedValueOnce(axiosLike(400, { n: 10n }));
    const caught2 = await client.get("/x").catch((e: unknown) => e);
    expect(caught2).toBeInstanceOf(ClickUpApiError);
  });

  it("leaves an error without a response body untouched", async () => {
    const client = makeClient();
    const err = new Error("connect ECONNREFUSED");
    request.mockRejectedValueOnce(err);
    await expect(client.get("/x")).rejects.toThrow(/^connect ECONNREFUSED$/);
  });
});

describe("ClickUpClient searchTeamTasks", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("pages through the team task list of one space and stops at a short page", async () => {
    const client = makeClient();
    request
      .mockResolvedValueOnce({ data: { tasks: Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` })) } })
      .mockResolvedValueOnce({ data: { tasks: [{ id: "b0" }] } });
    const tasks = await client.searchTeamTasks("S1");
    expect(tasks).toHaveLength(101);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0].url).toBe("/team/5738747/task");
    expect(request.mock.calls[0][0].params).toMatchObject({ "space_ids[]": "S1", page: 0, include_closed: false });
    expect(request.mock.calls[1][0].params).toMatchObject({ page: 1 });
  });
});
