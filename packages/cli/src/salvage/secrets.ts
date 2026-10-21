const MAX_BYTES = 5 * 1024 * 1024;
const NAME = [/^\.env/i, /\.pem$/i, /\.key$/i, /secret/i, /token/i];

/** Names and sizes only; no file is read. Returns the paths that must not be salvaged. */
export function secretFiles(files: { path: string; size: number }[]): string[] {
  return files
    .filter((f) => {
      const base = f.path.split("/").pop() ?? f.path;
      return NAME.some((re) => re.test(base)) || f.size > MAX_BYTES;
    })
    .map((f) => f.path);
}
