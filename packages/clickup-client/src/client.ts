import axios, { AxiosInstance } from "axios";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type {
  ClickUpAttachment,
  ClickUpCreatedFolder,
  ClickUpCustomField,
  ClickUpFolderWithLists,
  ClickUpFoldersResponse,
  ClickUpComment,
  ClickUpCommentCreated,
  ClickUpFieldsResponse,
  ClickUpListDetail,
  ClickUpListSummary,
  ClickUpListsResponse,
  ClickUpListWriteBody,
  ClickUpMoveTaskOptions,
  ClickUpMoveTaskResponse,
  ClickUpUpdatedList,
  ClickUpView,
  ClickUpViewCreateBody,
  ClickUpTask,
  ClickUpTasksResponse,
  ClickUpTaskType,
  ClickUpTaskTypesResponse,
  ClickUpTaskWriteBody,
  DependencyRelation,
  MoveFolderTarget,
} from "./types.ts";
import { isAxiosLike, toApiError } from "./errors.ts";
import { RateLimiter } from "./rate-limiter.ts";

const BASE_URL = "https://api.clickup.com/api/v2";
const BASE_URL_V3 = "https://api.clickup.com/api/v3";
/** A custom task id such as DGS-343. */
const CUSTOM_ID = /^[A-Za-z]+-\d+$/;
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

