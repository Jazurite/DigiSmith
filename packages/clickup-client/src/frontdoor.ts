import axios, { AxiosInstance } from "axios";
import { randomBytes } from "node:crypto";
import type { ClickUpTaskType, MoveListTarget, FrontdoorField, FrontdoorFieldWithLocations, FrontdoorFieldPutBody, FrontdoorFieldCreateBody, FrontdoorTaskTypeBody, FrontdoorStatus, FrontdoorStatusSetBody } from "./types.ts";
import { isAxiosLike, toApiError } from "./errors.ts";
import { RateLimiter } from "./rate-limiter.ts";
import { RenewalError, isDue, renewSession, tokenExpiry } from "./frontdoor-session.ts";
import type { RenewTransport, SessionStore } from "./frontdoor-session.ts";

export const DEFAULT_FRONTDOOR_HOST = "frontdoor-prod-ap-southeast-2-2.clickup.com";
const RATE_LIMIT = 100;
const RATE_WINDOW_SEC = 60;

export class FrontdoorAuthError extends Error {
  constructor(message = "Frontdoor session expired or not enough, capture a new one") {
    super(message);
  }
}

function isAuthStatus(err: unknown): boolean {
  const status = (err as { response?: { status?: number } }).response?.status;
  return status === 401 || status === 403;
}

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** The id form the web app gives a new line: "block-" and 10 letters or digits. */
function newBlockId(): string {
  const bytes = randomBytes(10);
  let id = "block-";
  for (const b of bytes) id += ALPHANUM[b % ALPHANUM.length];
  return id;
}

/**
 * A folder description as the Quill delta ClickUp keeps, as a JSON string: per line one text op
 * (none for an empty line) and one "\n" op with its own block-id. A final newline is added when missing.
 */
export function folderDescriptionDelta(text: string): string {
  const lines = (text.endsWith("\n") ? text : `${text}\n`).split("\n").slice(0, -1);
  const ops: Array<{ insert: string; attributes?: { "block-id": string } }> = [];
  for (const line of lines) {
    if (line !== "") ops.push({ insert: line });
    ops.push({ insert: "\n", attributes: { "block-id": newBlockId() } });
  }
  return JSON.stringify({ ops });
}

/** The plain text of a delta string: the text inserts joined, formatting and embeds dropped. */
export function folderDescriptionText(content: string): string {
  let delta: unknown;
  try {
    delta = JSON.parse(content);
  } catch {
    throw new Error("folder content is not a delta (not JSON)");
  }
  const ops = (delta as { ops?: unknown }).ops;
  if (!Array.isArray(ops)) throw new Error("folder content is not a delta (no ops list)");
  return ops.map((o) => (typeof (o as { insert?: unknown }).insert === "string" ? (o as { insert: string }).insert : "")).join("");
}

export interface FrontdoorClientConfig {
  CLICKUP_TEAM_ID: string;
  /** The full Authorization header value of a captured Frontdoor session. */
  CLICKUP_FRONTDOOR_AUTH: string;
  host?: string;
  /** With a stored refresh cookie the client renews its own session; without one it behaves as before. */
  session?: SessionStore;
  /** Test seam for the renewal call. */
  transport?: RenewTransport;
  /** Epoch milliseconds; a test seam. */
  now?: () => number;
}

/**
 * Calls the public API cannot do (task types today). Session auth, so it expires:
 * prefer ClickUpClient wherever the public API can do the job.
 */
export class FrontdoorClient {
  readonly teamId: string;
  private readonly http: AxiosInstance;
  private readonly limiter: RateLimiter;
  private readonly session: SessionStore | undefined;
  private readonly transport: RenewTransport | undefined;
  private readonly now: () => number;
  private readonly initialAuth: string;
  private auth: string;

  constructor(config: FrontdoorClientConfig) {
    this.teamId = config.CLICKUP_TEAM_ID;
    this.session = config.session;
    this.transport = config.transport;
    this.now = config.now ?? Date.now;
    this.initialAuth = this.auth = config.CLICKUP_FRONTDOOR_AUTH;
    this.http = axios.create({
      baseURL: `https://${config.host ?? DEFAULT_FRONTDOOR_HOST}`,
      headers: { Authorization: config.CLICKUP_FRONTDOOR_AUTH },
    });
    this.limiter = new RateLimiter(RATE_LIMIT, RATE_LIMIT / RATE_WINDOW_SEC);
  }

  private canRenew(): boolean {
    return this.session !== undefined && Boolean(this.session.read()?.refreshCookie);
  }

  /** Renews under the store's lock (or adopts what another dg process stored). Any failure is a FrontdoorAuthError with a plain message. */
  private async renew(): Promise<void> {
    try {
      const r = await renewSession({
        store: this.session!,
        teamId: this.teamId,
        transport: this.transport,
        now: this.now,
        heldAuth: this.auth,
      });
      this.auth = r.session.auth;
    } catch (err) {
      if (err instanceof RenewalError) throw new FrontdoorAuthError(err.message);
      throw err;
    }
  }

