import * as fs from "node:fs";
import * as path from "node:path";
import { REVIEWER_TYPES, countChangedLines, modelFor, type ReviewerType } from "./types.ts";

export type PackInput = {
  type: ReviewerType;
  id: string;
  round: number;
  workspace: string;
  base: string;
  head: string;
  diff: string;
  plan: string;
  brief?: string;
  report?: string;
  constraints?: string;
  ticketFile?: string;
  spec?: string;
  ledger?: string;
  findingsIn?: string;
  fixBase?: string;
  standards: string[];
};

const PRIMITIVE: Record<ReviewerType, string> = { task: "task-reviewer-prompt.md", ticket: "code-reviewer.md" };
const RE_REVIEW = "re-review-prompt.md";
const SHA_RE = /^[0-9a-f]{7,40}$/;
const CARRY_RE = /^(?:Task (?:\d+|final): (?:minor \(deferred\)|parked)(?![A-Za-z0-9_])|Review task \d+ r\d+: F\d+ -> parked )/;

function file(label: string, p: string | undefined): string {
  if (p === undefined || p === "") throw new Error(`${label}: required`);
  const abs = path.resolve(p);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new Error(`${label}: no such file: ${abs}`);
  return abs;
}

function sha(label: string, v: string): string {
  if (!SHA_RE.test(v)) throw new Error(`${label}: must be a commit hash of 7 to 40 hex characters`);
  return v;
}

export function buildPack(input: PackInput): { dir: string; model: string } {
  if (!(REVIEWER_TYPES as readonly string[]).includes(input.type)) throw new Error(`type: must be one of ${REVIEWER_TYPES.join(", ")}`);
  if (input.type === "task" && !/^\d+$/.test(input.id)) throw new Error("id: a task review needs the task number");
  if (input.type === "ticket" && input.id !== "final") throw new Error("id: a ticket review has the id final");
  if (!Number.isInteger(input.round) || input.round < 1) throw new Error("round: must be an integer of 1 or more");
  const base = sha("base", input.base);
  const head = sha("head", input.head);

  const diff = file("diff", input.diff);
  const diffText = fs.readFileSync(diff, "utf8");
  if (!/^# Review package: /.test(diffText)) throw new Error("diff: not a review package (run review-package first)");

  const files: Array<[string, string]> = [["diff", diff]];
  let carry: string | undefined;
  let fixBase: string | undefined;
  if (input.round === 1) {
    if (input.type === "task") {
      files.push(["brief", file("brief", input.brief)], ["report", file("report", input.report)]);
      if (input.constraints !== undefined) files.push(["constraints", file("constraints", input.constraints)]);
    } else {
      files.push(["ticket", file("ticket-file", input.ticketFile)], ["spec", file("spec", input.spec)], ["plan", file("plan", input.plan)]);
      const ledger = fs.readFileSync(file("ledger", input.ledger), "utf8");
      carry = ledger.split(/\r?\n/).filter((l) => CARRY_RE.test(l)).join("\n");
    }
  } else {
    files.push(["findings", file("findings-in", input.findingsIn)]);
    if (input.fixBase === undefined || input.fixBase === "") throw new Error("fix-base: required for a re-review");
    fixBase = sha("fix-base", input.fixBase);
    if (input.type === "task") files.push(["brief", file("brief", input.brief)], ["report", file("report", input.report)]);
    else files.push(["report", file("report", input.report)], ["plan", file("plan", input.plan)]);
  }
  const standards = input.standards.map((s, i) => file(`standards[${i}]`, s));

  const dir = path.join(path.resolve(input.workspace), "reviews", `${input.type}-${input.id}-r${input.round}`);
  if (fs.existsSync(dir)) throw new Error(`pack exists: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  if (carry !== undefined) {
    const carryFile = path.join(dir, "carry-over.md");
    fs.writeFileSync(carryFile, carry === "" ? "none\n" : `${carry}\n`);
    files.push(["carry-over", carryFile]);
  }

  const model = modelFor(input.type, countChangedLines(diffText));
  const label = input.type === "task" ? `task ${input.id}` : "ticket";
  const manifest = [
    `# Review pack: ${label} round ${input.round}`,
    "",
    `type: ${input.type}`,
    `id: ${input.id}`,
    `round: ${input.round}`,
    `model: ${model}`,
    `base: ${base}`,
    `head: ${head}`,
    ...(fixBase !== undefined ? [`fix_base: ${fixBase}`] : []),
    `primitive: ${input.round === 1 ? PRIMITIVE[input.type] : RE_REVIEW}`,
    `report_out: ${path.join(dir, "report.md")}`,
    "",
    "## Files",
    ...files.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Standards",
    ...(standards.length > 0 ? standards.map((s) => `- ${s}`) : ["- none"]),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "pack.md"), manifest);
  return { dir, model };
}
