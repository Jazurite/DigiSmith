export const DEFAULT_PROTECTED: readonly string[] = [
  "hooks/", "hooks/hooks.json", ".digismith/config.yml", "skills/finishing-*/", "skills/reviewer/",
  "packages/cli/src/reviewer/", "packages/cli/src/autonomous/", "scripts/nexus-api/src/scheduler/",
  ".digismith/mandate.yml", ".digismith/profiles/",
];

const escape = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

function toRegExp(pattern: string): RegExp {
  const folder = pattern.endsWith("/");
  const body = folder ? pattern.slice(0, -1) : pattern;
  const source = body.split("*").map(escape).join("[^/]*");
  return new RegExp(`^${source}${folder ? "(/.*)?" : ""}$`);
}

/** The paths that match at least one pattern, in input order. */
export function touchedProtected(paths: string[], patterns: readonly string[]): string[] {
  const res = patterns.map(toRegExp);
  return paths.filter((p) => res.some((re) => re.test(p)));
}
