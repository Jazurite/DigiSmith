import * as fs from "node:fs";
import * as path from "node:path";

export type Zone = "lib" | "scripture" | "oculus" | "app" | "other";
export interface Violation { file: string; spec: string; from: Zone; to: Zone }

const SRC_ROOT = /^(packages\/cli|aspects\/scripture)\/src\//;
export const OCULUS_SRC_DIRS = ["autonomous", "conductor", "nightwatch", "oculus", "salvage", "dispatch"];
export const OCULUS_RUN_FILES = ["limit.ts", "limit-check.ts", "limit.test.ts", "limit-check.test.ts"];
export const OCULUS_SCRIPT_DIRS = ["conductor", "herdr", "opencode-boot"];
export const SCRIPTURE_CONDUCTOR_FILES = ["registry.ts", "safe-name.ts", "idle-check.ts", "idle-stamp.ts", "state-block.ts", "markers.ts", "catch-up-window.ts", "note-path.ts"];
export const SCRIPTURE_EXPORTS = ["run", "tokens", "steward", "clickup", "reviewer", "ticket-key", "conductor-registry"];
const isTest = (rel: string): boolean => /\.test(-util)?\.ts$/.test(rel);
const PACKAGE_ZONES: Record<string, Zone> = {
  "@digismith/clickup-client": "lib",
  "@digismith/jira-client": "lib",
  "@digismith/scripture": "scripture",
  "@digismith/cli": "scripture",
  "@digismith/oculus": "oculus",
};
const ALLOWED: Record<Zone, Zone[]> = {
  lib: ["lib", "other"],
  scripture: ["lib", "scripture", "other"],
  oculus: ["lib", "scripture", "oculus", "other"],
  app: ["lib", "app", "other"],
  other: ["lib", "scripture", "oculus", "app", "other"],
};

/** The zone of a repo-relative posix path. */
export function zoneOf(rel: string): Zone {
  if (rel.startsWith("libs/") || rel.startsWith("packages/clickup-client/") || rel.startsWith("packages/jira-client/")) return "lib";
  if (rel.startsWith("aspects/oculus/nexus/") || /^scripts\/nexus-(api|web|shared)\//.test(rel)) return "app";
  if (rel.startsWith("aspects/oculus/")) return "oculus";
  if (SRC_ROOT.test(rel)) {
    const parts = rel.replace(SRC_ROOT, "").split("/");
    if (OCULUS_SRC_DIRS.includes(parts[0])) return "oculus";
    if (parts[0] === "run" && OCULUS_RUN_FILES.includes(parts[1])) return "oculus";
    return "scripture";
  }
  if (rel.startsWith("scripts/conductor/") && SCRIPTURE_CONDUCTOR_FILES.includes(rel.split("/")[2].replace(/\.test\.ts$/, ".ts"))) return "scripture";
  if (rel.startsWith("scripts/")) return OCULUS_SCRIPT_DIRS.includes(rel.split("/")[1]) ? "oculus" : "scripture";
  if (rel.startsWith("aspects/scripture/")) return "scripture";
  return "other";
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".worktrees", ".claude", ".digismith", ".nuxt", ".output"]);
export function listSources(root: string, dir = ""): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listSources(root, rel));
    else if (e.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
export function importsOf(text: string): string[] {
  return [...text.matchAll(IMPORT)].map((m) => m[1]);
}

function targetZone(file: string, spec: string): { zone: Zone; rel: string } | null {
  if (spec.startsWith(".")) {
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    return { zone: zoneOf(rel), rel };
  }
  const m = /^(@digismith\/[a-z-]+)(\/.*)?$/.exec(spec);
  if (!m) return null;
  const zone = PACKAGE_ZONES[m[1]];
  return zone ? { zone, rel: m[2] ? `${m[1]}${m[2]}` : m[1] } : null;
}

export const keyOf = (v: Violation): string => `${v.file} -> ${v.spec}`;

export function findViolations(root: string): Violation[] {
  const found: Violation[] = [];
  const seen = new Set<string>();
  for (const file of listSources(root)) {
    const from = zoneOf(file);
    if (from === "other" || isTest(file)) continue;
    for (const spec of importsOf(fs.readFileSync(path.join(root, file), "utf-8"))) {
      const t = targetZone(file, spec);
      if (!t) continue;
      const deep =
        from === "oculus" &&
        ((t.rel.startsWith("aspects/scripture/") && file.startsWith("aspects/oculus/")) ||
          (/^@digismith\/scripture\//.test(t.rel) && !SCRIPTURE_EXPORTS.includes(t.rel.split("/")[2]?.replace(/\.[a-z]+$/, ""))));
      if (!ALLOWED[from].includes(t.zone) || deep) {
        const v: Violation = { file, spec, from, to: t.zone };
        const key = keyOf(v);
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(v);
      }
    }
  }
  return found;
}
