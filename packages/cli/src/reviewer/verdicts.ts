export const VERDICTS = ["fixed", "parked", "rejected"] as const;
export type Verdict = (typeof VERDICTS)[number];
export type Judgement = { verdict: Verdict; reason: string };

const LINE_RE = /^Review (task|ticket) (\d+|final) r(\d+): (F\d+) -> (fixed|parked|rejected)(?: \((.+)\))?$/;

export function judgementKey(kind: string, id: string, round: number, findingId: string): string {
  return `${kind} ${id} r${round} ${findingId}`;
}

export function parseVerdictLines(ledger: string): Map<string, Judgement> {
  const out = new Map<string, Judgement>();
  ledger.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(/^- /, "");
    if (!line.startsWith("Review ")) return;
    const m = LINE_RE.exec(line);
    if (!m) throw new Error(`ledger line ${i + 1}: not a verdict line: ${line}`);
    const verdict = m[5] as Verdict;
    const reason = m[6] ?? "";
    if (verdict !== "fixed" && reason === "") throw new Error(`ledger line ${i + 1}: a reason is required for ${verdict}`);
    out.set(judgementKey(m[1], m[2], Number(m[3]), m[4]), { verdict, reason });
  });
  return out;
}
