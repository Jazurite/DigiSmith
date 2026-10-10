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

/** Resolves the renames against the field's options. Throws on an unknown, ambiguous or repeated option, or a name clash. */
export function resolveOptionRenames(field: FrontdoorField, inputs: string[]): OptionRename[] {
  const options = field.type_config.options ?? [];
  const renames: OptionRename[] = [];
  for (const input of inputs) {
    const { from, to } = parseOptionRename(input);
    const byId = options.filter((o) => o.id === from);
    const hits = byId.length ? byId : options.filter((o) => o.name.toLowerCase() === from.toLowerCase());
    if (hits.length === 0) {
      throw new Error(`unknown option "${from}"; options: ${options.map((o) => o.name).join(", ")}`);
    }
    if (hits.length > 1) throw new Error(`option "${from}" matches more than one option; use the id`);
    if (renames.some((r) => r.option.id === hits[0].id)) {
      throw new Error(`option "${hits[0].name}" is renamed twice`);
    }
    renames.push({ option: hits[0], to });
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

/** PUT is the full field, not a patch: every flag is sent with its current value. Only name and renamed options change. */
export function buildFieldPutBody(field: FrontdoorField, name: string | undefined, renames: OptionRename[]): FrontdoorFieldPutBody {
  return {
    id: field.id,
    name: name ?? field.name,
    type_config: {
      sorting: field.type_config.sorting ?? "manual",
      new_drop_down: field.type_config.new_drop_down ?? true,
      options: {
        add: [],
        update: renames.map(({ option, to }) => ({
          id: option.id,
          name: to,
          color: option.color,
          orderindex: option.orderindex,
        })),
        rem: [],
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

export function describeFieldDiff(field: FrontdoorField, name: string | undefined, renames: OptionRename[]): string[] {
  const lines = [`field ${field.id} (${field.type})`];
  if (name !== undefined) lines.push(`  name: ${JSON.stringify(field.name)} -> ${JSON.stringify(name)}`);
  for (const r of renames) lines.push(`  option ${r.option.id}: ${JSON.stringify(r.option.name)} -> ${JSON.stringify(r.to)}`);
  return lines;
}
