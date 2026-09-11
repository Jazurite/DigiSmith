import type { CostRecord } from "./types.ts";

const WEBHOOK_TIMEOUT_MS = 3000;

export async function dispatchWebhook(record: CostRecord): Promise<void> {
  const url = process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL;
  if (!url) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`token-counter: webhook dispatch failed: HTTP ${response.status}`);
      try {
        response.body?.cancel();
      } catch {
        // best-effort drain — some runtimes don't support cancel()
      }
    }
  } catch (err) {
    console.error(`token-counter: webhook dispatch failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeout);
  }
}
