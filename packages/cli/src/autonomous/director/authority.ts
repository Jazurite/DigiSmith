export type Side = "within" | "jack";
export interface AuthorityEntry { id: string; side: Side; text: string; reason: string }

/** Spec 4.1 and 4.2. Jack changes this list; the Director never widens it. */
export const AUTHORITY: readonly AuthorityEntry[] = [
  { id: "claim-refine", side: "within", text: "claim a `refinement` ticket (Mode not Manual) and start a refine worker", reason: "it is the loop" },
  { id: "claim-build", side: "within", text: "the scan claims a `to do` ticket on its behalf and hands the order straight to the ticket's driver; the scan records the decision", reason: "it is the loop" },
  { id: "start-worker", side: "within", text: "start a refine worker itself; ask the project conductor to start the plan Reviewer; always through `dg run start` and inside the run limit", reason: "the limit is the rule" },
  { id: "pick-seat", side: "within", text: "choose the Claude seat by the runbook rule", reason: "Jack's saved rule, Jack 2026-10-04" },
  { id: "apply-refinement-gate", side: "within", text: "move a ticket `refinement` -> `to do` after a clean plan-Reviewer report and a passing readiness check, and only when the plan names no authority path", reason: "a mechanical gate" },
  { id: "reprompt-run", side: "within", text: "ask a ticket's driver to re-prompt a stalled run, or re-prompt a refine worker the Director started itself", reason: "harmless, reversible" },
  { id: "restart-run", side: "within", text: "restart a lost run of a refine worker it started; for a Builder there is no Director restart move: the tick sends the first restart", reason: "one retry per run, never a second actor for the same restart" },
  { id: "release-stopped", side: "within", text: "stop a ticket that cannot go on: `release --result stopped` (build lane) or `refine-release` (refine lane); never `failed`", reason: "the existing release path; the Director's own stops must not open the breaker" },
  { id: "escalate-concept", side: "within", text: "move a `refinement` or `to do` ticket back to `concept` with one question", reason: "the only way a question reaches Jack" },
  { id: "start-ticket-conductor", side: "within", text: "start a ticket conductor for a claimed ticket, inside the cap of 2", reason: "the Castle rule" },
  { id: "record-decision", side: "within", text: "write the decision record", reason: "every decision is recorded" },
  { id: "delete-data", side: "jack", text: "deleting a database or any irreversible data loss", reason: "only Jack decides irreversible loss" },
  { id: "spend-money", side: "jack", text: "money, a new paid service, a new paid seat", reason: "only Jack spends money" },
  { id: "go-public", side: "jack", text: "anything public: a publish, a post, a public repo, a customer-visible change", reason: "only Jack decides what is public" },
  { id: "personal-data", side: "jack", text: "personal data of any kind", reason: "only Jack decides on personal data" },
  { id: "product-taste-names-scope", side: "jack", text: "product, taste, names, scope", reason: "always Jack's" },
  { id: "change-authority", side: "jack", text: "this list, the card, the run limits, the guardrails (`.digismith/config.yml`), the protected-path list, `.digismith/mandate.yml`, `.digismith/profiles/`", reason: "the Director never widens its own authority" },
  { id: "answer-prompt", side: "jack", text: "answering a permission, delete or \"keep allowing\" prompt", reason: "an answer widens a run's permissions, which is settings" },
  { id: "change-host", side: "jack", text: "`sudo`, a LaunchDaemon or LaunchAgent, a new background service, Caddy, Tailscale, the settings files, the live registry by hand", reason: "the host is Jack's" },
  { id: "close-breaker", side: "jack", text: "`dg autonomous resume` / `back`", reason: "the breaker is a safety stop" },
  { id: "merge-protected", side: "jack", text: "a merge that touches a protected path (until the Warden exists the Maestro answers; never the Director)", reason: "a protected merge is a gate decision" },
  { id: "rewrite-history", side: "jack", text: "force push, `reset --hard` of shared history, branch delete of unmerged work", reason: "history is not the Director's to rewrite" },
];

const A = "packages/cli/src/autonomous/";
/** Spec 4.4, the ten full paths. */
export const AUTHORITY_PATHS: readonly string[] = [
  `${A}director/`, "skills/director/", "packages/cli/src/run/limit", `${A}guardrails.ts`, `${A}protected-paths.ts`,
  `${A}merge-gate.ts`, `${A}breaker.ts`, ".digismith/config.yml", ".digismith/mandate.yml", ".digismith/profiles/",
];

/** Spec 4.4, the short spellings (case-insensitive substrings). */
export const AUTHORITY_PATH_SPELLINGS: readonly string[] = [
  "director/", "skills/director", "authority.ts", "authority-backstop.ts", "refine.ts", "refine-brief.md", "merge-gate.ts", "breaker.ts", "run/limit",
  "limit-check.ts", "limit.ts", "guardrails.ts", "protected-paths.ts", "config.yml", "nightwatch.limits", "protected_paths", "mandate.yml", "profiles/",
];

