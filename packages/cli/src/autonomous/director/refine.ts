import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fmtUtc7 } from "../clock.ts";
import { checkReady, REASON, type ReadyCtx } from "../ready.ts";
import { atomicWrite } from "../state.ts";
import type { LoTask } from "../types.ts";
import { approvalCovers, namesAuthorityPath, parseApproval } from "./authority.ts";
import { escalate, hasReturned } from "./escalate.ts";
import { readDecisions, recordDecision, type RecordDeps } from "./record.ts";
import type { StatusPort } from "./status.ts";

export const REFINE_STATUS = "refinement";
export const REFINE_LOCK_MAX_AGE_MINUTES = 360;
const LOCK = "refine-lock.json";
const QUESTION_ID = "product-taste-names-scope";

export const REFINE_REASON = { doneWhen: "no Done when line in the ticket description" } as const;
export const DONE_WHEN_QUESTION = "Add a Done when line to this ticket's description, then move the ticket back to refinement.";

export interface RefineLock { ticket: string; taskId: string; claimedAt: string; claimedAtUtc7: string; order: string; scanId: string; attempt: number; round: 1 | 2 }

export const lockAgeMinutes = (l: { claimedAt: string }, now: Date): number => Math.floor((now.getTime() - new Date(l.claimedAt).getTime()) / 60_000);

export const hasDoneWhen = (t: LoTask): boolean => /^[\s#>*-]*(?:\*\*)?done when\b/im.test(t.text);

export function checkRefineReady(t: LoTask): string[] {
  const out: string[] = [];
  if (!hasDoneWhen(t)) out.push(REFINE_REASON.doneWhen);
  const open = t.blockers.filter((b) => !b.done).map((b) => b.key);
  if (open.length > 0) out.push(REASON.blocked(open));
  if (t.mode === "Manual") out.push(REASON.mode);
  return out;
}

export function acquireRefineLock(dir: string, l: RefineLock): "acquired" | "busy" {
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, LOCK), JSON.stringify(l), { flag: "wx" });
    return "acquired";
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return "busy";
    throw e;
  }
}

export function readRefineLock(dir: string): RefineLock | null | { corrupt: true } {
  let text: string;
  try { text = readFileSync(join(dir, LOCK), "utf8"); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v === "object" && v !== null && typeof (v as RefineLock).ticket === "string") return v as RefineLock;
  } catch { /* corrupt */ }
  return { corrupt: true };
}

export const clearRefineLock = (dir: string): void => rmSync(join(dir, LOCK), { force: true });

export interface Verdict { clean: boolean; blocking: number; problem: string | null; findings: string[] }

/** Reads the LAST "json findings" block of a Reviewer report. Clean = every finding is exactly Minor (any other severity blocks). */
export function readVerdict(reportPath: string): Verdict {
  const bad = (problem: string): Verdict => ({ clean: false, blocking: 0, problem, findings: [] });
  let text: string;
  try { text = readFileSync(reportPath, "utf8"); } catch { return bad(`report not readable: ${reportPath}`); }
  const blocks = [...text.matchAll(/```json findings[ \t]*\n([\s\S]*?)\n[ \t]*```/g)];
  if (blocks.length === 0) return bad("no findings block in the report");
  let list: unknown;
  try { list = JSON.parse(blocks[blocks.length - 1][1]); } catch { return bad("the findings block is not valid JSON"); }
  if (!Array.isArray(list)) return bad("the findings block is not a list");
  const findings: string[] = [];
  for (const f of list as Record<string, unknown>[]) {
    const sev = String(f?.severity ?? "").trim().toLowerCase();
    // fail closed: anything that is not exactly "minor" blocks, including a missing or misspelled severity
    if (sev !== "minor") {
      const where = f.path !== undefined ? ` (${String(f.path)}${f.line !== undefined ? `:${String(f.line)}` : ""})` : "";
      findings.push(`${String(f.id ?? "?")} ${sev === "" ? "no severity" : sev}: ${String(f.what ?? f.summary ?? "")}${where}`.trim());
    }
  }
  return { clean: findings.length === 0, blocking: findings.length, problem: null, findings };
}

export const refineOrderPath = (ordersDir: string, stamp: string, key: string): string => join(ordersDir, `order-ar-${stamp}-${key}.md`);

