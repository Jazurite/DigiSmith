import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  findChangedReports,
  parseReport,
  buildReferenceLinks,
  findDeadLinks,
  buildEventHtml,
  insertTimelineEntries,
  bumpLastUpdated,
  resolveHistoryDir,
  buildPermalinkBase,
  isPublished,
  isAlreadyRecorded,
} from "./update-history.ts";

const PL = "https://github.com/Jazurite/DigiSmith/blob/abc123";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeReportFixture(dir: string, overrides: Partial<{
  title: string;
  ticket: string;
  date: string;
  summary: string;
  legacy: boolean;
}> = {}): string {
  const title = overrides.title ?? "Sample Feature (Z)";
  const ticket = overrides.ticket ?? "Z";
  const date = overrides.date ?? "2026-09-11";
  const summary = overrides.summary ?? "Built the sample feature end to end.";
  const legacy = overrides.legacy ?? false;
  const ticketLine = legacy
    ? `<span>Map item: <strong>${ticket}</strong></span>`
    : `<span>Ticket: <strong>${ticket}</strong></span>`;
  const html = `<!doctype html>
<html><head><title>${title} — Implementation Report</title></head>
<body>
<header class="doc-head">
  <h1>${title} — Implementation Report</h1>
  <div class="meta">
    <span>Date: ${date}</span>
    ${ticketLine}
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
    writeReportFixture(reportPath, { title: "Sample Feature (Z)", ticket: "Z", date: "2026-09-11", summary: "Built it.", legacy: true });

    const parsed = parseReport(reportPath);

    expect(parsed).toEqual({
      featureTitle: "Sample Feature (Z)",
      ticket: "Z",
      date: "2026-09-11",
      summary: "Built it.",
      slug: "sample-feature",
      base: "docs",
    });

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("extracts a two-segment slug from a nested report path", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "G", "G.3-dynamic-doc-conventions");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Dynamic Doc Conventions (G.3)", ticket: "G.3", date: "2026-09-23", summary: "Nested the docs.", legacy: true });

    const parsed = parseReport(reportPath);

    expect(parsed).toEqual({
      featureTitle: "Dynamic Doc Conventions (G.3)",
      ticket: "G.3",
      date: "2026-09-23",
      summary: "Nested the docs.",
      slug: "G/G.3-dynamic-doc-conventions",
      base: "docs",
    });

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("extracts a three-segment slug from a clan/lineage/slug report path", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "A", "A.1", "lineage-handoff");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Lineage Handoff", ticket: "A.1", date: "2026-09-26", summary: "Moved the handoff.", legacy: true });

    const parsed = parseReport(reportPath);

    expect(parsed).toEqual({
      featureTitle: "Lineage Handoff",
      ticket: "A.1",
      date: "2026-09-26",
      summary: "Moved the handoff.",
      slug: "A/A.1/lineage-handoff",
      base: "docs",
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

  it("throws a clear error when neither Ticket nor Map item is present", () => {
    const dir = makeTmpDir("update-history-test-");
    const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, "<html><body><h1>X — Implementation Report</h1></body></html>");

    expect(() => parseReport(reportPath)).toThrow(/Cannot find TICKET.*MAP_ITEM/s);

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

  it("extracts a one-segment board slug, with base \"board\"", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "board", "DGS-159—ticket-naming-script-layer");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Shared Path Modules", ticket: "DGS-159", date: "2026-10-04", summary: "Built the modules.", legacy: true });

    const parsed = parseReport(reportPath);

    expect(parsed).toEqual({
      featureTitle: "Shared Path Modules",
      ticket: "DGS-159",
      date: "2026-10-04",
      summary: "Built the modules.",
      slug: "DGS-159—ticket-naming-script-layer",
      base: "board",
    });

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("extracts a two-segment board slug (a part subfolder), with base \"board\"", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(
      dir,
      ".digismith",
      "board",
      "DGS-159—ticket-naming-script-layer",
      "script-layer",
    );
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Shared Path Modules", ticket: "DGS-159", date: "2026-10-04", summary: "Built the modules.", legacy: true });

    const parsed = parseReport(reportPath);

    expect(parsed.slug).toBe("DGS-159—ticket-naming-script-layer/script-layer");
    expect(parsed.base).toBe("board");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a new-style Ticket: line for a keyed report", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "board", "DGS-199—some-ticket");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Some Ticket", ticket: "DGS-199", date: "2026-10-05", summary: "Shipped it." });

    const parsed = parseReport(reportPath);

    expect(parsed.ticket).toBe("DGS-199");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a new-style Ticket: line with the literal n/a value for keyless work", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "some-keyless-feature");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "Some Keyless Feature", ticket: "n/a", date: "2026-10-05", summary: "Shipped it." });

    const parsed = parseReport(reportPath);

    expect(parsed.ticket).toBe("n/a");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("still accepts a legacy Map item: line with no Ticket: line present at all", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "an-old-feature");
    fs.mkdirSync(slugDir, { recursive: true });
    const reportPath = path.join(slugDir, "report.html");
    writeReportFixture(reportPath, { title: "An Old Feature (G.3)", ticket: "G.3", date: "2026-08-01", summary: "Shipped it long ago.", legacy: true });

    const parsed = parseReport(reportPath);

    expect(parsed.ticket).toBe("G.3");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("prefers Ticket: over a legacy Map item: line when both are present (the old {{TICKET_KEY_META}} report shape)", () => {
    const dir = makeTmpDir("update-history-test-");
    const reportPath = path.join(dir, ".digismith", "docs", "both-lines", "report.html");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      '<html><body><h1>X — Implementation Report</h1>' +
        '<span>Date: 2026-10-05</span>' +
        '<span>Ticket: <strong>DGS-1</strong></span>' +
        '<span>Map item: <strong>Z</strong></span>' +
        '<section id="summary"><p>Built it.</p></section>' +
        '</body></html>',
    );

    const parsed = parseReport(reportPath);

    expect(parsed.ticket).toBe("DGS-1");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("isAlreadyRecorded", () => {
  const page = '<h4>Sample Feature</h4><p>See <a href="https://x/blob/s1/.digismith/board/DGS-1%E2%80%94x/report.html">report</a>.</p>';

  it("matches the title plus the report path, whatever the sha", () => {
    expect(isAlreadyRecorded(page, "Sample Feature", "board", "DGS-1—x")).toBe(true);
  });

  it("matches an old relative link with a raw em dash", () => {
    const old = '<h4>T</h4><a href="board/DGS-1—x/report.html">report</a>';
    expect(isAlreadyRecorded(old, "T", "board", "DGS-1—x")).toBe(true);
  });

  it("is false for another title or another report", () => {
    expect(isAlreadyRecorded(page, "Other", "board", "DGS-1—x")).toBe(false);
    expect(isAlreadyRecorded(page, "Sample Feature", "board", "DGS-2—y")).toBe(false);
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

function revParseHead(dir: string): string {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
}

const SCRIPT_PATH = fileURLToPath(new URL("./update-history.ts", import.meta.url));

function runScript(cwd: string, args: string[]) {
  return spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

describe// A real git repo: `tracked` files are committed (the head), `onDisk` files are written after the
// commit and stay untracked, `late` files are committed AFTER the returned head sha.
function makeLinkRepo(opts: { tracked?: string[]; onDisk?: string[]; late?: string[] }): { dir: string; head: string } {
  const dir = makeTmpDir("update-history-links-");
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  const put = (rel: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), "x");
  };
  put("README.md");
  for (const rel of opts.tracked ?? []) put(rel);
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "head"], { cwd: dir });
  const head = revParseHead(dir);
  for (const rel of opts.onDisk ?? []) put(rel);
  for (const rel of opts.late ?? []) put(rel);
  if (opts.late?.length) {
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-q", "-m", "after head"], { cwd: dir });
  }
  return { dir, head };
}

describe("buildReferenceLinks", () => {
  const D = ".digismith/docs/sample-feature";

  it("links design, plan, and report with an Oxford comma when all three are at head", () => {
    const { dir, head } = makeLinkRepo({ tracked: [`${D}/design.html`, `${D}/plan.md`, `${D}/report.html`] });
    try {
      const result = buildReferenceLinks("sample-feature", "docs", dir, PL, head);

      expect(result).toBe(
        `See <a href="${PL}/${D}/design.html">design</a>, <a href="${PL}/${D}/plan.md">plan</a>, and <a href="${PL}/${D}/report.html">report</a>.`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("omits design when design.html is absent on disk and at head", () => {
    const { dir, head } = makeLinkRepo({ tracked: [`${D}/plan.md`, `${D}/report.html`] });
    try {
      const result = buildReferenceLinks("sample-feature", "docs", dir, PL, head);

      expect(result).toBe(`See <a href="${PL}/${D}/plan.md">plan</a> and <a href="${PL}/${D}/report.html">report</a>.`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to just the report link when design.html and plan.md are absent everywhere", () => {
    const { dir, head } = makeLinkRepo({ tracked: [`${D}/report.html`] });
    try {
      expect(buildReferenceLinks("sample-feature", "docs", dir, PL, head)).toBe(
        `See <a href="${PL}/${D}/report.html">report</a>.`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("links a board-based report under board/, not docs/", () => {
    const slug = "DGS-159—ticket-naming-script-layer";
    const B = `.digismith/board/${slug}`;
    const { dir, head } = makeLinkRepo({ tracked: [`${B}/design.html`, `${B}/report.html`] });
    try {
      expect(buildReferenceLinks(slug, "board", dir, PL, head)).toBe(
        `See <a href="${PL}/.digismith/board/DGS-159%E2%80%94ticket-naming-script-layer/design.html">design</a> and <a href="${PL}/.digismith/board/DGS-159%E2%80%94ticket-naming-script-layer/report.html">report</a>.`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the slash of a nested board slug and encodes each segment", () => {
    const slug = "DGS-159—x/script-layer";
    const { dir, head } = makeLinkRepo({ tracked: [`.digismith/board/${slug}/report.html`] });
    try {
      expect(buildReferenceLinks(slug, "board", dir, PL, head)).toBe(
        `See <a href="${PL}/.digismith/board/DGS-159%E2%80%94x/script-layer/report.html">report</a>.`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("encodes #, ? and % in a path", () => {
    const slug = "a#b?c%d";
    const { dir, head } = makeLinkRepo({ tracked: [`.digismith/docs/${slug}/report.html`] });
    try {
      expect(buildReferenceLinks(slug, "docs", dir, PL, head)).toBe(
        `See <a href="${PL}/.digismith/docs/a%23b%3Fc%25d/report.html">report</a>.`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws DEAD <path> for a plan.md on disk but untracked", () => {
    const { dir, head } = makeLinkRepo({ tracked: [`${D}/report.html`], onDisk: [`${D}/plan.md`] });
    try {
      expect(() => buildReferenceLinks("sample-feature", "docs", dir, PL, head)).toThrow(`DEAD ${D}/plan.md`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws DEAD for a plan.md committed after the head sha", () => {
    const { dir, head } = makeLinkRepo({ tracked: [`${D}/report.html`], late: [`${D}/plan.md`] });
    try {
      expect(() => buildReferenceLinks("sample-feature", "docs", dir, PL, head)).toThrow(`DEAD ${D}/plan.md`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("findDeadLinks", () => {
  const D = ".digismith/docs/sample-feature";

  it("lists only the files that are on disk but not at head", () => {
    const { dir, head } = makeLinkRepo({ tracked: [`${D}/design.html`, `${D}/report.html`], onDisk: [`${D}/plan.md`] });
    try {
      expect(findDeadLinks("sample-feature", "docs", dir, head)).toEqual([`${D}/plan.md`]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is empty when every file on disk is at head, and for a file absent everywhere", () => {
    const { dir, head } = makeLinkRepo({ tracked: [`${D}/report.html`, `${D}/plan.md`] });
    try {
      expect(findDeadLinks("sample-feature", "docs", dir, head)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags a report.html that is not at head", () => {
    const { dir, head } = makeLinkRepo({});
    try {
      expect(findDeadLinks("sample-feature", "docs", dir, head)).toEqual([`${D}/report.html`]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

("findChangedReports", () => {
  it("returns an empty array when no report.html changed", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      expect(findChangedReports(baseSha, revParseHead(dir), dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns the report.html path added since the base commit", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
      writeReportFixture(reportPath);
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "add report"], { cwd: dir });
      const headSha = revParseHead(dir);

      expect(findChangedReports(baseSha, headSha, dir)).toEqual([".digismith/docs/sample-feature/report.html"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns a report.html nested three levels deep", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      const reportPath = path.join(dir, ".digismith", "docs", "A", "A.1", "lineage-handoff", "report.html");
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      writeReportFixture(reportPath);
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "add nested report"], { cwd: dir });
      const headSha = revParseHead(dir);

      expect(findChangedReports(baseSha, headSha, dir)).toEqual([".digismith/docs/A/A.1/lineage-handoff/report.html"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores changes to files outside .digismith/docs/*/report.html", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      fs.writeFileSync(path.join(dir, "README.md"), "changed");
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "unrelated change"], { cwd: dir });
      const headSha = revParseHead(dir);

      expect(findChangedReports(baseSha, headSha, dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores a report added after head — the delayed-hook case", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      fs.writeFileSync(path.join(dir, "README.md"), "this merge's own change");
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "this merge's own commit"], { cwd: dir });
      const headSha = revParseHead(dir);

      const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
      writeReportFixture(reportPath);
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "another session's later merge adds a report"], { cwd: dir });

      expect(findChangedReports(baseSha, headSha, dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns a board/<key>—<slug>/report.html path added since the base commit", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      const slug = "DGS-159—ticket-naming-script-layer";
      const reportPath = path.join(dir, ".digismith", "board", slug, "report.html");
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      writeReportFixture(reportPath);
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "add board report"], { cwd: dir });
      const headSha = revParseHead(dir);

      expect(findChangedReports(baseSha, headSha, dir)).toEqual([`.digismith/board/${slug}/report.html`]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns a board/<key>—<slug>/<part>/report.html path (a nested part subfolder)", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      const slug = "DGS-159—ticket-naming-script-layer";
      const reportPath = path.join(dir, ".digismith", "board", slug, "script-layer", "report.html");
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      writeReportFixture(reportPath);
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "add nested board report"], { cwd: dir });
      const headSha = revParseHead(dir);

      expect(findChangedReports(baseSha, headSha, dir)).toEqual([
        `.digismith/board/${slug}/script-layer/report.html`,
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("main (CLI)", () => {
  it("rejects a missing --head", () => {
    const dir = makeTmpDir("update-history-cli-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      const result = runScript(dir, ["--base", baseSha]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("missing required flag: --head");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports NOTHING for a pinned range with no report in it", () => {
    const dir = makeTmpDir("update-history-cli-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);
      fs.writeFileSync(path.join(dir, "README.md"), "changed");
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "unrelated change"], { cwd: dir });
      const headSha = revParseHead(dir);

      const result = runScript(dir, ["--base", baseSha, "--head", headSha]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("NOTHING (no report in range)");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveHistoryDir", () => {
  it("prefers the flag, then the env var, then the depot default", () => {
    expect(resolveHistoryDir({ "history-dir": "/a" }, { DIGISMITH_HISTORY_DIR: "/b" }, "/home/u")).toBe("/a");
    expect(resolveHistoryDir({}, { DIGISMITH_HISTORY_DIR: "/b" }, "/home/u")).toBe("/b");
    expect(resolveHistoryDir({}, {}, "/home/u")).toBe("/home/u/.digismith-depot/history");
  });

  it("treats an empty or whitespace env var or flag as unset", () => {
    expect(resolveHistoryDir({}, { DIGISMITH_HISTORY_DIR: "" }, "/home/u")).toBe("/home/u/.digismith-depot/history");
    expect(resolveHistoryDir({}, { DIGISMITH_HISTORY_DIR: "  " }, "/home/u")).toBe("/home/u/.digismith-depot/history");
    expect(resolveHistoryDir({ "history-dir": " " }, { DIGISMITH_HISTORY_DIR: "/b" }, "/home/u")).toBe("/b");
  });

  it("expands a leading ~ to the home directory", () => {
    expect(resolveHistoryDir({}, { DIGISMITH_HISTORY_DIR: "~/h" }, "/home/u")).toBe("/home/u/h");
    expect(resolveHistoryDir({ "history-dir": "~" }, {}, "/home/u")).toBe("/home/u");
    expect(resolveHistoryDir({}, { DIGISMITH_HISTORY_DIR: "/x/~y" }, "/home/u")).toBe("/x/~y");
  });
});

describe("buildPermalinkBase", () => {
  it("pins the public repo URL to a commit sha", () => {
    expect(buildPermalinkBase("abc123", {})).toBe("https://github.com/Jazurite/DigiSmith/blob/abc123");
  });

  it("takes the repo URL from DIGISMITH_HISTORY_REPO_URL", () => {
    expect(buildPermalinkBase("abc123", { DIGISMITH_HISTORY_REPO_URL: "https://example.test/r/" })).toBe(
      "https://example.test/r/blob/abc123",
    );
  });
});

function makeRepoWithReport(): { dir: string; baseSha: string; headSha: string; historyDir: string } {
  const dir = makeTmpDir("update-history-e2e-");
  initHistoryFixtureRepo(dir);
  const baseSha = revParseHead(dir);
  writeReportFixture(path.join(dir, ".digismith", "docs", "sample-feature", "report.html"));
  fs.writeFileSync(path.join(dir, ".digismith", "docs", "sample-feature", "plan.md"), "");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "add report"], { cwd: dir });
  const historyDir = makeTmpDir("update-history-home-");
  fs.writeFileSync(path.join(historyDir, "history.html"), HISTORY_FIXTURE);
  return { dir, baseSha, headSha: revParseHead(dir), historyDir };
}

function addOrigin(dir: string, pushed: boolean): string {
  const bare = makeTmpDir("update-history-origin-");
  spawnSync("git", ["init", "-q", "--bare"], { cwd: bare });
  spawnSync("git", ["remote", "add", "origin", bare], { cwd: dir });
  if (pushed) spawnSync("git", ["push", "-q", "origin", "HEAD:refs/heads/main"], { cwd: dir });
  return bare;
}

describe("isPublished", () => {
  it("is true only when an origin remote-tracking ref contains the sha", () => {
    const { dir, headSha, historyDir } = makeRepoWithReport();
    const bare = addOrigin(dir, true);
    try {
      expect(isPublished(headSha, dir)).toBe(true);
      const unpushedDir = makeRepoWithReport();
      expect(isPublished(unpushedDir.headSha, unpushedDir.dir)).toBe(false);
      fs.rmSync(unpushedDir.dir, { recursive: true, force: true });
      fs.rmSync(unpushedDir.historyDir, { recursive: true, force: true });
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("is false when origin exists but is behind the sha", () => {
    const { dir, historyDir } = makeRepoWithReport();
    const bare = addOrigin(dir, true);
    try {
      fs.writeFileSync(path.join(dir, "README.md"), "newer");
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "ahead of origin"], { cwd: dir });

      expect(isPublished(revParseHead(dir), dir)).toBe(false);
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("main (CLI) with the depot history home", () => {
  it("writes the depot page with permalinks at the head sha and leaves the repo page alone", () => {
    const { dir, baseSha, headSha, historyDir } = makeRepoWithReport();
    const bare = addOrigin(dir, true);
    try {
      const repoPage = path.join(dir, ".digismith", "history.html");
      fs.writeFileSync(repoPage, HISTORY_FIXTURE);

      const result = runScript(dir, ["--base", baseSha, "--head", headSha, "--history-dir", historyDir]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("APPENDED 1: Sample Feature (Z)");
      const page = fs.readFileSync(path.join(historyDir, "history.html"), "utf8");
      const blob = `https://github.com/Jazurite/DigiSmith/blob/${headSha}/.digismith/docs/sample-feature`;
      expect(page).toContain(`<a href="${blob}/plan.md">plan</a>`);
      expect(page).toContain(`<a href="${blob}/report.html">report</a>`);
      expect(fs.readFileSync(repoPage, "utf8")).toBe(HISTORY_FIXTURE);
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("honours DIGISMITH_HISTORY_DIR when no flag is given", () => {
    const { dir, baseSha, headSha, historyDir } = makeRepoWithReport();
    const bare = addOrigin(dir, true);
    try {
      const result = spawnSync(
        "node",
        ["--experimental-strip-types", SCRIPT_PATH, "--base", baseSha, "--head", headSha],
        { cwd: dir, encoding: "utf8", env: { ...process.env, DIGISMITH_HISTORY_DIR: historyDir } },
      );

      expect(result.status).toBe(0);
      expect(fs.readFileSync(path.join(historyDir, "history.html"), "utf8")).toContain("Sample Feature (Z)");
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("stops with NO HISTORY HOME when the depot page is missing", () => {
    const { dir, baseSha, headSha, historyDir } = makeRepoWithReport();
    const bare = addOrigin(dir, true);
    try {
      const missing = path.join(historyDir, "nope");

      const result = runScript(dir, ["--base", baseSha, "--head", headSha, "--history-dir", missing]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("NO HISTORY HOME");
      expect(fs.existsSync(missing)).toBe(false);
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("fails loudly when the head sha is not on origin, and only warns with --allow-unpushed", () => {
    const { dir, baseSha, headSha, historyDir } = makeRepoWithReport();
    const bare = addOrigin(dir, false);
    try {
      const args = ["--base", baseSha, "--head", headSha, "--history-dir", historyDir];

      const loud = runScript(dir, args);
      expect(loud.status).not.toBe(0);
      expect(loud.stderr).toContain("not pushed");
      expect(fs.readFileSync(path.join(historyDir, "history.html"), "utf8")).toBe(HISTORY_FIXTURE);

      const warned = runScript(dir, [...args, "--allow-unpushed", "true"]);
      expect(warned.status).toBe(0);
      expect(warned.stderr).toContain("not pushed");
      expect(warned.stdout).toContain("APPENDED 1");
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("skips a report already in the page, so a re-run after a failed depot commit adds nothing", () => {
    const { dir, baseSha, headSha, historyDir } = makeRepoWithReport();
    const bare = addOrigin(dir, true);
    try {
      const args = ["--base", baseSha, "--head", headSha, "--history-dir", historyDir];
      const first = runScript(dir, args);
      expect(first.stdout).toContain("APPENDED 1");
      const afterFirst = fs.readFileSync(path.join(historyDir, "history.html"), "utf8");

      const second = runScript(dir, args);

      expect(second.status).toBe(0);
      expect(second.stdout).toContain("NOTHING (already recorded)");
      expect(fs.readFileSync(path.join(historyDir, "history.html"), "utf8")).toBe(afterFirst);
      expect(afterFirst.split("<h4>Sample Feature (Z)</h4>")).toHaveLength(2);
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("main (CLI) refuses a link to a file that is not at the pinned commit", () => {
  const SLUG = "DGS-396—history-links-exist";

  function makeBoardRepo(planCommitted: boolean): { dir: string; baseSha: string; headSha: string; historyDir: string } {
    const dir = makeTmpDir("update-history-dead-");
    initHistoryFixtureRepo(dir);
    const baseSha = revParseHead(dir);
    const folder = path.join(dir, ".digismith", "board", SLUG);
    fs.mkdirSync(folder, { recursive: true });
    writeReportFixture(path.join(folder, "report.html"));
    if (planCommitted) fs.writeFileSync(path.join(folder, "plan.md"), "");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-q", "-m", "add report"], { cwd: dir });
    if (!planCommitted) fs.writeFileSync(path.join(folder, "plan.md"), "");
    const historyDir = makeTmpDir("update-history-home-");
    fs.writeFileSync(path.join(historyDir, "history.html"), HISTORY_FIXTURE);
    return { dir, baseSha, headSha: revParseHead(dir), historyDir };
  }

  it("exits 1, prints DEAD <path> and writes nothing when plan.md is on disk but not at head", () => {
    const { dir, baseSha, headSha, historyDir } = makeBoardRepo(false);
    const bare = addOrigin(dir, true);
    try {
      const result = runScript(dir, ["--base", baseSha, "--head", headSha, "--history-dir", historyDir]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`DEAD .digismith/board/${SLUG}/plan.md`);
      expect(result.stdout).not.toContain("APPENDED");
      expect(fs.readFileSync(path.join(historyDir, "history.html"), "utf8")).toBe(HISTORY_FIXTURE);
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("writes the pinned full-sha plan link when plan.md is at head", () => {
    const { dir, baseSha, headSha, historyDir } = makeBoardRepo(true);
    const bare = addOrigin(dir, true);
    try {
      const result = runScript(dir, ["--base", baseSha, "--head", headSha, "--history-dir", historyDir]);

      expect(result.status).toBe(0);
      const page = fs.readFileSync(path.join(historyDir, "history.html"), "utf8");
      expect(page).toContain(
        `https://github.com/Jazurite/DigiSmith/blob/${headSha}/.digismith/board/DGS-396%E2%80%94history-links-exist/plan.md`,
      );
      expect(headSha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("skips a report already in the page BEFORE the check, so an old dead entry never fails a re-run", () => {
    const { dir, baseSha, headSha, historyDir } = makeBoardRepo(true);
    const bare = addOrigin(dir, true);
    try {
      const args = ["--base", baseSha, "--head", headSha, "--history-dir", historyDir];
      expect(runScript(dir, args).stdout).toContain("APPENDED 1");
      // the plan is now gone from head's reach: delete it from the index view by pinning to a head without it
      const folder = path.join(dir, ".digismith", "board", SLUG);
      fs.rmSync(path.join(folder, "plan.md"));
      fs.writeFileSync(path.join(folder, "plan.md"), "again");
      spawnSync("git", ["update-index", "--force-remove", `.digismith/board/${SLUG}/plan.md`], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "drop plan"], { cwd: dir });
      const laterHead = revParseHead(dir);
      const rerun = runScript(dir, ["--base", baseSha, "--head", laterHead, "--history-dir", historyDir, "--allow-unpushed", "true"]);

      expect(rerun.status).toBe(0);
      expect(rerun.stdout).toContain("NOTHING (already recorded)");
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("lists the dead paths of every report in range", () => {
    const { dir, baseSha, historyDir } = makeBoardRepo(false);
    const bare = addOrigin(dir, true);
    try {
      const other = path.join(dir, ".digismith", "board", "DGS-397—other");
      fs.mkdirSync(other, { recursive: true });
      writeReportFixture(path.join(other, "report.html"), { title: "Other Feature (Y)" });
      spawnSync("git", ["add", `.digismith/board/DGS-397—other/report.html`], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "second report"], { cwd: dir });
      fs.writeFileSync(path.join(other, "design.html"), "");

      const result = runScript(dir, ["--base", baseSha, "--head", revParseHead(dir), "--history-dir", historyDir]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`DEAD .digismith/board/${SLUG}/plan.md`);
      expect(result.stderr).toContain("DEAD .digismith/board/DGS-397—other/design.html");
    } finally {
      for (const d of [dir, historyDir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });
});
