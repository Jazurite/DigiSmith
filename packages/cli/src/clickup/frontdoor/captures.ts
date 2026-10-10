import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const RAW_NAME = /^Raw_(\d\d)_(\d\d)_(\d{4})_(\d\d)_(\d\d)_(\d\d)/;

export interface CapturedCall {
  n: number;
  requestLine: string;
  host: string;
  isFrontdoor: boolean;
  /** Lower-cased header names. Read these only to import auth; never print them. */
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseStatus?: string;
  responseBody?: string;
}

/** The newest Raw_* export in a captures folder, by the timestamp in its name. */
export function newestCapture(root: string): string {
  let best: { key: number; name: string } | undefined;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const m = RAW_NAME.exec(name);
    if (!m) continue;
    const [mo, d, y, h, mi, s] = m.slice(1).map(Number);
    const key = Date.UTC(y, mo - 1, d, h, mi, s);
    if (!best || key > best.key) best = { key, name };
  }
  if (!best) throw new Error(`no Raw_* capture in ${root}`);
  return join(root, best.name);
}

function splitMessage(raw: string): { head: string[]; body: string } {
  const sep = raw.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
  const at = raw.indexOf(sep);
  const head = at === -1 ? raw : raw.slice(0, at);
  const body = at === -1 ? "" : raw.slice(at + sep.length);
  return { head: head.split(/\r?\n/), body };
}

/** Every request in a Proxyman raw export, with its response, sorted by call number. */
export function readCalls(folder: string): CapturedCall[] {
  const files = readdirSync(folder);
  const calls: CapturedCall[] = [];
  for (const file of files) {
    const m = /^\[(\d+)\] Request/.exec(file);
    if (!m) continue;
    const n = Number(m[1]);
    const req = splitMessage(readFileSync(join(folder, file), "utf-8"));
    const requestHeaders: Record<string, string> = {};
    for (const line of req.head.slice(1)) {
      const colon = line.indexOf(":");
      if (colon > 0) requestHeaders[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    const requestLine = (req.head[0] ?? "").replace(/ HTTP\/[\d.]+$/, "");
    const host = requestHeaders.host ?? "";
    const call: CapturedCall = {
      n,
      requestLine,
      host,
      isFrontdoor: host.startsWith("frontdoor-prod-") || file.includes("frontdoor-prod-"),
      requestHeaders,
      requestBody: req.body,
    };
    const resFile = files.find((f) => f.startsWith(`[${n}] Response`));
    if (resFile) {
      const res = splitMessage(readFileSync(join(folder, resFile), "utf-8"));
      call.responseStatus = res.head[0];
      call.responseBody = res.body;
    }
    calls.push(call);
  }
  return calls.sort((a, b) => a.n - b.n);
}

export function maskJwts(text: string): string {
  return text.replace(JWT, "<JWT-REDACTED>");
}

const REDACTED = "<REDACTED>";
const CREDENTIAL_KEY = /token|cookie|auth|secret|passw|session|credential|csrf|api[_-]?key|bearer/i;
const OPAQUE = /^[A-Za-z0-9_\-+/=.]{40,}$/;

function maskValue(value: unknown, key?: string): unknown {
  if (key !== undefined && CREDENTIAL_KEY.test(key)) return REDACTED;
  if (typeof value === "string") return OPAQUE.test(value) ? REDACTED : value;
  if (Array.isArray(value)) return value.map((v) => maskValue(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskValue(v, k)]));
  }
  return value;
}

/** Masks JWTs and the values of credential-named query parameters in a "METHOD /path?query" line. */
export function maskRequestLine(line: string): string {
  return maskJwts(line).replace(/([?&])([^=&\s]+)=([^&\s]*)/g, (m, sep: string, k: string) =>
    CREDENTIAL_KEY.test(k) ? `${sep}${k}=${REDACTED}` : m,
  );
}

/** Masks JWTs, credential-named fields (JSON at any depth, or key=value text) and long opaque strings. */
export function maskBody(body: string): string {
  const jwtFree = maskJwts(body);
  try {
    return JSON.stringify(maskValue(JSON.parse(jwtFree)));
  } catch {
    return jwtFree.replace(/([A-Za-z0-9_-]+)=([^&\s]+)/g, (m, k: string) =>
      CREDENTIAL_KEY.test(k) ? `${k}=${REDACTED}` : m,
    );
  }
}

/** The exp claim (epoch seconds) of the first JWT in a header value, if any. */
export function jwtExpiry(value: string): number | undefined {
  const m = /eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/.exec(value);
  if (!m) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(m[1], "base64url").toString("utf-8")) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp : undefined;
  } catch {
    return undefined;
  }
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

/** UTC+7 first, UTC in brackets. */
export function formatExpiry(epochSeconds: number): string {
  const ms = epochSeconds * 1000;
  return `${stamp(ms + 7 * 3600 * 1000)} UTC+7 [${stamp(ms)} UTC]`;
}
