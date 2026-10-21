import * as fs from "node:fs";
import { attentionFile, formatOpen, readOpen } from "../../packages/cli/src/autonomous/attention.ts";

// The open Nightwatch attention items for the catch-up; "" when no attention file exists or on any problem.
export function attentionSection(dir: string, now: number): string {
  try {
    if (!fs.existsSync(attentionFile(dir))) return "";
    return `\n## Needs Jack, Nightwatch\n${formatOpen(readOpen(dir), now)}`;
  } catch {
    return "";
  }
}
