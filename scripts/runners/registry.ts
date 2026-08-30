import type { Runner, RunnerName } from "./types.ts";
import { opencode } from "./opencode.ts";
import { claudeCode } from "./claude-code.ts";

export function resolveRunner(name: string): Runner | undefined {
  const runners: Record<RunnerName, Runner> = { opencode, "claude-code": claudeCode };
  return runners[name as RunnerName];
}
