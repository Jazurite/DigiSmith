const MAX_BYTES = 5 * 1024 * 1024;
// Strict: any extension, checked first, and it beats the harmless-extension skip.
const STRICT: { re: RegExp; label: string }[] = [
  { re: /^\.env/i, label: ".env*" },
  { re: /\.pem(\.|$)/i, label: "*.pem" },
  { re: /\.key(\.|$)/i, label: "*.key" },
  { re: /\.p12(\.|$)/i, label: "*.p12" },
  { re: /\.pfx(\.|$)/i, label: "*.pfx" },
  { re: /^id_rsa/i, label: "id_rsa*" },
  { re: /^id_ed25519/i, label: "id_ed25519*" },
];
const LOOSE: { re: RegExp; label: string }[] = [
  { re: /secret/i, label: "*secret*" },
  { re: /token/i, label: "*token*" },
];
// Source, style and doc files skip both name matches; yaml skips only *token* (yaml is where real secret stores live).
const HARMLESS_EXT = /\.(ts|tsx|js|mjs|vue|scss|css|md|html)$/i;
const YAML_EXT = /\.ya?ml$/i;
const BOARD_SNAPSHOT = /^\.digismith\/board\/[^/]+\/tokens\.json$/;

export interface SecretHit { path: string; pattern: string }

/** Names and sizes only; no file is read. Returns each path that must not be salvaged and the pattern that matched. */
export function secretHits(files: { path: string; size: number }[]): SecretHit[] {
  const out: SecretHit[] = [];
  for (const f of files) {
    const base = f.path.split("/").pop() ?? f.path;
    const skipSecret = HARMLESS_EXT.test(base);
    const skipToken = skipSecret || YAML_EXT.test(base) || BOARD_SNAPSHOT.test(f.path);
    const loose = LOOSE.find((n) => n.re.test(base) && !(n.label === "*secret*" ? skipSecret : skipToken));
    const name = STRICT.find((n) => n.re.test(base)) ?? loose;
    if (name) out.push({ path: f.path, pattern: name.label });
    else if (f.size > MAX_BYTES) out.push({ path: f.path, pattern: "over 5 MB" });
  }
  return out;
}

export function secretFiles(files: { path: string; size: number }[]): string[] {
  return secretHits(files).map((h) => h.path);
}

export function notSalvagedMessage(hits: SecretHit[]): string {
  return `not salvaged: ${hits.map((h) => `${h.path} (matches ${h.pattern})`).join(", ")}; Jack decides`;
}
