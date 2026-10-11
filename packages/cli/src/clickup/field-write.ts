import type { FrontdoorField, FrontdoorFieldOption, FrontdoorFieldPutBody } from "@digismith/clickup-client";

export interface OptionRename {
  option: FrontdoorFieldOption;
  to: string;
}

/** Splits "Old=New" at the last "=": the left side is a current option name or id. */
export function parseOptionRename(input: string): { from: string; to: string } {
  const at = input.lastIndexOf("=");
  const from = at < 0 ? "" : input.slice(0, at).trim();
  const to = at < 0 ? "" : input.slice(at + 1).trim();
  if (!from || !to) throw new Error(`--option "${input}" must look like "<current name or id>=<new name>"`);
  return { from, to };
}

/** Finds one option by id, else by name (any case). Throws on an unknown or ambiguous option. */
function findOption(options: FrontdoorFieldOption[], from: string): FrontdoorFieldOption {
  const byId = options.filter((o) => o.id === from);
  const hits = byId.length ? byId : options.filter((o) => o.name.toLowerCase() === from.toLowerCase());
  if (hits.length === 0) throw new Error(`unknown option "${from}"; options: ${options.map((o) => o.name).join(", ")}`);
  if (hits.length > 1) throw new Error(`option "${from}" matches more than one option; use the id`);
  return hits[0];
}

/** Resolves the renames against the field's options. Throws on an unknown, ambiguous or repeated option, or a name clash. */
export function resolveOptionRenames(field: FrontdoorField, inputs: string[]): OptionRename[] {
  const options = field.type_config.options ?? [];
  const renames: OptionRename[] = [];
  for (const input of inputs) {
    const { from, to } = parseOptionRename(input);
    const option = findOption(options, from);
    if (renames.some((r) => r.option.id === option.id)) {
      throw new Error(`option "${option.name}" is renamed twice`);
    }
    renames.push({ option, to });
  }
  const finalName = (o: FrontdoorFieldOption) => (renames.find((r) => r.option.id === o.id)?.to ?? o.name).toLowerCase();
  const seen = new Set<string>();
  for (const o of options) {
    const n = finalName(o);
    if (seen.has(n)) throw new Error(`two options would be named "${n}"`);
    seen.add(n);
  }
  return renames;
}

/** Resolves the options to remove (name or id). Throws on an unknown, ambiguous, repeated or also renamed option. */
export function resolveOptionRemoves(field: FrontdoorField, renames: OptionRename[], inputs: string[]): FrontdoorFieldOption[] {
  const options = field.type_config.options ?? [];
  const removes: FrontdoorFieldOption[] = [];
  for (const input of inputs) {
    const option = findOption(options, input.trim());
    if (removes.some((o) => o.id === option.id)) throw new Error(`option "${option.name}" is removed twice`);
    if (renames.some((r) => r.option.id === option.id)) throw new Error(`option "${option.name}" is both removed and renamed`);
    removes.push(option);
  }
  return removes;
}

/** A removal is a delete: with --yes every removed option's exact name must be repeated in --confirm-remove. */
export function checkRemoveConfirmed(removes: FrontdoorFieldOption[], confirmed: string[]): void {
  for (const o of removes) {
    if (!confirmed.includes(o.name)) {
      throw new Error(`removing "${o.name}" deletes the option: add --confirm-remove "${o.name}" (exact name) to send it`);
    }
  }
}

export const DEFAULT_OPTION_COLOR = "#cecece";

export interface OptionAdd {
  name: string;
  color: string;
  orderindex: number;
}

/** Plans the adds: trimmed names, one color, next free orderindex each. Throws on an empty, repeated or existing name. */
export function resolveOptionAdds(field: FrontdoorField, names: string[], color: string | undefined): OptionAdd[] {
  if (color !== undefined && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) throw new Error(`--color must look like "#rrggbb", got "${color}"`);
  if (color !== undefined && names.length === 0) throw new Error("--color needs --add-option");
  const options = field.type_config.options ?? [];
  let next = options.reduce((max, o) => Math.max(max, o.orderindex), -1) + 1;
  const seen = new Set(options.map((o) => o.name.toLowerCase()));
  const adds: OptionAdd[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) throw new Error("--add-option must not be empty");
    const key = name.toLowerCase();
    if (adds.some((a) => a.name.toLowerCase() === key)) throw new Error(`option "${name}" is added twice`);
    if (seen.has(key)) throw new Error(`option "${name}" already exists`);
    adds.push({ name, color: color ?? DEFAULT_OPTION_COLOR, orderindex: next++ });
  }
  return adds;
}

/** PUT is the full field, not a patch: every flag is sent with its current value. Only name and renamed options change. */
export function buildFieldPutBody(field: FrontdoorField, name: string | undefined, renames: OptionRename[], adds: OptionAdd[] = [], removes: FrontdoorFieldOption[] = []): FrontdoorFieldPutBody {
  return {
    id: field.id,
    name: name ?? field.name,
    type_config: {
      sorting: field.type_config.sorting ?? "manual",
      new_drop_down: field.type_config.new_drop_down ?? true,
      options: {
        add: adds,
        update: renames.map(({ option, to }) => ({
          id: option.id,
          name: to,
          color: option.color,
          orderindex: option.orderindex,
        })),
        rem: removes.map((o) => o.id),
      },
    },
    hide_from_guests: field.hide_from_guests,
    pinned: field.pinned,
    required: field.required,
    required_on_subtasks: field.required_on_subtasks,
    description: field.description ?? "",
    private: field.private,
    permission_level: field.permission_level,
    default_value: field.default_value ?? null,
    members: field.members ?? [],
    groups: field.groups ?? [],
  };
}

export function describeFieldDiff(
  field: FrontdoorField,
  name: string | undefined,
  renames: OptionRename[],
  adds: OptionAdd[] = [],
  removes: FrontdoorFieldOption[] = []
): string[] {
  const lines = [`field ${field.id} ${JSON.stringify(field.name)} (${field.type})`];
  lines.push(`  current options: ${(field.type_config.options ?? []).map((o) => `${o.name} (${o.id})`).join(", ")}`);
  if (name !== undefined) lines.push(`  name: ${JSON.stringify(field.name)} -> ${JSON.stringify(name)}`);
  for (const r of renames) lines.push(`  option ${r.option.id}: ${JSON.stringify(r.option.name)} -> ${JSON.stringify(r.to)}`);
  for (const a of adds) lines.push(`  add option ${JSON.stringify(a.name)} ${a.color} at position ${a.orderindex}`);
  for (const o of removes) lines.push(`  remove option ${JSON.stringify(o.name)} (${o.id})`);
  return lines;
}
