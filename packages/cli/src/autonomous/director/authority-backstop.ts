import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TICKET_KEY } from "../../ticket-key.ts";
import { fullPathCovered, isAuthorityFile } from "./authority.ts";

/** The changed files that are authority files (spec 4.4: whole tokens at / boundaries or exact basenames, never a bare substring). */
export const authorityHits = (files: string[]): string[] => files.filter(isAuthorityFile);

/** <autonomous state dir>/director/authority-approvals/<KEY>.json. Never under the repo root. */
export const approvalFile = (dir: string, ticket: string): string => join(dir, "director", "authority-approvals", `${ticket}.json`);

/** The approval record the refinement gate wrote; null when missing, damaged or without a path list (it then covers nothing). */
export function readApproval(dir: string, ticket: string): { paths: string[] } | null {
  if (!TICKET_KEY.test(ticket)) return null;
  try {
    const v = JSON.parse(readFileSync(approvalFile(dir, ticket), "utf8")) as { paths?: unknown };
    if (Array.isArray(v.paths) && v.paths.every((p) => typeof p === "string")) return { paths: v.paths as string[] };
  } catch { /* missing or damaged */ }
  return null;
}

/** The authority files of the diff that the approval does not cover (full-path rule: equal, /-boundary suffix, or under a listed folder). */
export function uncoveredHits(files: string[], approval: { paths: string[] } | null): string[] {
  return authorityHits(files).filter((f) => approval === null || !fullPathCovered(f, approval.paths));
}
