import type { LoTask } from "./types.ts";
const last = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);
// Infinity - Infinity is NaN, which || treats as falsy, so equal nulls fall through to the next key.
export function rankTasks(tasks: LoTask[]): LoTask[] {
  return [...tasks].sort((a, b) => last(a.priority) - last(b.priority) || last(a.due) - last(b.due) || a.created - b.created);
}
