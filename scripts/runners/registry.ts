import type { Runner, RunnerName } from "./types.ts";
import { opencode } from "./opencode.ts";
import { claudeCode } from "./claude-code.ts";

const runners: Record<RunnerName, Runner> = { opencode, "claude-code": claudeCode };

export function resolveRunner(name: string): Runner | undefined {
  return runners[name as RunnerName];
}