export function renderRefineOrder(i: { key: string; name: string; taskId: string; claimedAtUtc7: string; stamp: string; answer: string | null }): string {
  const lines = [
    `# Order ar-${i.stamp}: refine ${i.key} (Director)`,
    "",
    `From: dg autonomous scan, ${i.claimedAtUtc7} UTC+7`,
    "",
    `Ticket: ${i.key} ${i.name} (task id ${i.taskId})`,
    "",
  ];
  if (i.answer !== null) lines.push("Answer from Jack (the ticket came back from concept; ticket text, newest comments are on the ticket):", i.answer, "");
  lines.push(
    "## Steps",
    `1. Start a refine worker from \`skills/director/refine-brief.md\` under the role limit, with the seat from \`dg director seat\`. Always through \`dg run start\`.`,
    `2. Keep a Monitor watch on the refine worker's pane for lines that start with \`STOP: plan-ready\`. When it arrives, ASK the project conductor to start a \`ticket\` plan Reviewer for ${i.key}. Never start a Reviewer yourself: the Reviewer card stays untouched and a conductor starts every review.`,
    "3. On a dirty report: verify each finding (read the cited text; a finding you cannot verify counts as confirmed), relay the confirmed ones to the refine worker once, and ask the conductor for one scoped re-review. Run `dg director refine-round` before the re-review.",
    `4. On a clean report: attach \`spec.md\` and \`plan.md\` with \`dg clickup upload-attachment\`.`,
    `5. Run \`dg director refine-release --ticket ${i.key} --result ready --report <report.md>\`, or \`--result escalated --question "<one question>"\` when only Jack can decide.`,
    "",
    "## Mandate (unattended work)",
    "No sudo. No delete. No new service or LaunchAgent. Never edit the ticket description. Never answer a permission prompt.",
    "",
  );
  return lines.join("\n");
}

/** Refine failures of this ticket in the current cycle: since its newest gate pass or escalation. */
export function countRefineFailures(dir: string, ticket: string): number {
  const mine = readDecisions(dir).filter((x) => x.ticket === ticket);
  let from = 0;
  mine.forEach((x, i) => { if (x.id === "apply-refinement-gate" || x.id === "escalate-concept") from = i + 1; });
  return mine.slice(from).filter((x) => x.run === "refine-failed" && x.id === "release-stopped").length;
}

export interface RefineReleaseDeps extends RecordDeps { status: StatusPort; checkReadyCtx: ReadyCtx; boardDir: (ticket: string) => string | null; readDescription: (ticket: string) => Promise<string> }

export function refineRound(dir: string): void {
  const l = readRefineLock(dir);
  if (l === null || "corrupt" in l) throw new Error("no refine lock to move to round 2");
  atomicWrite(dir, LOCK, JSON.stringify({ ...l, round: 2 }));
}

const refuse = (text: string): { code: 2; text: string } => ({ code: 2, text });
const ok = (text: string): { code: 0; text: string } => ({ code: 0, text });

