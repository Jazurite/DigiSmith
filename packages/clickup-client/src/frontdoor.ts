import axios, { AxiosInstance } from "axios";
import type { ClickUpTaskType, FrontdoorTaskTypeBody } from "./types.ts";
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
}
