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
  buildEventHtml,
  insertTimelineEntries,
  bumpLastUpdated,
} from "./update-history.ts";

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

describe("buildReferenceLinks", () => {
  it("links design, plan, and report with an Oxford comma when all three exist", () => {
    const dir = makeTmpDir("update-history-test-");
    const slugDir = path.join(dir, ".digismith", "docs", "sample-feature");
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, "design.html"), "");
    fs.writeFileSync(path.join(slugDir, "plan.md"), "");

    const result = buildReferenceLinks("sample-feature", "docs", dir);

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

    const result = buildReferenceLinks("sample-feature", "docs", dir);

    expect(result).toBe(
      'See <a href="docs/sample-feature/plan.md">plan</a> and <a href="docs/sample-feature/report.html">report</a>.',
    );

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to just the report link when both design.html and plan.md are missing", () => {
    const dir = makeTmpDir("update-history-test-");
    fs.mkdirSync(path.join(dir, ".digismith", "docs", "sample-feature"), { recursive: true });

    const result = buildReferenceLinks("sample-feature", "docs", dir);

    expect(result).toBe('See <a href="docs/sample-feature/report.html">report</a>.');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("links a board-based report under board/, not docs/", () => {
    const dir = makeTmpDir("update-history-test-");
    const slug = "DGS-159—ticket-naming-script-layer";
    const slugDir = path.join(dir, ".digismith", "board", slug);
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, "design.html"), "");

    const result = buildReferenceLinks(slug, "board", dir);

    expect(result).toBe(
      `See <a href="board/${slug}/design.html">design</a> and <a href="board/${slug}/report.html">report</a>.`,
    );

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

function revParseHead(dir: string): string {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
}

const SCRIPT_PATH = fileURLToPath(new URL("./update-history.ts", import.meta.url));

function runScript(cwd: string, args: string[]) {
  return spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

describe("findChangedReports", () => {
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