export async function refineRelease(
  d: RefineReleaseDeps,
  a: { ticket: string; result: "ready" | "escalated" | "failed"; report?: string; question?: string; cause?: string },
): Promise<{ code: 0 | 2; text: string }> {
  const lock = readRefineLock(d.dir);
  if (lock === null) return refuse(`no refine lock: nothing to release for ${a.ticket}`);
  if ("corrupt" in lock) return refuse("refine-lock.json is damaged: fix it first");
  if (lock.ticket !== a.ticket) return refuse(`the refine lock is for ${lock.ticket}, not ${a.ticket}`);

  if (a.result === "escalated") {
    if (!a.question) return refuse("--question is required for --result escalated");
    const r = await escalate(d, { ticket: a.ticket, taskId: lock.taskId, id: QUESTION_ID, question: a.question, viaRelease: false });
    clearRefineLock(d.dir);
    return ok(r.outcome === "refused" ? `lock cleared; ${r.text}` : `escalated (${r.outcome}); lock cleared`);
  }

  if (a.result === "failed") {
    const cause = a.cause ?? "unknown";
    if (countRefineFailures(d.dir, a.ticket) === 0) {
      await recordDecision(d, { ticket: a.ticket, run: "refine-failed", id: "release-stopped", side: "within", what: `refine run of ${a.ticket} failed (${cause}); the lock is cleared and one retry follows`, why: "first failure of the refine worker", noComment: true });
      clearRefineLock(d.dir);
      return ok("failed once: lock cleared, the next scan retries");
    }
    const r = await escalate(d, { ticket: a.ticket, taskId: lock.taskId, id: QUESTION_ID, question: `The refine worker failed twice (${cause}). Look at the ticket and say how to go on`, viaRelease: false });
    clearRefineLock(d.dir);
    return ok(r.outcome === "refused" ? `lock cleared; ${r.text}` : `failed twice: escalated (${cause}); lock cleared`);
  }

  // ready
  if (!a.report) return refuse("--report <report.md> is required for --result ready");
  const v = readVerdict(a.report);
  if (v.problem !== null) return refuse(`the report cannot be used: ${v.problem}`);
  if (!v.clean) {
    if (lock.round === 1) return refuse(`dirty: relay the confirmed findings (${v.blocking} Critical or Important). Open findings:\n${v.findings.join("\n")}`);
    const r = await escalate(d, { ticket: a.ticket, taskId: lock.taskId, id: QUESTION_ID, question: `The plan review is still dirty after the fix round. Open findings: ${v.findings.join("; ")}`, viaRelease: false });
    clearRefineLock(d.dir);
    return ok(r.outcome === "refused" ? `lock cleared; ${r.text}` : "round 2 still dirty: escalated; lock cleared");
  }

  const board = d.boardDir(a.ticket);
  if (board === null) return refuse(`board folder of ${a.ticket} not found: the gate fails closed`);
  let spec: string;
  let plan: string;
  try { spec = readFileSync(join(board, "spec.md"), "utf8"); } catch { return refuse(`spec.md missing in ${board}: the gate fails closed`); }
  try { plan = readFileSync(join(board, "plan.md"), "utf8"); } catch { return refuse(`plan.md missing in ${board}: the gate fails closed`); }

  const tokens = namesAuthorityPath(`${spec}\n${plan}`);
  const approval = parseApproval(await d.readDescription(a.ticket));
  if (tokens.length > 0) {
    const uncovered = approvalCovers(approval, tokens);
    if (uncovered.length > 0) {
      const list = uncovered.join(", ");
      const esc = await escalate(d, {
        ticket: a.ticket, taskId: lock.taskId, id: "change-authority", viaRelease: false,
        question: `The plan changes the Director's own authority: ${list}. Jack decides. When Jack agrees, he adds the line \`Authority change approved by Jack: <date>: ${list}\` to the ticket description, and the ticket goes back to refinement.`,
      });
      const how = esc.outcome === "asked" ? "Escalated as change-authority" : esc.outcome === "already-open" ? "change-authority is already open on the ticket" : `no new question sent: ${esc.text}`;
      return refuse(`authority path not approved by Jack: ${list}. ${how}; the lock is kept`);
    }
  }

  const now = (await d.tracker.listByStatus(REFINE_STATUS)).find((t) => (t.key ?? t.id) === a.ticket);
  if (!now) return refuse(`${a.ticket} is not in ${REFINE_STATUS} any more`);
  const reasons = checkReady(now, d.checkReadyCtx);
  if (reasons.length > 0) return refuse(`not ready: ${reasons.join("; ")}`);

  if (approval !== null) {
    const dirApprovals = join(d.dir, "director", "authority-approvals");
    mkdirSync(dirApprovals, { recursive: true });
    const line = `Authority change approved by Jack: ${approval.date}: ${approval.paths.join(", ")}`;
    writeFileSync(join(dirApprovals, `${a.ticket}.json`), JSON.stringify({ ticket: a.ticket, paths: approval.paths, line, at: d.now().toISOString() }));
  }
  // DGS-739: refinement -> to do is the Steward event `approved` (a gate event: it needs a quote). The Director's own decision text is the quote.
  const quote = `Director refinement gate for ${a.ticket}: the plan Reviewer report is clean and the readiness check passed`;
  const sent = await d.status.send(a.ticket, { event: "approved", by: "director", quote });
  if (!sent.ok) return refuse(`the Steward did not move ${a.ticket} to to do: ${sent.text}; the lock is kept, run the release again`);
  const back = await d.tracker.getStatus(lock.taskId);
  if (back !== "to do") throw new Error(`status read back "${back}", expected "to do"`);
  clearRefineLock(d.dir);
  await recordDecision(d, { ticket: a.ticket, id: "apply-refinement-gate", side: "within", what: `moved ${a.ticket} from refinement to to do at ${fmtUtc7(d.now())} UTC+7`, why: "the plan Reviewer report is clean and the readiness check passed" });
  return ok(`${a.ticket} is in to do`);
}