const CONFIG = ".digismith/config.yml";
const CONFIG_KEYS = new Set(["nightwatch.limits", "protected_paths"]);
const TOKEN_CHAR = /[A-Za-z0-9_./-]/;

function cleanToken(raw: string): string {
  let t = raw;
  while (t.startsWith("./") || t.startsWith("../")) t = t.slice(t.startsWith("./") ? 2 : 3);
  return t.replace(/[.\-_]+$/, "");
}

/** The whole path tokens written around each spelling hit. */
export function namesAuthorityPath(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Map<string, string>();
  for (const sp of AUTHORITY_PATH_SPELLINGS) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(sp, from);
      if (at < 0) break;
      from = at + 1;
      let s = at;
      let e = at + sp.length;
      while (s > 0 && TOKEN_CHAR.test(text[s - 1])) s--;
      while (e < text.length && TOKEN_CHAR.test(text[e])) e++;
      const tok = cleanToken(text.slice(s, e));
      if (tok !== "" && !found.has(tok.toLowerCase())) found.set(tok.toLowerCase(), tok);
    }
  }
  return [...found.values()];
}

const norm = (p: string): string => p.trim().toLowerCase();

/** "Authority change approved by Jack: <date>: <paths>" at the start of a line. Several lines are merged. */
export function parseApproval(description: string): { date: string; paths: string[] } | null {
  let date: string | null = null;
  const paths: string[] = [];
  for (const line of description.split("\n")) {
    const m = /^[ \t]*authority change approved by jack:[ \t]*([^:\n]*?)[ \t]*:[ \t]*(.*)$/i.exec(line);
    if (!m) continue;
    const ps = m[2].split(",").map((p) => p.trim()).filter((p) => p !== "");
    if (ps.length === 0) continue;
    if (date === null) date = m[1];
    paths.push(...ps);
  }
  return date === null ? null : { date, paths };
}

/** Spec 4.4: equal, a /-boundary suffix of a listed path, or under a listed folder. A folder token needs a folder approval. */
export function isCovered(token: string, listed: readonly string[]): boolean {
  let t = norm(token);
  if (CONFIG_KEYS.has(t)) t = CONFIG;
  const folderToken = t.endsWith("/");
  for (const raw of listed) {
    const l = norm(raw);
    if (l === t || l.endsWith(`/${t}`)) {
      if (!folderToken || l.endsWith("/")) return true;
      continue;
    }
    if (!l.endsWith("/")) continue;
    if (t.startsWith(l)) return true;
    for (let i = t.indexOf("/"); i >= 0; i = t.indexOf("/", i + 1)) {
      const prefix = t.slice(0, i + 1);
      if (l === prefix || l.endsWith(`/${prefix}`)) return true;
    }
  }
  return false;
}

/** The tokens the approval does not cover (empty = covered). */
export function approvalCovers(a: { paths: string[] } | null, tokens: string[]): string[] {
  if (a === null) return [...tokens];
  return tokens.filter((t) => !isCovered(t, a.paths));
}

const BASENAMES = new Set([
  "authority.ts", "authority-backstop.ts", "refine.ts", "refine-brief.md", "merge-gate.ts", "breaker.ts", "limit.ts", "limit-check.ts",
  "guardrails.ts", "protected-paths.ts", "config.yml", "mandate.yml",
]);

/** A changed file path is an authority file: a full path under a listed path, or an exact bare basename. Never a bare substring. */
export function isAuthorityFile(path: string): boolean {
  let p = path.trim();
  while (p.startsWith("./")) p = p.slice(2);
  if (!p.includes("/")) return BASENAMES.has(p);
  for (const a of AUTHORITY_PATHS) {
    if (a.endsWith("/") ? p.startsWith(a) : p === a || p.startsWith(a)) return true;
  }
  return false;
}

/** Merge-time coverage of a full diff path: equal, /-boundary suffix, or under a listed folder at a / boundary. */
export function fullPathCovered(diffPath: string, listed: readonly string[]): boolean {
  const d = diffPath.trim();
  for (const raw of listed) {
    const l = raw.trim();
    if (l === "") continue;
    if (d === l || d.endsWith(`/${l}`)) return true;
    if (l.endsWith("/") && (d.startsWith(l) || d.includes(`/${l}`))) return true;
  }
  return false;
}

export type AuthorityCheck = { ok: true } | { ok: false; code: 3 | 4; text: string };

export function checkAuthority(id: string): AuthorityCheck {
  const e = AUTHORITY.find((x) => x.id === id);
  if (!e) return { ok: false, code: 4, text: `unknown authority id "${id}": not on the within list, so outside the Director's authority: use dg director escalate` };
  if (e.side === "jack") return { ok: false, code: 3, text: `"${id}" is outside the Director's authority: use dg director escalate` };
  return { ok: true };
}
