import type { ClickUpTaskType } from "@digismith/clickup-client";
import { PLAIN_TASK_TYPE } from "./task-types.ts";

/** Built-in task types (Task, Milestone, form response, ...) have ids below 1000. Only custom types are edited or removed. */
export const FIRST_CUSTOM_TYPE_ID = 1000;

export function assertCustomType(type: ClickUpTaskType): void {
  if (type.id < FIRST_CUSTOM_TYPE_ID) {
    throw new Error(`task type "${type.name}" (${type.id}) is built-in and cannot be changed`);
  }
}

/** A name or plural another type already has is an error, never a second type with the same name. */
export function assertNameFree(types: ClickUpTaskType[], names: string[], exceptId?: number): void {
  for (const type of [PLAIN_TASK_TYPE, ...types]) {
    if (type.id === exceptId) continue;
    const used = [type.name, type.name_plural].filter((n): n is string => Boolean(n)).map((n) => n.toLowerCase());
    for (const name of names) {
      if (used.includes(name.trim().toLowerCase())) {
        throw new Error(`"${name}" is already used by task type ${type.name} (${type.id})`);
      }
    }
  }
}

/** Dry-run output: method, path and body only, never a header. */
export function printCall(method: string, path: string, body: unknown): void {
  console.log(`${method} ${path}`);
  if (body !== undefined) console.log(JSON.stringify(body, null, 2));
}
