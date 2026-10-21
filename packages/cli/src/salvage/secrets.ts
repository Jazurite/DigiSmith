const MAX_BYTES = 5 * 1024 * 1024;
const NAME: { re: RegExp; label: string }[] = [
  { re: /^\.env/i, label: ".env*" },
  { re: /\.pem$/i, label: "*.pem" },
  { re: /\.key$/i, label: "*.key" },
  { re: /secret/i, label: "*secret*" },
  { re: /token/i, label: "*token*" },
];

export interface SecretHit { path: string; pattern: string }

/** Names and sizes only; no file is read. Returns each path that must not be salvaged and the pattern that matched. */
export function secretHits(files: { path: string; size: number }[]): SecretHit[] {
  const out: SecretHit[] = [];
  for (const f of files) {
    const base = f.path.split("/").pop() ?? f.path;
    const name = NAME.find((n) => n.re.test(base));
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
