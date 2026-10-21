import type { CauseClass } from "./watchdog.ts";

/** The fixed list. A classifier block and a mandate deny are durable: only Jack can fix them. */
export const CAUSES: Record<string, CauseClass> = {
  "gateway-5xx": "transient",
  "gateway-timeout": "transient",
  "rate-limited": "transient",
  "pane-died": "transient",
  "tab-lost": "transient",
  "classifier-block": "durable",
  "merge-refused": "durable",
  "test-red": "durable",
  "review-rejected": "durable",
  "spec-gap": "durable",
  "mandate-deny": "durable",
  unknown: "unknown",
};

export const classOfCause = (code: string): CauseClass => (Object.hasOwn(CAUSES, code) ? CAUSES[code] : "unknown");

export function normalizeCause(code: string | undefined): { code: string; warning: string | null } {
  if (code === undefined || code === "") return { code: "unknown", warning: "no --cause given; recorded as unknown" };
  if (!Object.hasOwn(CAUSES, code)) {
    return { code: "unknown", warning: `cause "${code}" is not in the list (${Object.keys(CAUSES).join(", ")}); recorded as unknown` };
  }
  return { code, warning: null };
}
