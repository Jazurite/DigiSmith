# Post-Finish History Update Hook (Y.1.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a third stock `post-finish` hook, `.digismith/hooks/post-finish/03-history-update.md`, that appends a Timeline entry to `.digismith/history.html` for each just-shipped feature after a DigiSmith self-merge, so the page stops going stale the way it did from 2026-08-27 through V.3.

**Architecture:** A backing TypeScript script (`update-history.ts`, mirroring `bump-plugin-version.ts`'s shape) finds every `.digismith/docs/*/report.html` that changed in the merge range, parses each report's fixed placeholders (already produced by `report-implementation`/N), and appends one Timeline `<div class="event">` per report — no new sidecar file, `report.html` is both the trigger signal and the data source. The hook file itself is a thin wrapper: same DigiSmith-repo gate as `01`/`02`, invoke the script, commit+push on a real result.

**Tech Stack:** TypeScript (the new script), Vitest, Bash (the hook body), matching `01-version-bump.md`/`bump-plugin-version.ts`'s existing pattern exactly.

## Global Constraints

- Full spec: `.digismith/docs/history-update-post-finish-hook/design.html` — read it if anything below is ambiguous.
- Test command for this repo: `pnpm test` (runs `vitest run`). Default recursive `*.test.ts` discovery picks up test files anywhere in the repo, including under `.digismith/`.
- This hook is mechanical-only: it appends the Timeline entry and bumps "Last updated." It never touches the Map table, Build Order, or Progress Overview sections — badge-flipping is judgment, not mechanics (explicit design decision, don't relitigate it in a task).
- Same DigiSmith-repo gate as `01-version-bump.md`/`02-plugin-reinstall.md`, verbatim (`<MAIN_ROOT>/.claude-plugin/plugin.json` exists and contains the literal substring `"name": "digismith"`) — each hook file stays self-contained, no shared gate snippet (explicit, human-confirmed precedent from Y.1, don't relitigate).
- No dedup check against existing Timeline links (YAGNI — explicit design decision).
- Commit and push immediately on a real result, no draft-and-pause (explicit design decision, matches `01`/`02`'s fire-and-forget pattern).
- `history.html` and other shared docs in this repo use CRLF line endings. Any string built for insertion into `history.html` must match its detected line-ending style — do not hardcode `\n`.
- Commit messages: title only, no body, no AI references (this repo's standing convention — verified live this session: a generic system-level attribution instruction does **not** override this).
- This is DigiSmith's own self-development. Multiple other Claude Code sessions may be concurrently active on this same repo/checkout — before any file edit that uses an exact "find" substring against a shared doc (`MEMORY.md`, `history.html`, `backlog/README.md`), verify the substring still matches what's actually in the file; if it doesn't, stop and report rather than guessing at a fuzzy replacement.

---

### Task 1: Write `update-history.ts` and its tests

**Files:**
- Create: `.digismith/hooks/post-finish/scripts/update-history.ts`
- Create: `.digismith/hooks/post-finish/scripts/update-history.test.ts`

**Interfaces:**
- Produces (all exported): `findChangedReports(baseSha: string, cwd?: string): string[]`,
  `parseReport(reportPath: string): { featureTitle: string; mapItem: string; date: string; summary: string; slug: string }`,
  `buildReferenceLinks(slug: string, cwd?: string): string`,
  `buildEventHtml(entry: { date: string; title: string; body: string }, nl?: string): string`,
  `insertTimelineEntries(historyHtml: string, eventsHtml: string[]): string`,
  `bumpLastUpdated(historyHtml: string, todayIso: string): string`,
  `main(): void`. Task 2's `03-history-update.md` invokes this file directly as a CLI
  (`node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base <sha>`);
  nothing imports it as a module.

- [ ] **Step 1: Write the implementation**

Create `.digismith/hooks/post-finish/scripts/update-history.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, requireArgs } from "../../../../scripts/cli-args.ts";

export function findChangedReports(baseSha: string, cwd: string = process.cwd()): string[] {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=AM", `${baseSha}..HEAD`, "--", ".digismith/docs/*/report.html"],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git diff failed for ${baseSha}..HEAD: ${result.stderr}`);
  }
  return result.stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

export interface ParsedReport {
  featureTitle: string;
  mapItem: string;
  date: string;
  summary: string;
  slug: string;
}

export function parseReport(reportPath: string): ParsedReport {
  const html = fs.readFileSync(reportPath, "utf8");

  const titleMatch = /<h1>(.+?) — Implementation Report<\/h1>/.exec(html);
  if (!titleMatch) {
    throw new Error(`Cannot find FEATURE_TITLE (<h1>...— Implementation Report</h1>) in ${reportPath}`);
  }

  const mapItemMatch = /Map item: <strong>(.+?)<\/strong>/.exec(html);
  if (!mapItemMatch) {
    throw new Error(`Cannot find MAP_ITEM (Map item: <strong>...</strong>) in ${reportPath}`);
  }

  const dateMatch = /<span>Date: (.+?)<\/span>/.exec(html);
  if (!dateMatch) {
    throw new Error(`Cannot find DATE (<span>Date: ...</span>) in ${reportPath}`);
  }

  const summaryMatch = /<section id="summary">[\s\S]*?<p>([\s\S]*?)<\/p>/.exec(html);
  if (!summaryMatch) {
    throw new Error(`Cannot find SUMMARY_PARAGRAPH (<section id="summary">...<p>...</p>) in ${reportPath}`);
  }

  const normalizedPath = reportPath.replace(/\\/g, "/");
  const slugMatch = /\.digismith\/docs\/([^/]+)\/report\.html$/.exec(normalizedPath);
  if (!slugMatch) {
    throw new Error(`Cannot derive slug from report path (expected .digismith/docs/<slug>/report.html): ${reportPath}`);
  }

  return {
    featureTitle: titleMatch[1],
    mapItem: mapItemMatch[1],
    date: dateMatch[1],
    summary: summaryMatch[1].trim(),
    slug: slugMatch[1],
  };
}

export function buildReferenceLinks(slug: string, cwd: string = process.cwd()): string {
  const folder = path.join(cwd, ".digismith", "docs", slug);
  const parts: { label: string; href: string }[] = [];
  if (fs.existsSync(path.join(folder, "design.html"))) {
    parts.push({ label: "design", href: `docs/${slug}/design.html` });
  }
  if (fs.existsSync(path.join(folder, "plan.md"))) {
    parts.push({ label: "plan", href: `docs/${slug}/plan.md` });
  }
  parts.push({ label: "report", href: `docs/${slug}/report.html` });

  const links = parts.map((p) => `<a href="${p.href}">${p.label}</a>`);
  if (links.length === 1) {
    return `See ${links[0]}.`;
  }
  const last = links[links.length - 1];
  const rest = links.slice(0, -1);
  const restJoined = rest.length > 1 ? `${rest.join(", ")},` : rest[0];
  return `See ${restJoined} and ${last}.`;
}

export function buildEventHtml(
  entry: { date: string; title: string; body: string },
  nl: string = "\n",
): string {
  return [
    `    <div class="event">`,
    `      <div class="date">${entry.date}</div>`,
    `      <h4>${entry.title}</h4>`,
    `      <p>${entry.body}</p>`,
    `    </div>`,
  ].join(nl);
}

export function insertTimelineEntries(historyHtml: string, eventsHtml: string[]): string {
  const nl = historyHtml.includes("\r\n") ? "\r\n" : "\n";
  const sectionStart = historyHtml.indexOf('<section id="timeline">');
  if (sectionStart === -1) {
    throw new Error('Cannot find <section id="timeline"> in history.html');
  }
  const closingMarker = `${nl}${nl}  </div>${nl}</section>`;
  const closingIndex = historyHtml.indexOf(closingMarker, sectionStart);
  if (closingIndex === -1) {
    throw new Error("Cannot find timeline section's closing </div></section> in history.html");
  }
  const insertion = eventsHtml.map((html) => `${nl}${nl}${html}`).join("");
  return historyHtml.slice(0, closingIndex) + insertion + historyHtml.slice(closingIndex);
}

export function bumpLastUpdated(historyHtml: string, todayIso: string): string {
  const pattern = /(<span>Last updated: )([^<]+)(<\/span>)/;
  if (!pattern.test(historyHtml)) {
    throw new Error('Cannot find "Last updated:" span in history.html');
  }
  return historyHtml.replace(pattern, `$1${todayIso}$3`);
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args, ["base"]);

  try {
    const cwd = process.cwd();
    const changedReports = findChangedReports(args.base, cwd);

    if (changedReports.length === 0) {
      console.log("NOTHING (no report in range)");
      return;
    }

    const historyPath = path.join(cwd, ".digismith", "history.html");
    let historyHtml = fs.readFileSync(historyPath, "utf8");
    const nl = historyHtml.includes("\r\n") ? "\r\n" : "\n";
    const today = new Date().toISOString().slice(0, 10);

    const eventsHtml: string[] = [];
    const titles: string[] = [];

    for (const relPath of changedReports) {
      const absPath = path.join(cwd, relPath);
      const parsed = parseReport(absPath);
      const links = buildReferenceLinks(parsed.slug, cwd);
      const body = `${parsed.summary} ${links}`;
      eventsHtml.push(buildEventHtml({ date: parsed.date, title: parsed.featureTitle, body }, nl));
      titles.push(parsed.featureTitle);
    }

    historyHtml = insertTimelineEntries(historyHtml, eventsHtml);
    historyHtml = bumpLastUpdated(historyHtml, today);
    fs.writeFileSync(historyPath, historyHtml);

    console.log(`APPENDED ${eventsHtml.length}: ${titles.join(", ")}`);
  } catch (err) {
    console.error(`Cannot update history: ${(err as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 2: Write the test file**

Create `.digismith/hooks/post-finish/scripts/update-history.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  findChangedReports,
  parseReport,
  buildReferenceLinks,
  buildEventHtml,
  insertTimelineEntries,
  bumpLastUpdated,
} from "./update-history.ts";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeReportFixture(dir: string, overrides: Partial<{
  title: string;
  mapItem: string;
  date: string;
  summary: string;
}> = {}): string {
  const title = overrides.title ?? "Sample Feature (Z)";
  const mapItem = overrides.mapItem ?? "Z";
  const date = overrides.date ?? "2026-09-11";
  const summary = overrides.summary ?? "Built the sample feature end to end.";
  const html = `<!doctype html>
<html><head><title>${title} — Implementation Report</title></head>
<body>
<header class="doc-head">
  <h1>${title} — Implementation Report</h1>
  <div class="meta">
    <span>Date: ${date}</span>
    <span>Map item: <strong>${mapItem}</strong></span>
  </div>
</header>
<section id="summary">
  <h2>Summary</h2>
  <p>${summary}</p>
  <p>Reference documents: the <a href="design.html">design spec</a>.</p>
</section>
</body></html>`;
  fs.writeFileSync(dir, html);
  return dir;
}

const HISTORY_FIXTURE = [
  "<!doctype html>",
  "<html><body>",
  '<header><span>Last updated: 2026-01-01</span></header>',
  '<section id="timeline">',
  "  <h2>Timeline</h2>",
  '  <div class="timeline">',
  "",
  '    <div class="event">',
  '      <div class="date">2026-01-01</div>',
  "      <h4>First entry</h4>",
  "      <p>Original entry.</p>",
  "    </div>",
  "",
  "  </div>",
  "</section>",
  "</body></html>",
].join("\r\n");

describe("parseReport", () => {
  it("extracts title, map item, date, summary, and slug from a valid report", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "sample-feature");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Sample Feature (Z)", mapItem: "Z", date: "2026-09-11", summary: "Built it." });

    const parsed = parseReport(reportPath);

    expect(parsed).toEqual({
      featureTitle: "Sample Feature (Z)",
      mapItem: "Z",
      date: "2026-09-11",
      summary: "Built it.",
      slug: "sample-feature",
    });

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("throws a clear error when the title marker is missing", () => {
    const dir = makeTmpDir("update-history-test-");
    const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, "<html><body>no title here</body></html>");

    expect(() => parseReport(reportPath)).toThrow("Cannot find FEATURE_TITLE");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("throws a clear error when the map item marker is missing", () => {
    const dir = makeTmpDir("update-history-test-");
    const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, "<html><body><h1>X — Implementation Report</h1></body></html>");

    expect(() => parseReport(reportPath)).toThrow("Cannot find MAP_ITEM");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("throws a clear error when the date marker is missing", () => {
    const dir = makeTmpDir("update-history-test-");
    const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      '<html><body><h1>X — Implementation Report</h1>Map item: <strong>X</strong></body></html>',
    );

    expect(() => parseReport(reportPath)).toThrow("Cannot find DATE");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("throws a clear error when the summary section is missing", () => {
    const dir = makeTmpDir("update-history-test-");
    const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      '<html><body><h1>X — Implementation Report</h1><span>Date: 2026-09-11</span>Map item: <strong>X</strong></body></html>',
    );

    expect(() => parseReport(reportPath)).toThrow("Cannot find SUMMARY_PARAGRAPH");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("throws a clear error when the path doesn't match .digismith/docs/<slug>/report.html", () => {
    const dir = makeTmpDir("update-history-test-");
    const reportPath = path.join(dir, "somewhere-else", "report.html");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    writeReportFixture(reportPath);

    expect(() => parseReport(reportPath)).toThrow("Cannot derive slug from report path");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("buildReferenceLinks", () => {
  it("links design, plan, and report with an Oxford comma when all three exist", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "sample-feature");
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, "design.html"), "");
    fs.writeFileSync(path.join(slugDir, "plan.md"), "");

    const result = buildReferenceLinks("sample-feature", dir);

    expect(result).toBe(
      'See <a href="docs/sample-feature/design.html">design</a>, <a href="docs/sample-feature/plan.md">plan</a>, and <a href="docs/sample-feature/report.html">report</a>.',
    );

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("omits design when design.html is missing", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "sample-feature");
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, "plan.md"), "");

    const result = buildReferenceLinks("sample-feature", dir);

    expect(result).toBe(
      'See <a href="docs/sample-feature/plan.md">plan</a> and <a href="docs/sample-feature/report.html">report</a>.',
    );

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to just the report link when both design.html and plan.md are missing", () => {
    const dir = makeTmpDir("update-history-test-");
    fs.mkdirSync(path.join(dir, ".digismith", "docs", "sample-feature"), { recursive: true });

    const result = buildReferenceLinks("sample-feature", dir);

    expect(result).toBe('See <a href="docs/sample-feature/report.html">report</a>.');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("buildEventHtml", () => {
  it("renders the event block with the given newline style and does not escape content", () => {
    const html = buildEventHtml(
      { date: "2026-09-11", title: "Sample &amp; Feature", body: "Body with &lt;tag&gt; already escaped." },
      "\r\n",
    );

    expect(html).toBe(
      [
        '    <div class="event">',
        '      <div class="date">2026-09-11</div>',
        "      <h4>Sample &amp; Feature</h4>",
        "      <p>Body with &lt;tag&gt; already escaped.</p>",
        "    </div>",
      ].join("\r\n"),
    );
  });
});

describe("insertTimelineEntries", () => {
  it("appends one event after the existing entry, preserving CRLF style", () => {
    const newEvent = ['    <div class="event">', "      <h4>New</h4>", "    </div>"].join("\r\n");

    const result = insertTimelineEntries(HISTORY_FIXTURE, [newEvent]);

    expect(result).toContain("First entry");
    expect(result).toContain("New");
    expect(result.indexOf("First entry")).toBeLessThan(result.indexOf("New"));
    expect(result).toContain('  </div>\r\n</section>');
  });

  it("appends multiple events in the given order", () => {
    const eventA = ['    <div class="event">', "      <h4>A</h4>", "    </div>"].join("\r\n");
    const eventB = ['    <div class="event">', "      <h4>B</h4>", "    </div>"].join("\r\n");

    const result = insertTimelineEntries(HISTORY_FIXTURE, [eventA, eventB]);

    expect(result.indexOf("<h4>A</h4>")).toBeLessThan(result.indexOf("<h4>B</h4>"));
  });

  it("throws when the timeline section is absent", () => {
    expect(() => insertTimelineEntries("<html><body>no timeline here</body></html>", ["x"])).toThrow(
      'Cannot find <section id="timeline">',
    );
  });
});

describe("bumpLastUpdated", () => {
  it("replaces the existing date", () => {
    const result = bumpLastUpdated(HISTORY_FIXTURE, "2026-09-11");

    expect(result).toContain("<span>Last updated: 2026-09-11</span>");
    expect(result).not.toContain("2026-01-01</span>");
  });

  it("throws a clear error when the span is missing", () => {
    expect(() => bumpLastUpdated("<html><body>no meta here</body></html>", "2026-09-11")).toThrow(
      'Cannot find "Last updated:" span',
    );
  });
});

function initHistoryFixtureRepo(dir: string): void {
  fs.mkdirSync(path.join(dir, ".digismith", "docs", "sample-feature"), { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "placeholder");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "base commit"], { cwd: dir });
}

describe("findChangedReports", () => {
  it("returns an empty array when no report.html changed", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();

      expect(findChangedReports(baseSha, dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns the report.html path added since the base commit", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();

      const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
      writeReportFixture(reportPath);
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "add report"], { cwd: dir });

      expect(findChangedReports(baseSha, dir)).toEqual([".digismith/docs/sample-feature/report.html"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores changes to files outside .digismith/docs/*/report.html", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();

      fs.writeFileSync(path.join(dir, "README.md"), "changed");
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "unrelated change"], { cwd: dir });

      expect(findChangedReports(baseSha, dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `pnpm test -- update-history`
Expected: PASS — all tests green (18 tests across the six `describe` blocks).

- [ ] **Step 4: Commit**

```bash
git add .digismith/hooks/post-finish/scripts/update-history.ts .digismith/hooks/post-finish/scripts/update-history.test.ts
git commit -m "feat(history-update): add update-history.ts script"
```

---

### Task 2: Write the `03-history-update.md` hook file

**Files:**
- Create: `.digismith/hooks/post-finish/03-history-update.md`

**Interfaces:**
- Consumes: Task 1's `update-history.ts` CLI contract (`node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base <sha>`, stdout starting with `APPENDED <n>: <titles>` or `NOTHING (no report in range)`, exit 0 on success, exit 1 with a stderr message on failure).
- Produces: one file at the exact path above. Nothing else consumes it directly — `fire-lifecycle-hook.md`'s existing enumerate-and-follow procedure (already generic, unchanged by this plan) picks it up automatically because it's the third `.md` file, sorted, under `.digismith/hooks/post-finish/`.

There is no automated test harness for prose files in this repo — verification here is a careful read-through plus the manual gate-check smoke test in Step 2.

- [ ] **Step 1: Write the hook file**

Create `.digismith/hooks/post-finish/03-history-update.md`:

```markdown
---
name: history-update
description: Stock post-finish hook — logs the just-shipped feature into .digismith/history.html
---

# History Update

**DigiSmith's own repo only.** Check first:

\`\`\`bash
MAIN_ROOT=$(git rev-parse --show-toplevel)
IS_DIGISMITH=false
if [ -f "$MAIN_ROOT/.claude-plugin/plugin.json" ] && grep -q '"name": "digismith"' "$MAIN_ROOT/.claude-plugin/plugin.json"; then
  IS_DIGISMITH=true
fi
echo "$IS_DIGISMITH"
\`\`\`

If `IS_DIGISMITH` is not `true`, stop here — this hook does nothing in any other repo.

Otherwise, update the build history:

\`\`\`bash
cd "$(git rev-parse --show-toplevel)"
BASE_SHA=$(git rev-parse ORIG_HEAD)
UPDATE_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base "$BASE_SHA")
UPDATE_STATUS=$?
echo "$UPDATE_OUTPUT"
if [ "$UPDATE_STATUS" -ne 0 ]; then
  echo "History update script failed — stop here, do not commit, and investigate." >&2
fi
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  git add .digismith/history.html && \
  git commit -m "docs(history): record shipped features" && \
  git push origin <base-branch>
fi
\`\`\`

If that push is rejected (the remote moved since Option 1's own push, or since
`01-version-bump.md`'s own second push): stop, report the rejection plainly, and investigate —
do not force-push automatically, the same as every other push in this skill.

`ORIG_HEAD` is git's own record of the branch tip immediately before the merge that triggered
this `post-finish` firing — the same value `01-version-bump.md` reads, for the same reason: still
valid here since nothing between the merge and this hook firing changes it.

An `APPENDED <n>: <titles>` result commits `.digismith/history.html` in its own commit — separate
from the merge commit and from `01`'s bump commit — and pushes it. A `NOTHING (no report in
range)` result means the merged range contained no `.digismith/docs/<slug>/report.html` — either
a docs-only change, or a merge that didn't go through `report-implementation` (N) — and nothing
further happens. A non-zero exit means the script itself failed (a malformed report, or the
Timeline section couldn't be located): stop, do not commit, and investigate — a bad append would
corrupt `history.html` for everyone.

This hook only ever appends the Timeline entry and bumps "Last updated." It does **not** touch
the Map table, Build Order, or Progress Overview sections — whether this merge closes a letter or
sub-item is judgment, not mechanics. After a real `APPENDED` result, remind whoever is watching:

> "`.digismith/history.html`'s timeline is current, but its Map/Build Order/Progress Overview
> sections were not touched — check whether this merge closes a letter or sub-item and update
> those by hand if so."
```

- [ ] **Step 2: Manual smoke test of the gate logic**

Run from the repo root (this repo genuinely is DigiSmith, so this should evaluate `true` — the
same gate check `01`/`02` already open with):

```bash
MAIN_ROOT=$(git rev-parse --show-toplevel)
IS_DIGISMITH=false
if [ -f "$MAIN_ROOT/.claude-plugin/plugin.json" ] && grep -q '"name": "digismith"' "$MAIN_ROOT/.claude-plugin/plugin.json"; then
  IS_DIGISMITH=true
fi
echo "$IS_DIGISMITH"
```

Expected output: `true`.

- [ ] **Step 3: Confirm hook ordering**

```bash
ls .digismith/hooks/post-finish/*.md
```

Expected output: `01-version-bump.md`, `02-plugin-reinstall.md`, and `03-history-update.md`, in
that order — confirming `fire-lifecycle-hook.md`'s filename-sort firing will run this hook last.

- [ ] **Step 4: Commit**

```bash
git add .digismith/hooks/post-finish/03-history-update.md
git commit -m "feat(history-update): add 03-history-update.md stock hook (Y.1.3)"
```

---

### Task 3: Doc updates and backlog retirement

**Files:**
- Modify: `MEMORY.md` (the **Y** row's Y.1.3 clause)
- Modify: `.digismith/history.html` (the Map table's Y row Y.1.3 clause)
- Modify: `backlog/README.md` (remove one line)
- Delete: `backlog/history-update-post-finish-hook-y13.md`

**Interfaces:** None — pure documentation, no code.

- [ ] **Step 1: Update the Y.1.3 clause in `MEMORY.md`**

Verify this exact substring is still present in the **Y** row (if not, stop and report):

```
· **Y.1.3** (backlog, 2026-09-11): a third stock `post-finish` hook that appends the just-shipped feature's `.digismith/history.html` timeline entry and flips its map badges — in this numbering the two shipped stock hooks read as Y.1.1 (version bump) and Y.1.2 (plugin reinstall). Raised by Jack right after V.3 shipped, when the page turned out untouched by every build since 2026-08-27 (backfilled by hand the same day); source-of-truth and slug-derivation questions still open, no design yet — see `backlog/history-update-post-finish-hook-y13.md`
```

Replace it with:

```
· **Y.1.3** built 2026-09-11: a third stock `post-finish` hook, `.digismith/hooks/post-finish/03-history-update.md` — in this numbering the two earlier stock hooks read as Y.1.1 (version bump) and Y.1.2 (plugin reinstall). Parses the `report.html` file(s) that changed in the merge range (already produced by `report-implementation`/N for nearly every DigiSmith self-dev feature) as both trigger signal and data source — no new sidecar needed — via `.digismith/hooks/post-finish/scripts/update-history.ts`, appending one Timeline entry per report found. Deliberately mechanical-only: never auto-flips Map/Build Order/Progress Overview badges (judgment, not mechanics), just reminds the agent to check them by hand. See `.digismith/docs/history-update-post-finish-hook/design.html`
```

Do not touch any other part of the **Y** row.

- [ ] **Step 2: Update the Y.1.3 clause in `.digismith/history.html`**

Verify this exact substring is still present in the Map table's Y row (if not, stop and report):

```
 · <strong>Y.1.3</strong> a third stock hook that logs the shipped feature into this page — backlog, raised 2026-09-11 <span class="status todo">Not started</span> · cross-repo hook sharing deferred to tentative letter <strong>Y2</strong>
```

Replace it with:

```
 · <strong>Y.1.3</strong> built 2026-09-11: a third stock hook, <code>03-history-update.md</code>, logging each shipped feature's report into this page's own Timeline — mechanical only, badges stay a manual judgment call <span class="status done">Done</span> · cross-repo hook sharing deferred to tentative letter <strong>Y2</strong>
```

Also verify this exact substring is present in the same row's status cell (if not, stop and report):

```
<span class="status next">In progress (Y.1 shipped)</span>
```

Replace it with:

```
<span class="status next">In progress (Y.1/Y.1.3 shipped)</span>
```

Do not touch any other part of `history.html` — in particular, do not add a Timeline entry by
hand: this plan's own merge will exercise `03-history-update.md` for the first time and add that
entry automatically (same chicken-and-egg pattern Y.1 itself had with the installed plugin cache
— see the Finish step's own note in `finishing-a-development-branch`).

- [ ] **Step 3: Update `backlog/README.md`**

Verify this exact line is still present (if not, stop and report), then remove it entirely
(including its trailing newline):

```
- [Post-finish hook that updates `.digismith/history.html` (tentatively Y.1.3)](history-update-post-finish-hook-y13.md) — a third stock hook under Y.1's post-finish point; every feature since 2026-08-27 shipped without a history entry, page backfilled by hand 2026-09-11, this would keep it current the way `01-version-bump.md` fixed the manual bump
```

- [ ] **Step 4: Delete the superseded backlog item**

```bash
git rm backlog/history-update-post-finish-hook-y13.md
```

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS — this task touched no code, so the suite's pass count should be Task 1's baseline
count plus Task 1's own new tests (no change from Task 2's completion). Note the actual count in
your report for the reviewer to compare.

- [ ] **Step 6: Commit**

```bash
git add MEMORY.md .digismith/history.html backlog/README.md
git commit -m "docs(Y.1.3): record history-update hook in MEMORY.md and history.html, retire superseded backlog item"
```

---
