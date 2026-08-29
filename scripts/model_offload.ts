// Offload only activates from DigiSmith's own repo: profiles/<name>.yml lives
// there, and a non-interactive script has no way to ask for DigiSmith's path
// the way a conversational skill can. Run from anywhere else and the caller
// falls back to in-session generation.
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, requireArgs } from "./cli-args.ts";
import { resolveProvider } from "./providers/registry.ts";
import type { GatewayProvider } from "./providers/types.ts";

const TIMEOUT_MS = 60_000;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readUtf8Strict(path: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
}

export function isDigismithRepo(): boolean {
  const pluginJsonPath = join(process.cwd(), ".claude-plugin", "plugin.json");
  if (!isFile(pluginJsonPath)) return false;
  try {
    const config = JSON.parse(readUtf8Strict(pluginJsonPath));
    return config?.name === "digismith";
  } catch {
    return false;
  }
}

export function parseFieldValue(line: string): string {
  const colonIndex = line.indexOf(":");
  const afterColon = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
  const hashIndex = afterColon.indexOf("#");
  const beforeComment = hashIndex === -1 ? afterColon : afterColon.slice(0, hashIndex);
  return beforeComment.trim().replace(/^['"]+|['"]+$/g, "");
}

export function readProfileProvider(profilePath: string): string | null {
  if (!isFile(profilePath)) return null;

  let profileName: string;
  try {
    profileName = readUtf8Strict(profilePath).trim();
  } catch {
    return null;
  }
  if (!profileName) return null;

  if (!isDigismithRepo()) return null;

  const profilesFile = join(process.cwd(), "profiles", `${profileName}.yml`);
  if (!isFile(profilesFile)) return null;

  let content: string;
  try {
    content = readUtf8Strict(profilesFile);
  } catch {
    return null;
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("model_offload_provider:")) {
      return parseFieldValue(line);
    }
  }
  return null;
}

// Same plain-text parsing semantics as packages/jira-client/src/client.ts's
// parseEnvFile: split each line on the first "=", strip matching leading/
// trailing quotes, skip blank lines and "#" comments. Not imported from
// that package directly — it's a separate package — this is a local
// equivalent scoped to the one file this script reads.
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

function readDigismithEnvFile(): Record<string, string> {
  const path = join(homedir(), ".digismith", ".env");
  if (!isFile(path)) return {};

  let content: string;
  try {
    content = readUtf8Strict(path);
  } catch {
    return {};
  }

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

export function getCredential(provider: GatewayProvider): string | null {
  const envValue = process.env[provider.credentialEnv];
  if (envValue && envValue.trim()) return envValue.trim();

  const fileValue = readDigismithEnvFile()[provider.credentialEnv];
  return fileValue && fileValue.trim() ? fileValue.trim() : null;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

export async function callProvider(
  provider: GatewayProvider,
  prompt: string,
  apiKey: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model("mechanical"),
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new HttpError(response.status);
    }

    const payload: unknown = await response.json();
    const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message
      ?.content;
    if (typeof content !== "string") {
      throw new Error("malformed response: content is not a string");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export function hasExpectedHtmlShape(content: string): boolean {
  const text = content.trim();
  if (!text.toLowerCase().startsWith("<!doctype html")) return false;
  if (!text.endsWith("</html>")) return false;
  if (text.includes("{{")) return false;
  if (text.includes("```")) return false;
  return true;
}

export type OffloadResult = [string | null, string];

export async function offload(prompt: string, profilePath: string): Promise<OffloadResult> {
  const providerName = readProfileProvider(profilePath);
  const provider = providerName ? resolveProvider(providerName) : undefined;

  if (!provider) {
    if (!isDigismithRepo()) {
      return [null, "offload: skipped (not DigiSmith's own repo — offload only runs there)"];
    }
    return [
      null,
      `offload: skipped (model_offload_provider=${JSON.stringify(providerName)}, no such registered provider)`,
    ];
  }

  const apiKey = getCredential(provider);
  if (!apiKey) {
    return [null, `offload: skipped (no ${provider.credentialEnv} credentials found)`];
  }

  let content: string;
  try {
    content = await callProvider(provider, prompt, apiKey);
  } catch (err) {
    if (err instanceof HttpError) {
      return [null, `offload: failed (HTTP ${err.status})`];
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      return [null, "offload: failed (network error: timed out)"];
    }
    return [null, `offload: failed (${err instanceof Error ? err.message : String(err)})`];
  }

  if (!content.trim()) {
    return [null, "offload: failed (empty response)"];
  }

  if (!hasExpectedHtmlShape(content)) {
    return [null, "offload: failed (malformed HTML shape)"];
  }

  return [content, `offload: success (${provider.name}/${provider.model("mechanical")})`];
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    requireArgs(args, ["prompt-file"]);
  } catch (err) {
    console.error(`offload: failed (${err instanceof Error ? err.message : String(err)})`);
    process.exitCode = 1;
    return;
  }

  const profilePath = args["profile-path"] ?? ".digismith/profile";

  let prompt: string;
  try {
    prompt = readFileSync(args["prompt-file"], "utf-8");
  } catch (err) {
    console.error(
      `offload: failed (cannot read prompt file: ${err instanceof Error ? err.message : String(err)})`,
    );
    process.exitCode = 1;
    return;
  }

  const [content, status] = await offload(prompt, profilePath);
  console.error(status);

  if (content === null) {
    process.exitCode = 1;
    return;
  }

  console.log(content);
  process.exitCode = 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
