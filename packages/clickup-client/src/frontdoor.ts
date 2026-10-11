import axios, { AxiosInstance } from "axios";
import type { ClickUpTaskType, MoveListTarget, FrontdoorField, FrontdoorFieldPutBody, FrontdoorFieldCreateBody, FrontdoorTaskTypeBody } from "./types.ts";
import { RateLimiter } from "./rate-limiter.ts";

export const DEFAULT_FRONTDOOR_HOST = "frontdoor-prod-ap-southeast-2-2.clickup.com";
const RATE_LIMIT = 100;
const RATE_WINDOW_SEC = 60;

export class FrontdoorAuthError extends Error {
  constructor() {
    super("Frontdoor session expired or not enough, capture a new one");
  }
}

export interface FrontdoorClientConfig {
  CLICKUP_TEAM_ID: string;
  /** The full Authorization header value of a captured Frontdoor session. */
  CLICKUP_FRONTDOOR_AUTH: string;
  host?: string;
}

/**
 * Calls the public API cannot do (task types today). Session auth, so it expires:
 * prefer ClickUpClient wherever the public API can do the job.
 */
export class FrontdoorClient {
  readonly teamId: string;
  private readonly http: AxiosInstance;
  private readonly limiter: RateLimiter;

  constructor(config: FrontdoorClientConfig) {
    this.teamId = config.CLICKUP_TEAM_ID;
    this.http = axios.create({
      baseURL: `https://${config.host ?? DEFAULT_FRONTDOOR_HOST}`,
      headers: { Authorization: config.CLICKUP_FRONTDOOR_AUTH },
    });
    this.limiter = new RateLimiter(RATE_LIMIT, RATE_LIMIT / RATE_WINDOW_SEC);
  }

  private async request<T>(method: "GET" | "POST" | "PUT", url: string, data?: unknown): Promise<T> {
    await this.limiter.acquire();
    try {
      const res = await this.http.request<T>({ method, url, data });
      return res.data;
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403) throw new FrontdoorAuthError();
      // Same as ClickUpClient: keep the error object, only show ClickUp's body in the message.
      const body = (err as { response?: { data?: unknown } }).response?.data;
      if (err instanceof Error && body !== undefined && body !== "") {
        err.message += `: ${typeof body === "string" ? body : JSON.stringify(body)}`;
      }
      throw err;
    }
  }

  async getTaskTypes(): Promise<ClickUpTaskType[]> {
    const data = await this.request<{ custom_items?: ClickUpTaskType[] }>(
      "GET",
      `/tasks/v1/${this.teamId}/customItems`,
    );
    if (!data || !Array.isArray(data.custom_items)) {
      throw new Error("Frontdoor response missing custom_items array");
    }
    return data.custom_items;
  }

  createTaskType(body: FrontdoorTaskTypeBody): Promise<ClickUpTaskType> {
    return this.request<ClickUpTaskType>("POST", `/tasks/v1/${this.teamId}/customItem`, body);
  }

  updateTaskType(id: number, body: FrontdoorTaskTypeBody): Promise<ClickUpTaskType> {
    return this.request<ClickUpTaskType>("PUT", `/tasks/v1/${this.teamId}/customItem/${id}`, body);
  }

  /** Moves every task of the type to the destination type (0 = plain task), then removes the type. */
  async mergeTaskType(id: number, destinationId: number): Promise<void> {
    await this.request("PUT", `/task-v3/core/${this.teamId}/customItems/${id}/merge`, {
      destination_custom_item_id: destinationId,
    });
  }

  getField(id: string): Promise<FrontdoorField> {
    return this.request<FrontdoorField>("GET", `/customFields/v2/field/${id}`);
  }

  /** How many tasks hold one option of a dropdown (the web app asks before a removal). Read only; ClickUp answers a string. */
  async getFieldValueCount(id: string, optionId: string): Promise<number> {
    const res = await this.request<{ value_count?: string | number }>(
      "GET",
      `/customFields/v2/field/${id}?count_values=true&option_id=${optionId}`,
    );
    return Number(res.value_count ?? 0);
  }

  updateField(id: string, body: FrontdoorFieldPutBody): Promise<FrontdoorField> {
    return this.request<FrontdoorField>("PUT", `/customFields/v2/field/${id}`, body);
  }

  /** Creates a field. With category_id in the body it is scoped to that folder; no second location call is needed. */
  createField(body: FrontdoorFieldCreateBody): Promise<FrontdoorField> {
    return this.request<FrontdoorField>("POST", "/customFields/v2/field?ignore_existing=true", body);
  }

  /**
   * Moves a List into a Folder at a position, or (no folderId) reorders it inside its own folder:
   * the web app sends the position only then, and ClickUp answers 400 when the category is sent. ClickUp answers {}.
   */
  async moveList(listId: string, target: MoveListTarget): Promise<void> {
    await this.request(
      "PUT",
      `/hierarchy/v2/subcategory/${listId}/position?v2=true&conflict_modal=true&return_conflict_on_cancel=true`,
      {
        position: target.position,
        include_archived: false,
        ...(target.folderId !== undefined ? { category: target.folderId } : {}),
      },
    );
  }

  /** Restores a deleted List from the Trash, with its tasks (the web app's undo of a delete). ClickUp answers {}. */
  async restoreList(listId: string): Promise<void> {
    await this.request("PUT", `/v1/subcategory/${listId}/undo`, { method: "delete" });
  }
}
