import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Credentials {
  email: string;
  token: string;
  site: string;
}

export class CredentialsError extends Error {}

function defaultEnvPath(): string {
  return join(homedir(), ".digismith", ".env");
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
    const value = line.slice(eq + 1).trim();
    result[key] = value;
  }
  return result;
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
  return { email: JIRA_EMAIL, token: JIRA_API_TOKEN, site: JIRA_SITE };
}

function authHeader(creds: Credentials): string {
  return "Basic " + Buffer.from(`${creds.email}:${creds.token}`).toString("base64");
}

function baseUrl(creds: Credentials): string {
  return `https://${creds.site}/rest/api/3`;
}

export async function getIssue(
  key: string,
  fields: string[],
  creds: Credentials
): Promise<unknown> {
  const url = `${baseUrl(creds)}/issue/${key}?fields=${fields.join(",")}`;
  const res = await fetch(url, { headers: { Authorization: authHeader(creds) } });
  if (!res.ok) {
    throw new Error(`getIssue failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function updateDescription(
  key: string,
  adfDoc: unknown,
  creds: Credentials
): Promise<void> {
  const url = `${baseUrl(creds)}/issue/${key}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { description: adfDoc } }),
  });
  if (!res.ok) {
    throw new Error(`updateDescription failed: HTTP ${res.status} ${await res.text()}`);
  }
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
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: adfDoc }),
  });
  if (!res.ok) {
    throw new Error(`addComment failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ id: string }>;
}

export async function getAttachmentContent(
  attachmentId: string,
  outPath: string,
  creds: Credentials
): Promise<string> {
  const url = `${baseUrl(creds)}/attachment/content/${attachmentId}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(creds) },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`getAttachmentContent failed: HTTP ${res.status} ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  return outPath;
}
