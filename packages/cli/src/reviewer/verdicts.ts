export const FINAL_VERDICTS = ["fixed", "parked", "rejected"] as const;
export const VERDICTS = FINAL_VERDICTS;
export type Verdict = (typeof FINAL_VERDICTS)[number];
export type EntryVerdict = Verdict | "fixing";
export type Judgement = { verdict: Verdict; reason: string };

const LINE_RE = /^Review (task|ticket) (\d+|final) r(\d+): (F\d+) -> (fixed|parked|rejected|fixing)(?: \((.+)\))?$/;
const NO_FINDINGS_RE = /^Review (task|ticket) (\d+|final) r(\d+): no findings$/;

export function judgementKey(kind: string, id: string, round: number, findingId: string): string {
  return `${kind} ${id} r${round} ${findingId}`;
}

export type VerdictEntry = {
  line: number; text: string; kind: string; id: string; round: number;
  finding: string; verdict: EntryVerdict; reason: string;
};

export function parseVerdictEntries(ledger: string): VerdictEntry[] {
  const out: VerdictEntry[] = [];
  ledger.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.trim().replace(/^- /, "");
    if (!text.startsWith("Review task ") && !text.startsWith("Review ticket ")) return;
    if (NO_FINDINGS_RE.test(text)) return;
    const m = LINE_RE.exec(text);
    if (!m) throw new Error(`ledger line ${i + 1}: not a verdict line: ${text}`);
    const verdict = m[5] as EntryVerdict;
    const reason = m[6] ?? "";
    if ((verdict === "parked" || verdict === "rejected") && reason === "") throw new Error(`ledger line ${i + 1}: a reason is required for ${verdict}`);
    out.push({ line: i + 1, text, kind: m[1], id: m[2], round: Number(m[3]), finding: m[4], verdict, reason });
  });
  return out;
}

export function parseVerdictLines(ledger: string): Map<string, Judgement> {
  const out = new Map<string, Judgement>();
  for (const e of parseVerdictEntries(ledger)) {
    if (e.verdict === "fixing") continue;
    out.set(judgementKey(e.kind, e.id, e.round, e.finding), { verdict: e.verdict, reason: e.reason });
  }
  return out;
}
