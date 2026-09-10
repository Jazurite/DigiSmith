import * as fs from "node:fs";
import { parseArgs, requireArgs } from "./cli-args.ts";

export interface FillResult {
  markdown: string;
  headingPrefix: string;
}

function extractHeadingPrefix(templateContent: string): string {
  const firstLine = templateContent.split("\n").find((line) => line.trim() !== "") ?? "";
  const headingMatch = /^#{1,6}\s+(.*)$/.exec(firstLine.trim());
  if (!headingMatch) return "";
  const headingText = headingMatch[1];
  const angleIndex = headingText.indexOf("<");
  const beforeAngle = angleIndex === -1 ? headingText : headingText.slice(0, angleIndex);
  return beforeAngle.trim().replace(/[\s\-–]+$/, "");
}

export function fillTemplate(
  templateContent: string,
  placeholders: Record<string, string>,
): FillResult {
  const headingPrefix = extractHeadingPrefix(templateContent);
  let markdown = templateContent;
  for (const [key, value] of Object.entries(placeholders)) {
    markdown = markdown.split(`<${key}>`).join(value);
  }
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();
  return { markdown, headingPrefix };
}

export function fillTemplateFile(
  templatePath: string,
  placeholders: Record<string, string>,
): FillResult {
  const templateContent = fs.readFileSync(templatePath, "utf-8").replace(/^﻿/, "");
  return fillTemplate(templateContent, placeholders);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    requireArgs(args, ["template", "data"]);
  } catch (err) {
    console.error(`fill-template: failed (${(err as Error).message})`);
    process.exitCode = 1;
    return;
  }

  try {
    const placeholders = JSON.parse(fs.readFileSync(args.data, "utf-8")) as Record<string, string>;
    const result = fillTemplateFile(args.template, placeholders);
    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(`fill-template: failed (${err instanceof Error ? err.message : String(err)})`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