  private async send<T>(method: "GET" | "POST" | "PUT", url: string, data?: unknown): Promise<T> {
    // The header is set per call only after a renewal, so a client that never renews sends exactly what axios.create got.
    const headers = this.auth === this.initialAuth ? undefined : { Authorization: this.auth };
    const res = await this.http.request<T>({ method, url, data, ...(headers ? { headers } : {}) });
    return res.data;
  }

  private async request<T>(method: "GET" | "POST" | "PUT", url: string, data?: unknown): Promise<T> {
    await this.limiter.acquire();
    if (this.canRenew() && isDue(this.auth, Math.floor(this.now() / 1000))) {
      try {
        await this.renew();
      } catch (err) {
        // A token with minutes left still works: let the call go and renew on its 401. Expired: stop here.
        const exp = tokenExpiry(this.auth);
        if (exp === undefined || exp <= Math.floor(this.now() / 1000)) throw err;
      }
    }
    try {
      return await this.send<T>(method, url, data);
    } catch (err) {
      if (isAuthStatus(err) && this.canRenew()) {
        await this.renew();
        try {
          return await this.send<T>(method, url, data);
        } catch (retryErr) {
          throw this.failure(retryErr, method, url);
        }
      }
      throw this.failure(err, method, url);
    }
  }

  private failure(err: unknown, method: string, url: string): unknown {
    if (isAuthStatus(err)) return new FrontdoorAuthError();
    // Same as ClickUpClient: plain fields only, never the request headers.
    if (isAxiosLike(err)) return toApiError(err, method, url);
    return err;
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

  /** The field with its locations (where it shows). Read only. */
  getFieldLocations(id: string): Promise<FrontdoorFieldWithLocations> {
    return this.request<FrontdoorFieldWithLocations>("GET", `/customFields/v2/field/${id}?locations=true`);
  }

  /** How many tasks hold one option of a dropdown (the web app asks before a removal). Read only; ClickUp answers a string. Throws on anything but a whole number >= 0, so a caller never reads a bad answer as zero. */
  async getFieldValueCount(id: string, optionId: string): Promise<number> {
    const res = await this.request<{ value_count?: string | number }>(
      "GET",
      `/customFields/v2/field/${id}?count_values=true&option_id=${optionId}`,
    );
    const raw = String(res.value_count ?? "").trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < 0) {
      throw new Error(`field ${id}: value_count is not a count: ${JSON.stringify(res.value_count)}`);
    }
    return n;
  }

  updateField(id: string, body: FrontdoorFieldPutBody): Promise<FrontdoorField> {
    return this.request<FrontdoorField>("PUT", `/customFields/v2/field/${id}`, body);
  }

  /** The space's status set (the same shape putSpaceStatuses takes). */
  async getSpaceStatuses(spaceId: string): Promise<FrontdoorStatus[]> {
    const space = await this.request<{ statuses?: FrontdoorStatus[] }>("GET", `/hierarchy/v1/project/${spaceId}`);
    // An empty or missing list must never pass as "the set is empty": the PUT would then replace the set with one status.
    if (!Array.isArray(space.statuses) || space.statuses.length === 0) {
      throw new Error(`space ${spaceId} answered with no statuses (missing, empty or not a list); refusing to go on`);
    }
    return space.statuses;
  }

  /** Replaces the WHOLE status set of a space: a status missing from the body is removed. ClickUp answers {}. */
  async putSpaceStatuses(spaceId: string, body: FrontdoorStatusSetBody): Promise<void> {
    await this.request("PUT", `/hierarchy/v1/project/${spaceId}/status?checkConflict=true`, body);
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

  /** Sets a folder's description (plain text; the public API has no such field). ClickUp answers the folder. */
  async setFolderDescription(folderId: string, text: string): Promise<void> {
    await this.request("PUT", `/hierarchy/v1/category/${folderId}`, { content: folderDescriptionDelta(text) });
  }

  /** The description as plain text, with the final newline the editor always keeps. A folder with null content reads as "". */
  async getFolderDescription(folderId: string): Promise<string> {
    const folder = await this.request<{ content?: string | null }>("GET", `/hierarchy/v1/category/${folderId}`);
    if (folder?.content === undefined) throw new Error(`folder ${folderId} answered with no content field`);
    return folder.content === null ? "" : folderDescriptionText(folder.content);
  }

  /** Restores a deleted List from the Trash, with its tasks (the web app's undo of a delete). ClickUp answers {}. */
  async restoreList(listId: string): Promise<void> {
    await this.request("PUT", `/v1/subcategory/${listId}/undo`, { method: "delete" });
  }
}
