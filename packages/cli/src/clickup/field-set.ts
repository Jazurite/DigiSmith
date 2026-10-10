import type { ClickUpClient } from "@digismith/clickup-client";
import { REF } from "./refs.ts";

/** The slice of a list field that --field needs; the client's union type does not cover text or number. */
export interface FieldLike {
  id: string;
  name: string;
  type: string;
  type_config?: { options?: { id: string; name: string }[] } & Record<string, unknown>;
}

export interface ResolvedField {
  field: FieldLike;
  value: unknown;
}

/** Splits "Name=value" at the first "=": names have no "=", values may. */
export function parseFieldArg(input: string): { key: string; value: string } {
  const at = input.indexOf("=");
  const key = at < 0 ? "" : input.slice(0, at).trim();
  const value = at < 0 ? "" : input.slice(at + 1).trim();
  if (!key || !value) throw new Error(`--field "${input}" must look like "<field name or id>=<value>"`);
  return { key, value };
}

/** A field id wins; else a case-insensitive name. Throws on an unknown or duplicate name. */
export function resolveField(fields: FieldLike[], key: string): FieldLike {
  const byId = fields.filter((f) => f.id === key);
  if (byId.length === 1) return byId[0];
  const hits = fields.filter((f) => f.name.toLowerCase() === key.toLowerCase());
  if (hits.length === 0) throw new Error(`unknown field "${key}"; fields: ${fields.map((f) => f.name).join(", ")}`);
  if (hits.length > 1) {
    throw new Error(
      `field name "${key}" matches ${hits.length} fields on this list; use the field id: ${hits.map((f) => `${f.id} (${f.type})`).join(", ")}`
    );
  }
  return hits[0];
}

export function resolveValue(field: FieldLike, raw: string): unknown {
  switch (field.type) {
    case "drop_down": {
      const options = field.type_config?.options ?? [];
      const byId = options.filter((o) => o.id === raw);
      const hits = byId.length ? byId : options.filter((o) => o.name.toLowerCase() === raw.toLowerCase());
      if (hits.length === 0) {
        throw new Error(`unknown option "${raw}" for field "${field.name}"; options: ${options.map((o) => o.name).join(", ")}`);
      }
      if (hits.length > 1) throw new Error(`option "${raw}" matches more than one option of field "${field.name}"; use the option id`);
      return hits[0].id;
    }
    case "text":
    case "short_text":
      return raw;
    case "number":
    case "currency": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`field "${field.name}" needs a number, got "${raw}"`);
      return n;
    }
    case "checkbox": {
      const v = raw.toLowerCase();
      if (v !== "true" && v !== "false") throw new Error(`field "${field.name}" needs true or false, got "${raw}"`);
      return v === "true";
    }
    default:
      throw new Error(`field type ${field.type} is not supported by --field (field "${field.name}")`);
  }
}

/** "DGS-1,DGS-2,-DGS-3": keys or ids, comma-separated; a - prefix removes. */
export function parseRelationValue(raw: string): { add: string[]; rem: string[] } {
  const add: string[] = [];
  const rem: string[] = [];
  for (const part of raw.split(",")) {
    const item = part.trim();
    const remove = item.startsWith("-");
    const ref = (remove ? item.slice(1) : item).trim();
    if (!ref) throw new Error(`relationship value "${raw}" has an empty item`);
    if (!REF.test(ref)) throw new Error(`"${ref}" is not a task id or key like DGS-12`);
    (remove ? rem : add).push(ref);
  }
  const both = add.find((r) => rem.some((x) => x.toLowerCase() === r.toLowerCase()));
  if (both) throw new Error(`"${both}" is both added and removed in "${raw}"`);
  return { add, rem };
}

const RELATIONSHIP_TYPES = ["list_relationship", "tasks"];

/** Resolves keys to task ids with one read each; an unknown key throws before any write. */
async function resolveRelationValue(client: ClickUpClient, field: FieldLike, raw: string): Promise<{ add: string[]; rem: string[] }> {
  const { add, rem } = parseRelationValue(raw);
  const ids = async (refs: string[]) => {
    const out: string[] = [];
    for (const ref of refs) {
      try {
        out.push((await client.getTaskByRef(ref)).id);
      } catch (err) {
        throw new Error(`field "${field.name}": cannot find task "${ref}": ${(err as Error).message}`);
      }
    }
    return [...new Set(out)];
  };
  const resolved = { add: await ids(add), rem: await ids(rem) };
  const shared = resolved.add.find((id) => resolved.rem.includes(id));
  if (shared) throw new Error(`field "${field.name}": task ${shared} is both added and removed in "${raw}"`);
  return resolved;
}

/** Reads the list's fields once and resolves every arg; throws before anything is written. */
export async function resolveFieldArgs(client: ClickUpClient, listId: string, args: string[]): Promise<ResolvedField[]> {
  if (args.length === 0) return [];
  const fields = (await client.getListFields(listId)) as unknown as FieldLike[];
  const resolved: ResolvedField[] = [];
  // Per field: what earlier args added and removed, so a later arg cannot undo them.
  const seen = new Map<string, { add: Set<string>; rem: Set<string> }>();
  for (const arg of args) {
    const { key, value } = parseFieldArg(arg);
    const field = resolveField(fields, key);
    let resolvedValue: unknown;
    if (RELATIONSHIP_TYPES.includes(field.type)) {
      const rel = await resolveRelationValue(client, field, value);
      const prior = seen.get(field.id) ?? { add: new Set<string>(), rem: new Set<string>() };
      const clash = [...rel.add.filter((id) => prior.rem.has(id)), ...rel.rem.filter((id) => prior.add.has(id))][0];
      if (clash) throw new Error(`field "${field.name}": task ${clash} is both added and removed across --field args`);
      rel.add.forEach((id) => prior.add.add(id));
      rel.rem.forEach((id) => prior.rem.add(id));
      seen.set(field.id, prior);
      resolvedValue = rel;
    } else {
      resolvedValue = resolveValue(field, value);
    }
    resolved.push({ field, value: resolvedValue });
  }
  return resolved;
}

export async function applyFields(client: ClickUpClient, taskId: string, resolved: ResolvedField[]): Promise<void> {
  for (const { field, value } of resolved) {
    try {
      await client.setCustomField(taskId, field.id, value);
    } catch (err) {
      const body = (err as { response?: { data?: unknown } }).response?.data;
      const detail = body === undefined ? "" : ` ${JSON.stringify(body)}`;
      throw new Error(`setting field "${field.name}" on task ${taskId} failed: ${(err as Error).message}${detail}`);
    }
  }
}
