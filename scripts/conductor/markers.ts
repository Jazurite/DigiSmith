// [resolves: ...] markers (DGS-462): the only way an item drops out of the conductor's state block.
import * as path from "node:path";


export type Resolver =
  | { kind: "ticket"; key: string }
  | { kind: "merged"; key: string }
  | { kind: "gone" | "exists"; path: string };

const MARKER = /\s*\[resolves:\s*([^\]]*)\]/g;

export interface ParsedMarkers {
  /** the text with every marker removed */
  text: string;
  resolvers: Resolver[];
  malformed: string[];
}

export function parseMarkers(raw: string): ParsedMarkers {
  const resolvers: Resolver[] = [];
  const malformed: string[] = [];
  for (const m of raw.matchAll(MARKER)) {
    const body = m[1].trim();
    const t = /^(ticket|merged)\s+(DGS-\d+)$/.exec(body);
    const p = /^(gone|exists)\s+(\S.*)$/.exec(body);
    if (t) resolvers.push({ kind: t[1] as "ticket" | "merged", key: t[2] });
    else if (p && isRepoRelative(p[2].trim())) resolvers.push({ kind: p[1] as "gone" | "exists", path: p[2].trim() });
    else malformed.push(`[resolves: ${body}]`);
  }
  return { text: raw.replace(MARKER, "").trim(), resolvers, malformed };
}

/** Text for the catch-up: markers are for the refresh, not for Jack. */
export function stripMarkers(raw: string): string {
  return raw.replace(MARKER, "").trim();
}

export function isRepoRelative(p: string): boolean {
  return p !== "" && !path.isAbsolute(p) && !p.split(/[\\/]/).includes("..");
}

