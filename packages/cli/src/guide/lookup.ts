import type { GuideIndexEntry } from "./cache.ts";

export type GuideLookup =
  | { kind: "found"; guide: GuideIndexEntry }
  | { kind: "ambiguous"; matches: string[] }
  | { kind: "unknown"; closest: string[] };

const MAX_CLOSEST = 3;
const MIN_SHARED_PREFIX = 2;

function sharedPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Resolve a guide by exact slug, then key (any case), then unique slug prefix.
 * Input is trimmed and lowercased; slugs are lowercase by construction.
 */
export function resolveGuide(guides: GuideIndexEntry[], name: string): GuideLookup {
  const q = name.trim().toLowerCase();
  if (q === "") return { kind: "unknown", closest: [] };

  const exact = guides.find((g) => g.slug.toLowerCase() === q);
  if (exact) return { kind: "found", guide: exact };

  const byKey = guides.find((g) => g.key.toLowerCase() === q);
  if (byKey) return { kind: "found", guide: byKey };

  const prefixed = guides.filter((g) => g.slug.toLowerCase().startsWith(q));
  if (prefixed.length === 1) return { kind: "found", guide: prefixed[0] };
  if (prefixed.length > 1) return { kind: "ambiguous", matches: prefixed.map((g) => g.slug) };

  const sharing = guides
    .map((g, index) => ({ g, index, shared: sharedPrefixLength(g.slug.toLowerCase(), q) }))
    .filter((x) => x.shared >= MIN_SHARED_PREFIX)
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .map((x) => x.g.slug);
  const substring = guides.filter((g) => g.slug.toLowerCase().includes(q)).map((g) => g.slug);
  const closest = [...new Set([...sharing, ...substring])].slice(0, MAX_CLOSEST);
  return { kind: "unknown", closest };
}
