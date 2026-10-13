import type { ClickUpClient } from "@digismith/clickup-client";

/** A ClickUp id (alphanumeric) or a custom id such as DGS-343. Nothing else goes into a request path. */
export const REF = /^[A-Za-z0-9]+(-\d+)?$/;
/** A custom id such as DGS-343. */
export const KEY = /^[A-Za-z]+-\d+$/;

/** A raw id passes through untouched; a key is looked up once and its real id returned. */
export async function resolveTaskId(client: ClickUpClient, ref: string): Promise<string> {
  return KEY.test(ref) ? (await client.getTaskByRef(ref)).id : ref;
}
