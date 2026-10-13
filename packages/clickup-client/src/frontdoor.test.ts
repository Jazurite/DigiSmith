import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { inspect } from "node:util";
import { ClickUpApiError } from "./errors.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FrontdoorClient,
  FrontdoorAuthError,
  DEFAULT_FRONTDOOR_HOST,
} from "./frontdoor.ts";
import { readFrontdoorAuth } from "./credentials.ts";

vi.mock("axios");

const request = vi.fn();

function makeClient(host?: string): FrontdoorClient {
  vi.mocked(axios.create).mockReturnValue({ request } as unknown as ReturnType<typeof axios.create>);
  return new FrontdoorClient({ CLICKUP_TEAM_ID: "123", CLICKUP_FRONTDOOR_AUTH: "Bearer abc", host });
}

describe("FrontdoorClient", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("configures axios with the default host and the Authorization header only", () => {
    makeClient();
    expect(vi.mocked(axios.create)).toHaveBeenCalledWith({
      baseURL: `https://${DEFAULT_FRONTDOOR_HOST}`,
      headers: { Authorization: "Bearer abc" },
    });
  });

  it("takes the host from config", () => {
    makeClient("frontdoor-prod-us-1.clickup.com");
    expect(vi.mocked(axios.create).mock.calls[0][0]).toMatchObject({
      baseURL: "https://frontdoor-prod-us-1.clickup.com",
    });
  });

  it("getTaskTypes GETs the workspace customItems and returns the array", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { custom_items: [{ id: 1005, name: "Epic" }] } });
    const types = await client.getTaskTypes();
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/tasks/v1/123/customItems",
      data: undefined,
    });
    expect(types).toEqual([{ id: 1005, name: "Epic" }]);
  });

  it("createTaskType POSTs the full body", async () => {
    const client = makeClient();
    const body = { avatar_source: "fas", avatar_value: "bolt", description: "d", name: "Epic", name_plural: "Epics" };
    request.mockResolvedValueOnce({ data: { id: 1030, ...body } });
    const created = await client.createTaskType(body);
    expect(request).toHaveBeenCalledWith({ method: "POST", url: "/tasks/v1/123/customItem", data: body });
    expect(created.id).toBe(1030);
  });

  it("updateTaskType PUTs the full body to the type id", async () => {
    const client = makeClient();
    const body = { avatar_source: "fas", avatar_value: "flag", description: "", name: "I", name_plural: "Is" };
    request.mockResolvedValueOnce({ data: { id: 1030, ...body } });
    await client.updateTaskType(1030, body);
    expect(request).toHaveBeenCalledWith({ method: "PUT", url: "/tasks/v1/123/customItem/1030", data: body });
  });

  it("getField GETs the field by id", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "f1", name: "Bucket" } });
    const field = await client.getField("f1");
    expect(request).toHaveBeenCalledWith({ method: "GET", url: "/customFields/v2/field/f1", data: undefined });
    expect(field.name).toBe("Bucket");
  });

  it("getFieldValueCount reads value_count for one option as a number", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "f1", value_count: "3" } });
    const n = await client.getFieldValueCount("f1", "o1");
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/customFields/v2/field/f1?count_values=true&option_id=o1",
      data: undefined,
    });
    expect(n).toBe(3);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["garbage", "abc"],
    ["negative", "-1"],
    ["fractional", "1.5"],
    ["infinite", "Infinity"],
  ])("getFieldValueCount throws on a %s value_count", async (_n, value_count) => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "f1", value_count } });
    await expect(client.getFieldValueCount("f1", "o1")).rejects.toThrow(/value_count/);
  });

  it("updateField PUTs the full body to the field id", async () => {
    const client = makeClient();
    const body = { id: "f1", name: "N" } as never;
    request.mockResolvedValueOnce({ data: { id: "f1" } });
    await client.updateField("f1", body);
    expect(request).toHaveBeenCalledWith({ method: "PUT", url: "/customFields/v2/field/f1", data: body });
  });

  it("createField POSTs the body to the field path with ignore_existing", async () => {
    const client = makeClient();
    const body = { name: "Profile" } as never;
    request.mockResolvedValueOnce({ data: { id: "f9" } });
    const field = await client.createField(body);
    expect(request).toHaveBeenCalledWith({ method: "POST", url: "/customFields/v2/field?ignore_existing=true", data: body });
    expect(field.id).toBe("f9");
  });

  it("mergeTaskType PUTs destination_custom_item_id to the merge path", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: "" });
    await client.mergeTaskType(1030, 0);
    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/task-v3/core/123/customItems/1030/merge",
      data: { destination_custom_item_id: 0 },
    });
  });

  it("moveList PUTs the subcategory position path with the captured query and body", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });
    await client.moveList("1301150000002956", { folderId: "1301150000002921", position: 1 });
    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/hierarchy/v2/subcategory/1301150000002956/position?v2=true&conflict_modal=true&return_conflict_on_cancel=true",
      data: { position: 1, include_archived: false, category: "1301150000002921" },
    });
  });

  it("moveList without a folder sends the position only (a reorder inside its own folder)", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });
    await client.moveList("1301150000002956", { position: 2 });
    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/hierarchy/v2/subcategory/1301150000002956/position?v2=true&conflict_modal=true&return_conflict_on_cancel=true",
      data: { position: 2, include_archived: false },
    });
    expect(Object.keys(request.mock.calls[0][0].data)).not.toContain("category");
  });

  it("restoreList PUTs the subcategory undo path with the captured body", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });
    await client.restoreList("1301150000002237");
    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/v1/subcategory/1301150000002237/undo",
      data: { method: "delete" },
    });
  });

  it("restoreList puts ClickUp's error body in the message of a 404", async () => {
    const client = makeClient();
    request.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 404"), { isAxiosError: true, response: { status: 404, data: { err: "not in trash" } } }),
    );
    await expect(client.restoreList("1")).rejects.toThrow('status code 404: {"err":"not in trash"}');
  });

  it("puts ClickUp's error body in the message of a 400", async () => {
    const client = makeClient();
    request.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { err: "bad position" } } }),
    );
    await expect(client.moveList("1", { position: 1 })).rejects.toThrow('status code 400: {"err":"bad position"}');
  });

  it.each([401, 403])("turns HTTP %i into one clear session error", async (status) => {
    const client = makeClient();
    request.mockRejectedValueOnce({ isAxiosError: true, response: { status }, message: "x" });
    await expect(client.getTaskTypes()).rejects.toThrow(FrontdoorAuthError);
    await Promise.resolve();
    request.mockRejectedValueOnce({ isAxiosError: true, response: { status }, message: "x" });
    await expect(client.getTaskTypes()).rejects.toThrow(
      "Frontdoor session expired or not enough, capture a new one",
    );
  });

  function axiosLike(status: number): Error {
    const config = { headers: { Authorization: "Bearer abc" } };
    return Object.assign(new Error(`Request failed with status code ${status}`), {
      isAxiosError: true,
      config,
      request: { _header: "GET /x HTTP/1.1\r\nAuthorization: Bearer abc\r\n" },
      response: { status, data: { err: "boom" }, config },
      toJSON: () => ({ config }),
    });
  }

  function everyView(e: unknown): string[] {
    const err = e as Error & { toJSON?: () => unknown };
    return [JSON.stringify(err), inspect(err, { depth: null, showHidden: true }), String(err.stack), err.message, JSON.stringify(err.toJSON?.() ?? null)];
  }

  it("rethrows a plain Error that only has a response field, unchanged", async () => {
    const client = makeClient();
    const err = Object.assign(new Error("my own bug"), { response: { status: 500, data: "x" } });
    request.mockRejectedValueOnce(err);
    const caught = await client.getTaskTypes().catch((e: unknown) => e);
    expect(caught).toBe(err);
    expect(caught).not.toBeInstanceOf(ClickUpApiError);
  });

  it("turns other errors into a ClickUpApiError without the auth value", async () => {
    const client = makeClient();
    request.mockRejectedValueOnce(axiosLike(500));
    const caught = await client.getTaskTypes().catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ClickUpApiError);
    const e = caught as ClickUpApiError;
    expect([e.method, e.path, e.status, e.body]).toEqual(["GET", "/tasks/v1/123/customItems", 500, { err: "boom" }]);
    for (const view of everyView(caught)) expect(view).not.toContain("abc");
  });

  it.each([401, 403])("the HTTP %i FrontdoorAuthError carries no auth value", async (status) => {
    const client = makeClient();
    request.mockRejectedValueOnce(axiosLike(status));
    const caught = await client.getTaskTypes().catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(FrontdoorAuthError);
    for (const view of everyView(caught)) expect(view).not.toContain("abc");
  });

  it("getSpaceStatuses GETs the space and returns its statuses", async () => {
    const client = makeClient();
    const statuses = [{ id: "p1_a", status: "backlog", type: "open", orderindex: 0, color: "#87909e" }];
    request.mockResolvedValueOnce({ data: { id: "1", statuses } });
    expect(await client.getSpaceStatuses("1")).toEqual(statuses);
    expect(request).toHaveBeenCalledWith({ method: "GET", url: "/hierarchy/v1/project/1", data: undefined });
  });

  it("getSpaceStatuses throws when statuses is missing, empty or not an array (an empty read would wipe the set)", async () => {
    const client = makeClient();
    for (const data of [{ id: "1" }, { id: "1", statuses: [] }, { id: "1", statuses: "x" }, { id: "1", statuses: null }]) {
      request.mockResolvedValueOnce({ data });
      await expect(client.getSpaceStatuses("1")).rejects.toThrow(/no statuses/);
    }
  });

  it("putSpaceStatuses PUTs the full set with checkConflict", async () => {
    const client = makeClient();
    const body = { statuses: [{ status: "x", type: "custom", orderindex: 0, color: "#fff000" }] };
    request.mockResolvedValueOnce({ data: {} });
    await client.putSpaceStatuses("1", body);
    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/hierarchy/v1/project/1/status?checkConflict=true",
      data: body,
    });
  });
});

describe("readFrontdoorAuth", () => {
  function envFile(content: string): { path: string; done: () => void } {
    const dir = mkdtempSync(join(tmpdir(), "frontdoor-test-"));
    const path = join(dir, ".env");
    writeFileSync(path, content);
    return { path, done: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it("returns the single-quoted value without the quotes", () => {
    const f = envFile("CLICKUP_FRONTDOOR_AUTH='Bearer abc.def'\n");
    expect(readFrontdoorAuth(f.path)).toBe("Bearer abc.def");
    f.done();
  });

  it("returns undefined when the key or the file is missing", () => {
    const f = envFile("CLICKUP_TEAM_ID=1\n");
    expect(readFrontdoorAuth(f.path)).toBeUndefined();
    expect(readFrontdoorAuth(f.path + ".nope")).toBeUndefined();
    f.done();
  });
});
