import * as fs from "node:fs";
import * as path from "node:path";
import { AXES, resolveAllVoices } from "./voice.ts";
import { DEFAULT_DIR } from "./preferences.ts";

export default async function voiceInit(): Promise<string | null> {
  const state = resolveAllVoices(DEFAULT_DIR);
  const on = AXES.filter((axis) => state[axis] === "on");
  return on.length > 0 ? on.join("+") : null;
}

/** The "### N. title" headings under "## Rules" of the conversation standard; [] when the file is unreadable. */
export function readRuleTitles(standardPath: string): string[] {
  let text: string;
  try {
    text = fs.readFileSync(standardPath, "utf8");
  } catch {
    return [];
  }
  const afterRules = text.split(/^## Rules$/m)[1] ?? "";
  const rulesBody = afterRules.split(/^## /m)[0];
  return [...rulesBody.matchAll(/^### (\d+\. .+)$/gm)].map((match) => match[1].trim());
}

/** One line for the session start: the rule titles of the conversation voice, or null when it is off or unreadable. */
export async function conversationDigest(standardPath: string, dir: string = DEFAULT_DIR): Promise<string | null> {
  if (resolveAllVoices(dir).conversation !== "on") return null;
  const titles = readRuleTitles(standardPath);
  if (titles.length === 0) return null;
  return `DigiSmith conversation voice, every reply this session (rules and examples: ${path.resolve(standardPath)}): ${titles.join("; ")}`;
}
