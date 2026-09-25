import axios, { AxiosInstance } from "axios";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type {
  ClickUpAttachment,
  ClickUpCustomField,
  ClickUpFolderWithLists,
  ClickUpFoldersResponse,
  ClickUpFieldsResponse,
  ClickUpListDetail,
  ClickUpListSummary,
  ClickUpListsResponse,
  ClickUpTask,
  ClickUpTasksResponse,
  ClickUpTaskType,
  ClickUpTaskTypesResponse,
  ClickUpTaskWriteBody,
} from "./types.ts";
import { RateLimiter } from "./rate-limiter.ts";

const BASE_URL = "https://api.clickup.com/api/v2";
const RATE_LIMIT = 100; // requests
const RATE_WINDOW_SEC = 60;

export interface RequestOptions {
  params?: Record<string, unknown>;
  data?: unknown;
}

export interface ClickUpClientConfig {
  CLICKUP_TEAM_ID: string;
  CLICKUP_API_TOKEN: string;
}

export class ClickUpClient {
  protected readonly teamId: string;
  private readonly http: AxiosInstance;
  private readonly limiter: RateLimiter;

  constructor(config: ClickUpClientConfig) {
    this.teamId = config.CLICKUP_TEAM_ID;
    const token = config.CLICKUP_API_TOKEN;
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: token },
    });
    this.limiter = new RateLimiter(RATE_LIMIT, RATE_LIMIT / RATE_WINDOW_SEC);
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    await this.limiter.acquire();
    const { data } = await this.http.request<T>({
      method,
      url: path,
      params: opts.params,
      data: opts.data,
    });
    return data;
  }

  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  post<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  put<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, opts);
  }

  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, opts);
  }

  async paginate<T>(
    path: string,
    opts: RequestOptions,
    selectPage: (resp: unknown) => T[],
  ): Promise<T[]> {
    const all: T[] = [];
    let page = 0;
    for (;;) {
      const resp = await this.get<unknown>(path, {
        params: { ...opts.params, page },
      });
      const batch = selectPage(resp);
      if (batch.length === 0) break;
      all.push(...batch);
      page++;
    }
    return all;
  }

  async getTaskTypes(): Promise<ClickUpTaskType[]> {
    const data = await this.get<ClickUpTaskTypesResponse>(`/team/${this.teamId}/custom_item`);
    if (!data || !Array.isArray(data.custom_items)) {
      throw new Error("ClickUp response missing custom_items array");
    }
    return data.custom_items;
  }

  getListTasks(listId: string, opts: RequestOptions = {}): Promise<ClickUpTask[]> {
    return this.paginate<ClickUpTask>(
      `/list/${listId}/task`,
      opts,
      (resp) => (resp as ClickUpTasksResponse).tasks ?? [],
    );
  }

  /** Every task on the list, closed and subtasks included — what every sync path wants. */
  getAllListTasks(listId: string): Promise<ClickUpTask[]> {
    return this.getListTasks(listId, {
      params: { include_closed: true, subtasks: true },
    });
  }

  createTask(listId: string, body: ClickUpTaskWriteBody): Promise<ClickUpTask> {
    return this.post<ClickUpTask>(`/list/${listId}/task`, { data: body });
  }

  updateTask(taskId: string, body: ClickUpTaskWriteBody): Promise<ClickUpTask> {
    return this.put<ClickUpTask>(`/task/${taskId}`, { data: body });
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.delete(`/task/${taskId}`);
  }

  async setCustomField(taskId: string, fieldId: string, value: unknown): Promise<void> {
    await this.post(`/task/${taskId}/field/${fieldId}`, { data: { value } });
  }

  /** Multipart upload — ClickUp's attachment endpoint requires this content type. */
  async uploadAttachment(taskId: string, filePath: string): Promise<ClickUpAttachment> {
    const fileBytes = readFileSync(filePath);
    const form = new FormData();
    form.append("attachment", new Blob([fileBytes]), basename(filePath));
    return this.post<ClickUpAttachment>(`/task/${taskId}/attachment`, { data: form });
  }

  async getSpaceFolders(spaceId: string): Promise<ClickUpFolderWithLists[]> {
    const data = await this.get<ClickUpFoldersResponse>(`/space/${spaceId}/folder`);
    return data.folders ?? [];
  }

  async getFolderlessLists(spaceId: string): Promise<ClickUpListSummary[]> {
    const data = await this.get<ClickUpListsResponse>(`/space/${spaceId}/list`);
    return data.lists ?? [];
  }

  async getListFields(listId: string): Promise<ClickUpCustomField[]> {
    const data = await this.get<ClickUpFieldsResponse>(`/list/${listId}/field`);
    return data.fields ?? [];
  }

  async getListStatuses(listId: string): Promise<string[]> {
    const data = await this.get<ClickUpListDetail>(`/list/${listId}`);
    return (data.statuses ?? []).map((s) => s.status);
  }
}
