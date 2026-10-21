import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface NexusDeps { baseUrl: string; tokenFile: string; fetch: typeof fetch; timeoutMs?: number }
export type RunNowResult = { ok: true } | { ok: false; status: number | null; error: string };

export function defaultNexus(env: NodeJS.ProcessEnv = process.env): { baseUrl: string; tokenFile: string } {
  const stateDir = env.NEXUS_STATE_DIR || join(homedir(), ".digismith-depot", "nexus", "scheduler");
  return { baseUrl: env.NEXUS_URL || "http://127.0.0.1:4300", tokenFile: join(stateDir, "token") };
}

// Never throws. Error text never carries the token.
export async function runNow(d: NexusDeps, job: string): Promise<RunNowResult> {
  let token: string;
  try {
    token = readFileSync(d.tokenFile, "utf-8").trim();
  } catch {
    return { ok: false, status: null, error: "cannot read the Nexus token file" };
  }
  if (token === "") return { ok: false, status: null, error: "the Nexus token file is empty" };
  try {
    const res = await d.fetch(`${d.baseUrl.replace(/\/+$/, "")}/api/v1/jobs/${encodeURIComponent(job)}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nexus-Token": token },
      body: JSON.stringify({ confirm: job }),
      signal: AbortSignal.timeout(d.timeoutMs ?? 10_000),
    });
    if (res.status === 202) return { ok: true };
    const why = res.status === 409 ? "already running" : res.status === 403 ? "forbidden" : "unexpected answer";
    return { ok: false, status: res.status, error: `Nexus answered ${res.status} (${why})` };
  } catch {
    return { ok: false, status: null, error: "cannot reach Nexus" };
  }
}
