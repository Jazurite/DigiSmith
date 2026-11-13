const cell = (s: string) => s.replace(/\|/g, "\\|");

export function renderLedgerSummary(progress: string): string {
  const lines = progress.split(/\r?\n/).map((l) => l.trim().replace(/^- /, ""));
  const plan = /^# .*plan: (.+)$/.exec(lines[0] ?? "")?.[1] ?? "unknown plan";
  const tasks = new Map<string, { delivered?: string; reviews: string[]; notes: string[] }>();
  const get = (id: string) => { let t = tasks.get(id); if (!t) tasks.set(id, (t = { reviews: [], notes: [] })); return t; };
  const whole: string[] = [];
  for (const l of lines) {
    const m = /^Task (\d+): (.*)$/.exec(l);
    if (m) {
      const t = get(m[1]);
      const complete = /^complete \((.*)\)$/.exec(m[2]);
      const reviewed = /^reviewed \((.*)\)$/.exec(m[2]);
      if (complete) t.delivered = complete[1];
      else if (reviewed) t.reviews.push(reviewed[1]);
      else if (/^parked|^deferred|^minor \(deferred\)/.test(m[2])) t.notes.push(m[2]);
      continue;
    }
    if (/^(Final review|Scoped re-review)/.test(l)) whole.push(l);
  }
  const out = [`# Ledger summary`, ``, `Plan: ${plan}`, ``];
  if (tasks.size === 0) out.push("No tasks recorded.");
  else {
    out.push("| Task | Delivered | Reviews | Notes |", "| --- | --- | --- | --- |");
    for (const [id, t] of [...tasks].sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const rv = t.reviews.length === 0 ? "not recorded" : `${t.reviews.length} review${t.reviews.length === 1 ? "" : "s"}, last: ${t.reviews[t.reviews.length - 1]}`;
      out.push(`| ${id} | ${cell(t.delivered ?? "not completed")} | ${cell(rv)} | ${cell(t.notes.join("; "))} |`);
    }
  }
  if (whole.length > 0) out.push("", "## Whole-branch review", "", ...whole.map((w) => `- ${w}`));
  return out.join("\n") + "\n";
}
