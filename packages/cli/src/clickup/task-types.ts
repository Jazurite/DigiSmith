import type { ClickUpTaskType } from "@digismith/clickup-client";

/** id 0: the default task type. The API never lists it. */
export const PLAIN_TASK_TYPE: ClickUpTaskType = {
  id: 0,
  name: "Task",
  name_plural: "Tasks",
  description: null,
  avatar: null,
};

/** Resolves a type by id, or by singular or plural name (case-insensitive). Throws on none or many. */
export function resolveTaskType(types: ClickUpTaskType[], input: string): ClickUpTaskType {
  const all = [PLAIN_TASK_TYPE, ...types];
  if (/^\d+$/.test(input)) {
    const id = Number(input);
    const found = all.find((x) => x.id === id);
    if (!found) throw new Error(`unknown task type id ${id}`);
    return found;
  }
  const want = input.trim().toLowerCase();
  const hits = all.filter((x) => x.name.toLowerCase() === want || x.name_plural?.toLowerCase() === want);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    const ids = hits.map((x) => `${x.name} (${x.id})`).join(", ");
    throw new Error(`task type "${input}" matches more than one type: ${ids}; use the id`);
  }
  throw new Error(`unknown task type "${input}"; valid names: ${all.map((x) => x.name).join(", ")}`);
}
