/** The ClickUp spaces the factory reads. A key's prefix names its space. One entry per space: a third space is one line. */
export interface SpaceEntry { prefix: string; id: string; name: string }

export const SPACES: readonly SpaceEntry[] = [
  { prefix: "DGS", id: "1301150000001271", name: "DigiSmith" },
  { prefix: "OCL", id: "1301150000003197", name: "Oculus" },
];

export const DIGISMITH_SPACE_ID = SPACES[0].id;
export const ALL_SPACE_IDS: string[] = SPACES.map((s) => s.id);
/** For building regexes: "DGS|OCL". */
export const KEY_PREFIXES = SPACES.map((s) => s.prefix).join("|");

const KEY = /^([A-Z]+)-(\d+)$/;

export function spaceForKey(key: string): SpaceEntry {
  const m = KEY.exec(key);
  if (!m) throw new Error(`"${key}" is not a ticket key (PREFIX-123)`);
  const entry = SPACES.find((s) => s.prefix === m[1]);
  if (!entry) throw new Error(`unknown key prefix "${m[1]}" in "${key}"; known: ${SPACES.map((s) => s.prefix).join(", ")}`);
  return entry;
}

export function isTicketKey(key: string): boolean {
  try { spaceForKey(key); return true; } catch { return false; }
}
