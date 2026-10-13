import type { ClickUpClient } from "@digismith/clickup-client";

/** A ClickUp id (alphanumeric) or a custom id such as DGS-343. Nothing else goes into a request path. */
export const REF = /^[A-Za-z0-9]+(-\d+)?$/;
/** A custom id such as DGS-343. */
export const KEY = /^[A-Za-z]+-\d+$/;

/** A raw id passes through untouched; a key is looked up once and its real id returned. A 404 on a key says so. */
export async function resolveTaskId(client: ClickUpClient, ref: string): Promise<string> {
  if (!KEY.test(ref)) return ref;
  try {
    return (await client.getTaskByRef(ref)).id;
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status === 404) {
      throw new Error(`task key ${ref} not found (checked with custom_task_ids and the team id)`);
    }
    throw err;
  }
}