/** The body of POST /task/{id}/comment; the CLI dry run prints this same object. */
export function commentBody(text: string): { comment_text: string; notify_all: false } {
  return { comment_text: text, notify_all: false };
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

  /** Throws ClickUpApiError (plain fields, never the request headers) for a failed call; other errors pass through. */
  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    await this.limiter.acquire();
    try {
      const { data } = await this.http.request<T>({
        method,
        url: path,
        params: opts.params,
        data: opts.data,
      });
      return data;
    } catch (err) {
      if (isAxiosLike(err)) throw toApiError(err, method, path);
      throw err;
    }
  }

  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  /** The body goes in `{ data: body }`: a bare body is sent empty and ClickUp answers 400. */
  post<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  /** The body goes in `{ data: body }`: a bare body is sent empty and ClickUp answers 400. */
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

  /** How many tasks (closed and subtasks too) in the whole workspace have this task type. */
  async countTasksOfType(typeId: number): Promise<number> {
    const tasks = await this.paginate<ClickUpTask>(
      `/team/${this.teamId}/task?custom_items[]=${typeId}`,
      { params: { include_closed: true, subtasks: true } },
      (resp) => (resp as ClickUpTasksResponse).tasks ?? [],
    );
    return tasks.length;
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

  /** GET /team/{team_id}/task for one space: open tasks only, 100 per page, up to maxPages pages. */
  async searchTeamTasks(spaceId: string, maxPages = 10, status?: string): Promise<ClickUpTask[]> {
    const all: ClickUpTask[] = [];
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<{ tasks: ClickUpTask[] }>(`/team/${this.teamId}/task`, {
        params: { "space_ids[]": spaceId, include_closed: false, subtasks: true, page, ...(status === undefined ? {} : { "statuses[]": status }) },
      });
      all.push(...res.tasks);
      if (res.tasks.length < 100) break;
    }
    return all;
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

  /** DELETE /list/{id}. ClickUp answers {}. Trash or permanent is not known yet (DGS-83). */
  async deleteList(listId: string): Promise<void> {
    await this.delete(`/list/${listId}`);
  }

  /** Reads a task by ClickUp id, or by custom id (DGS-343): keys need custom_task_ids and the team id. */
  getTaskByRef(ref: string, extraParams?: Record<string, string | number | boolean>): Promise<ClickUpTask> {
    const keyParams = CUSTOM_ID.test(ref) ? { custom_task_ids: true, team_id: this.teamId } : undefined;
    const params = keyParams || extraParams ? { ...keyParams, ...extraParams } : undefined;
    return this.get<ClickUpTask>(`/task/${ref}`, { params });
  }

  /** POST /task/{id}/dependency: dependsOn = the task waits on that one; dependencyOf = that one waits on the task. ClickUp answers {}. */
  async addDependency(taskId: string, rel: DependencyRelation): Promise<void> {
    await this.post(`/task/${taskId}/dependency`, {
      data: "dependsOn" in rel ? { depends_on: rel.dependsOn } : { dependency_of: rel.dependencyOf },
    });
  }

  /** DELETE /task/{id}/dependency: the relation goes in the query, not the body. */
  async removeDependency(taskId: string, rel: DependencyRelation): Promise<void> {
    await this.delete(`/task/${taskId}/dependency`, {
      params: "dependsOn" in rel ? { depends_on: rel.dependsOn } : { dependency_of: rel.dependencyOf },
    });
  }

  async addLink(taskId: string, linksTo: string): Promise<void> {
    await this.post(`/task/${taskId}/link/${linksTo}`);
  }

  /** POST /task/{id}/comment. notify_all false: a comment must not ping everyone on the task. Not idempotent. */
  addTaskComment(taskId: string, text: string): Promise<ClickUpCommentCreated> {
    return this.post<ClickUpCommentCreated>(`/task/${taskId}/comment`, { data: commentBody(text) });
  }

  /** GET /task/{id}/comment: the newest comments first (one page, 25 rows). */
  async getTaskComments(taskId: string): Promise<ClickUpComment[]> {
    const res = await this.get<{ comments?: ClickUpComment[] }>(`/task/${taskId}/comment`);
    return res.comments ?? [];
  }

  async removeLink(taskId: string, linksTo: string): Promise<void> {
    await this.delete(`/task/${taskId}/link/${linksTo}`);
  }

  /** Changes the task's home List. v3 URL is absolute, so it overrides axios's v2 baseURL. */
  moveTask(
    taskId: string,
    listId: string,
    options: ClickUpMoveTaskOptions = {},
  ): Promise<ClickUpMoveTaskResponse> {
    return this.put<ClickUpMoveTaskResponse>(
      `${BASE_URL_V3}/workspaces/${this.teamId}/tasks/${taskId}/home_list/${listId}`,
      { data: options },
    );
  }

  createFolder(spaceId: string, name: string): Promise<ClickUpCreatedFolder> {
    return this.post<ClickUpCreatedFolder>(`/space/${spaceId}/folder`, { data: { name } });
  }

  createListInFolder(folderId: string, name: string): Promise<ClickUpListSummary> {
    return this.post<ClickUpListSummary>(`/folder/${folderId}/list`, { data: { name } });
  }

  createListInSpace(spaceId: string, name: string): Promise<ClickUpListSummary> {
    return this.post<ClickUpListSummary>(`/space/${spaceId}/list`, { data: { name } });
  }

  updateList(listId: string, body: ClickUpListWriteBody): Promise<ClickUpUpdatedList> {
    return this.put<ClickUpUpdatedList>(`/list/${listId}`, { data: body });
  }

  /** valueOptions.time: the value is a date with a time part (ms epoch), not a day. */
  async setCustomField(taskId: string, fieldId: string, value: unknown, valueOptions?: { time: boolean }): Promise<void> {
    await this.post(`/task/${taskId}/field/${fieldId}`, {
      data: valueOptions === undefined ? { value } : { value, value_options: valueOptions },
    });
  }

  async getSpaceViews(spaceId: string): Promise<ClickUpView[]> {
    return (await this.get<{ views: ClickUpView[] }>(`/space/${spaceId}/view`)).views ?? [];
  }

  async createSpaceView(spaceId: string, body: ClickUpViewCreateBody): Promise<ClickUpView> {
    return (await this.post<{ view: ClickUpView }>(`/space/${spaceId}/view`, { data: body })).view;
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

  /** PUT /folder/{id}/position: nests the folder in another folder, or moves it to a space's top level. ClickUp answers {}. */
  async moveFolder(folderId: string, target: MoveFolderTarget): Promise<void> {
    const data: Record<string, unknown> =
      "parentFolderId" in target ? { parent_folder_id: target.parentFolderId } : { space_id: target.spaceId };
    if (target.position !== undefined) data.position = target.position;
    await this.put(`/folder/${folderId}/position`, { data });
  }

  /** PUT /folder/{id} {name}: renames the folder. ClickUp answers the updated folder. */
  updateFolder(folderId: string, name: string): Promise<ClickUpCreatedFolder> {
    return this.put<ClickUpCreatedFolder>(`/folder/${folderId}`, { data: { name } });
  }

  getFolder(folderId: string): Promise<ClickUpCreatedFolder> {
    return this.get<ClickUpCreatedFolder>(`/folder/${folderId}`);
  }

  /** DELETE /folder/{id}. ClickUp answers {}. Callers must prove the folder is empty first (getFolderLists). */
  async deleteFolder(folderId: string): Promise<void> {
    await this.delete(`/folder/${folderId}`);
  }

  /** A folder's lists, archived included: the API hides archived lists unless archived=true, so read both and merge by id. */
  async getFolderLists(folderId: string): Promise<ClickUpListSummary[]> {
    const path = `/folder/${folderId}/list`;
    const byId = new Map<string, ClickUpListSummary>();
    for (const archived of [false, true]) {
      const data = await this.get<ClickUpListsResponse>(path, { params: { archived } });
      // Fail closed: a body without a lists array must not read as "no lists".
      if (!Array.isArray(data?.lists)) throw new Error(`unexpected answer from GET ${path} (archived=${archived}): no lists array`);
      for (const l of data.lists) if (!byId.has(l.id)) byId.set(l.id, l);
    }
    return [...byId.values()];
  }

  async getFolderlessLists(spaceId: string): Promise<ClickUpListSummary[]> {
    const data = await this.get<ClickUpListsResponse>(`/space/${spaceId}/list`);
    return data.lists ?? [];
  }

  getList(listId: string): Promise<ClickUpListDetail> {
    return this.get<ClickUpListDetail>(`/list/${listId}`);
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
