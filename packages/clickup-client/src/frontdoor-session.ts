import axios from "axios";

/** What the Frontdoor client needs to keep a session alive: the Authorization header value and the cookie that mints a new one. */
export interface FrontdoorSession {
  /** The full Authorization header value, "Bearer <jwt>". */
  auth: string;
  /** "cu_refresh=<v>; cu_session_meta=<v>". Absent means this session cannot renew itself. */
  refreshCookie?: string;
}

/** Where the session lives. The lock keeps two dg processes from renewing with the same cookie at once. */
export interface SessionStore {
  read(): FrontdoorSession | undefined;
  write(session: FrontdoorSession): void;
  withLock<T>(fn: () => Promise<T>): Promise<T>;
}

export interface RenewRequest {
  url: string;
  headers: Record<string, string>;
}

export interface RenewResponse {
  status: number;
  body: unknown;
  /** Every Set-Cookie header line of the response. */
  setCookies: string[];
}

export type RenewTransport = (req: RenewRequest) => Promise<RenewResponse>;

export const RENEW_HOST = "https://id.app.clickup.com";
export const RENEW_MARGIN_SEC = 600;
const RENEW_HINT = "capture a new session with Proxyman, then dg clickup frontdoor import-auth";
const ROTATING_COOKIES = ["cu_refresh", "cu_session_meta"];

export const RENEW_URL_PATH = (teamId: string): string => `/data/v3/workspaces/${teamId}/authentication/access_tokens`;

/** A renewal that failed. The message is plain: an HTTP code or "no answer", never a header, cookie or body. */
export class RenewalError extends Error {
  readonly status: number | undefined;
  constructor(status: number | undefined, detail?: string) {
    super(
      status === undefined
        ? `renewal failed (no answer${detail ? `: ${detail}` : ""}): ${RENEW_HINT}`
        : `renewal failed (HTTP ${status}): ${RENEW_HINT}`,
    );
    this.name = "RenewalError";
    this.status = status;
  }
}

/** The exp claim (epoch seconds) of the JWT in an Authorization value, with or without "Bearer ". */
export function tokenExpiry(auth: string): number | undefined {
  const m = /eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/.exec(auth);
  if (!m) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(m[1], "base64url").toString("utf-8")) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp : undefined;
  } catch {
    return undefined;
  }
}

/** True when the token expires in under 10 minutes or is already expired. A token without a readable exp is never due. */
export function isDue(auth: string, nowSec: number): boolean {
  const exp = tokenExpiry(auth);
  return exp !== undefined && exp - nowSec < RENEW_MARGIN_SEC;
}

/** Takes cu_refresh and cu_session_meta from the response's non-empty Set-Cookie lines; every other cookie is left out. */
export function mergeCookies(stored: string, setCookies: string[]): string {
  const pairs = new Map<string, string>();
  for (const part of stored.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) pairs.set(part.slice(0, i), part.slice(i + 1));
  }
  for (const line of setCookies) {
    const first = line.split(";")[0];
    const i = first.indexOf("=");
    if (i <= 0) continue;
    const name = first.slice(0, i).trim();
    const value = first.slice(i + 1).trim();
    if (ROTATING_COOKIES.includes(name) && value !== "") pairs.set(name, value);
  }
  // Fixed order, so the stored value does not depend on which cookie a response happened to set first.
  const rank = (name: string): number => (ROTATING_COOKIES.includes(name) ? ROTATING_COOKIES.indexOf(name) : ROTATING_COOKIES.length);
  return [...pairs]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/** The default transport. validateStatus keeps axios from throwing on a 4xx, so no AxiosError (which holds the request headers) exists. */
export const axiosRenewTransport: RenewTransport = async (req) => {
  try {
    const res = await axios.post(req.url, undefined, { headers: req.headers, validateStatus: () => true });
    const raw = res.headers?.["set-cookie"];
    return { status: res.status, body: res.data, setCookies: Array.isArray(raw) ? raw : raw ? [String(raw)] : [] };
  } catch (err) {
    // The error text is dropped: only the network code, which holds no secret.
    throw new RenewalError(undefined, (err as { code?: string }).code);
  }
};

export interface RenewOptions {
  store: SessionStore;
  teamId: string;
  transport?: RenewTransport;
  /** Epoch milliseconds. */
  now?: () => number;
  /** The token the caller holds. When the store has a different, fresh one (another process renewed), it is used and no call is made. */
  heldAuth?: string;
}

export interface RenewResult {
  session: FrontdoorSession;
  renewed: boolean;
  oldExp: number | undefined;
  newExp: number | undefined;
}

/**
 * Mints a new Frontdoor token with the stored refresh cookie (the call the web app makes) and stores it.
 * Runs under the store's lock. Throws RenewalError on any failure; nothing it throws holds a secret.
 */
export function renewSession(opts: RenewOptions): Promise<RenewResult> {
  const transport = opts.transport ?? axiosRenewTransport;
  const nowSec = (): number => Math.floor((opts.now ?? Date.now)() / 1000);
  return opts.store.withLock(async () => {
    const current = opts.store.read();
    if (!current?.refreshCookie) throw new Error("no refresh cookie stored; run dg clickup frontdoor import-auth on a capture that has one");
    const oldExp = tokenExpiry(current.auth);
    if (opts.heldAuth !== undefined && current.auth !== opts.heldAuth && !isDue(current.auth, nowSec())) {
      return { session: current, renewed: false, oldExp, newExp: oldExp };
    }
    // Whatever the transport throws is dropped: its text could hold a header.
    const res = await transport({
      url: `${RENEW_HOST}${RENEW_URL_PATH(opts.teamId)}`,
      headers: { Cookie: current.refreshCookie, Origin: "https://app.clickup.com", Referer: "https://app.clickup.com/" },
    }).catch((err: unknown) => {
      throw err instanceof RenewalError ? err : new RenewalError(undefined);
    });
    const token = (res.body as { token?: unknown } | null | undefined)?.token;
    if (res.status !== 200 || typeof token !== "string" || token === "") throw new RenewalError(res.status);
    const session: FrontdoorSession = {
      auth: `Bearer ${token}`,
      refreshCookie: mergeCookies(current.refreshCookie, res.setCookies),
    };
    opts.store.write(session);
    return { session, renewed: true, oldExp, newExp: tokenExpiry(session.auth) };
  });
}
