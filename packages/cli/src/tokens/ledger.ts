export function parseTaskAgents(ledgerText: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of ledgerText.split("\n")) {
    const m = /^Task (\S+): dispatch \S+ agent=(\S+)\s*$/.exec(line.trim());
    if (m) (out[m[1]] ??= []).push(m[2]);
  }
  return out;
}
