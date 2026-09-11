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
