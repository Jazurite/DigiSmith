export function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

export function requireArgs(args: Record<string, string>, names: string[]): void {
  const missing = names.filter((name) => args[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `missing required flag${missing.length > 1 ? "s" : ""}: ${missing.map((n) => `--${n}`).join(", ")}`,
    );
  }
}
