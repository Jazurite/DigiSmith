import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, requireArgs } from "../../../../scripts/cli-args.ts";

// Diffs the pinned merge range only — never `HEAD`, which another session's merge may have
// moved since this merge landed.
export function findChangedReports(baseSha: string, headSha: string, cwd: string = process.cwd()): string[] {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=AM", `${baseSha}..${headSha}`, "--", ".digismith/docs/*/report.html"],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git diff failed for ${baseSha}..${headSha}: ${result.stderr}`);
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
