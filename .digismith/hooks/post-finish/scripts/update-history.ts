import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, requireArgs } from "../../../../scripts/cli-args.ts";

// Diffs the pinned merge range only — never `HEAD`, which another session's merge may have
// moved since this merge landed. Matches both the old flat/nested docs/ shape and the new
// board/ shape (DGS-159) — until Part 6 empties docs/, a report can land in either.
export function findChangedReports(baseSha: string, headSha: string, cwd: string = process.cwd()): string[] {
  // -z: NUL-terminated, unquoted output. A board folder name carries a real em dash (U+2014),
  // and git's default core.quotepath=true would otherwise octal-escape it in plain
  // --name-only output, which a naive newline-split then can't turn back into the real path.
  const result = spawnSync(
    "git",
    [
      "diff",
      "--name-only",
      "-z",
      "--diff-filter=AM",
      `${baseSha}..${headSha}`,
      "--",
      ".digismith/docs/*/report.html",
      ".digismith/board/*/report.html",
    ],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git diff failed for ${baseSha}..${headSha}: ${result.stderr}`);
  }
  return result.stdout.split("\0").filter((line) => line.length > 0);
}

export interface ParsedReport {
  featureTitle: string;
  ticket: string;
  date: string;
  summary: string;
  slug: string;
  base: "docs" | "board";
}

const BOARD_SLUG_PATTERN = /\.digismith\/board\/([^/]+(?:\/[^/]+)?)\/report\.html$/;
const DOCS_SLUG_PATTERN = /\.digismith\/docs\/((?:[^/]+\/){0,2}[^/]+)\/report\.html$/;

export function parseReport(reportPath: string): ParsedReport {
  const html = fs.readFileSync(reportPath, "utf8");

  const titleMatch = /<h1>(.+?) — Implementation Report<\/h1>/.exec(html);
  if (!titleMatch) {
    throw new Error(`Cannot find FEATURE_TITLE (<h1>...— Implementation Report</h1>) in ${reportPath}`);
  }

  const ticketMatch =
    /Ticket: <strong>(.+?)<\/strong>/.exec(html) ??
    /Map item: <strong>(.+?)<\/strong>/.exec(html);
  if (!ticketMatch) {
    throw new Error(
      `Cannot find TICKET (Ticket: <strong>...</strong>) or the legacy MAP_ITEM ` +
        `(Map item: <strong>...</strong>) in ${reportPath}`,
    );
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
  // Board first: a board path can never also match the docs pattern (different top-level
  // folder), so there's no ambiguity to resolve between the two.
  const boardMatch = BOARD_SLUG_PATTERN.exec(normalizedPath);
  const docsMatch = boardMatch ? null : DOCS_SLUG_PATTERN.exec(normalizedPath);
  const slug = boardMatch?.[1] ?? docsMatch?.[1];
  if (!slug) {
    throw new Error(
      `Cannot derive slug from report path (expected .digismith/board/<key>—<slug>/report.html, ` +
        `.digismith/board/<key>—<slug>/<part>/report.html, .digismith/docs/<slug>/report.html, ` +
        `.digismith/docs/<parent>/<slug>/report.html, or .digismith/docs/<clan>/<lineage>/<slug>/report.html): ${reportPath}`,
    );
  }
  const base: "docs" | "board" = boardMatch ? "board" : "docs";

  return {
    featureTitle: titleMatch[1],
    ticket: ticketMatch[1],
    date: dateMatch[1],
    summary: summaryMatch[1].trim(),
    slug,
    base,
  };
}

export function buildReferenceLinks(slug: string, base: "docs" | "board", cwd: string = process.cwd()): string {
  const folder = path.join(cwd, ".digismith", base, slug);
  const parts: { label: string; href: string }[] = [];
  if (fs.existsSync(path.join(folder, "design.html"))) {
    parts.push({ label: "design", href: `${base}/${slug}/design.html` });
  }
  if (fs.existsSync(path.join(folder, "plan.md"))) {
    parts.push({ label: "plan", href: `${base}/${slug}/plan.md` });
  }
  parts.push({ label: "report", href: `${base}/${slug}/report.html` });

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
  requireArgs(args, ["base", "head"]);

  try {
    const cwd = process.cwd();
    const changedReports = findChangedReports(args.base, args.head, cwd);

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
      const links = buildReferenceLinks(parsed.slug, parsed.base, cwd);
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
