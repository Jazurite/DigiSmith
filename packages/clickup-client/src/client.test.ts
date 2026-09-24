import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { ClickUpClient, type ClickUpClientConfig } from "./client.ts";

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
