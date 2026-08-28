import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Credentials {
  email: string;
  token: string;
  site: string;
}

export interface JiraComment {
  id: string;
  body: unknown;
}

export class CredentialsError extends Error {}

function defaultEnvPath(): string {
  return join(homedir(), ".digismith", ".env");
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseEnvFile(path: string): Record<string, string> {
  const content = readFileSync(path, "utf-8");
  const result: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = stripQuotes(line.slice(eq + 1).trim());
    result[key] = value;
  }
  return result;
}

function normalizeSite(site: string): string {
  return site.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

export function checkCredentials(envPath: string = defaultEnvPath()): Credentials {
  let vars: Record<string, string>;
  try {
    vars = parseEnvFile(envPath);
  } catch {
    throw new CredentialsError(`no credentials file found at ${envPath}`);
  }
  const { JIRA_EMAIL, JIRA_API_TOKEN, JIRA_SITE } = vars;
  if (!JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_SITE) {
    throw new CredentialsError(
      `incomplete credentials in ${envPath} — need JIRA_EMAIL, JIRA_API_TOKEN, JIRA_SITE`
    );
  }
  return { email: JIRA_EMAIL, token: JIRA_API_TOKEN, site: normalizeSite(JIRA_SITE) };
}

function authHeader(creds: Credentials): string {
  return "Basic " + Buffer.from(`${creds.email}:${creds.token}`).toString("base64");
}

function baseUrl(creds: Credentials): string {
  return `https://${creds.site}/rest/api/3`;
}

async function jiraFetch(
  url: string,
  init: RequestInit,
  opName: string
): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${opName} failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function getIssue(
  key: string,
  fields: string[],
  creds: Credentials
): Promise<unknown> {
  const url = `${baseUrl(creds)}/issue/${key}?fields=${fields.join(",")}`;
  const res = await jiraFetch(url, { headers: { Authorization: authHeader(creds) } }, "getIssue");
  return res.json();
}

export async function updateDescription(
  key: string,
  adfDoc: unknown,
  creds: Credentials
): Promise<void> {
  const url = `${baseUrl(creds)}/issue/${key}`;
  await jiraFetch(
    url,
    {
      method: "PUT",
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: { description: adfDoc } }),
    },
    "updateDescription"
  );
}

export async function addComment(
  key: string,
  adfDoc: unknown,
  creds: Credentials,
  commentId?: string
): Promise<{ id: string }> {
  const url = commentId
    ? `${baseUrl(creds)}/issue/${key}/comment/${commentId}`
    : `${baseUrl(creds)}/issue/${key}/comment`;
  const method = commentId ? "PUT" : "POST";
  const res = await jiraFetch(
    url,
    {
      method,
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: adfDoc }),
    },
    "addComment"
  );
  return res.json() as Promise<{ id: string }>;
}

const COMMENT_PAGE_SIZE = 100;

export async function getComments(key: string, creds: Credentials): Promise<JiraComment[]> {
  const comments: JiraComment[] = [];
  let startAt = 0;
  for (;;) {
    const url = `${baseUrl(creds)}/issue/${key}/comment?startAt=${startAt}&maxResults=${COMMENT_PAGE_SIZE}`;
    const res = await jiraFetch(
      url,
      { headers: { Authorization: authHeader(creds) } },
      "getComments"
    );
    const page = (await res.json()) as {
      comments: JiraComment[];
      total: number;
    };
    comments.push(...page.comments);
    startAt += page.comments.length;
    if (page.comments.length === 0 || startAt >= page.total) break;
  }
  return comments;
}

async function fetchFollowingRedirectsSameOriginAuthOnly(
  url: string,
  creds: Credentials,
  opName: string
): Promise<Response> {
  let currentUrl = url;
  let currentOrigin = new URL(currentUrl).origin;
  let res = await fetch(currentUrl, {
    headers: { Authorization: authHeader(creds) },
    redirect: "manual",
  });

  let hops = 0;
  while (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) break;
    if (++hops > 5) {
      throw new Error(`${opName} failed: too many redirects`);
    }
    const nextUrl = new URL(location, currentUrl);
    const sameOrigin = nextUrl.origin === currentOrigin;
    currentUrl = nextUrl.toString();
    currentOrigin = nextUrl.origin;
    res = await fetch(currentUrl, {
      headers: sameOrigin ? { Authorization: authHeader(creds) } : {},
      redirect: "manual",
    });
  }

  if (!res.ok) {
    throw new Error(`${opName} failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function getAttachmentContent(
  attachmentId: string,
  outPath: string,
  creds: Credentials
): Promise<string> {
  const url = `${baseUrl(creds)}/attachment/content/${attachmentId}`;
  const res = await fetchFollowingRedirectsSameOriginAuthOnly(url, creds, "getAttachmentContent");
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  return outPath;
}
