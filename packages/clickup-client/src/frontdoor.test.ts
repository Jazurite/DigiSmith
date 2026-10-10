import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
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

  it("updateField PUTs the full body to the field id", async () => {
    const client = makeClient();
    const body = { id: "f1", name: "N" } as never;
    request.mockResolvedValueOnce({ data: { id: "f1" } });
    await client.updateField("f1", body);
    expect(request).toHaveBeenCalledWith({ method: "PUT", url: "/customFields/v2/field/f1", data: body });
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

  it.each([401, 403])("turns HTTP %i into one clear session error", async (status) => {
    const client = makeClient();
    request.mockRejectedValueOnce({ isAxiosError: true, response: { status }, message: "x" });
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    await expect(client.getTaskTypes()).rejects.toThrow(FrontdoorAuthError);
    await Promise.resolve();
    request.mockRejectedValueOnce({ isAxiosError: true, response: { status }, message: "x" });
    await expect(client.getTaskTypes()).rejects.toThrow(
      "Frontdoor session expired or not enough, capture a new one",
    );
  });

  it("rethrows other errors unchanged", async () => {
    const client = makeClient();
    const err = { isAxiosError: true, response: { status: 500 }, message: "boom" };
    request.mockRejectedValueOnce(err);
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    await expect(client.getTaskTypes()).rejects.toBe(err);
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
