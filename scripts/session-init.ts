import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DOCS_DIR_PATH, listNotes, resolveMainRoot } from "./lineage-handoff.ts";
import { MAESTROS_DIR_NAME, SHARED_NOTES, noteLocation, SESSIONS_DIR_PATH, listDepotNoteNames, listUnmovedNoteNames, projectName, sessionsRoot } from "./session-path.ts";
import { DEFAULT_DIR, resolve } from "./config.ts";
import { ConfigError } from "./config-parse.ts";

export const VOICE_INIT_FILENAME = "voice-init.ts";

export function readProfile(dir: string): string | undefined {
  const value = resolve("profile", dir)?.value;
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function isDigismithRepoRoot(pluginJsonPath: string): boolean {
  if (!isFile(pluginJsonPath)) return false;
  try {
    const config = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
    return config?.name === "digismith";
  } catch {
    return false;
  }
}

export function buildLineagePointer(mainRoot: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const keys = listNotes(mainRoot);
  const project = projectName(mainRoot);
  const depotNames = listDepotNoteNames(project, env);
  const unmovedNames = listUnmovedNoteNames(mainRoot, env);
  if (keys.length === 0 && depotNames.length === 0 && unmovedNames.length === 0) return undefined;

  const clauses: string[] = [];
  if (keys.length > 0) {
    const docsDir = path.join(mainRoot, ...DOCS_DIR_PATH.split("/"));
    clauses.push(`lineage handoff notes in ${docsDir}: ${keys.join(", ")}`);
  }
  const sharedNames = depotNames.filter((name) => Object.hasOwn(SHARED_NOTES, name));
  const maestroNames = depotNames.filter((name) => !sharedNames.includes(name));
  if (maestroNames.length > 0) {
    clauses.push(`session notes in ${path.join(sessionsRoot(project, env), MAESTROS_DIR_NAME)}: ${maestroNames.join(", ")}`);
  }
  for (const name of sharedNames) clauses.push(`the shared ${name} note is ${noteLocation(project, name, env)}`);
  if (unmovedNames.length > 0) {
    const oldDir = path.join(mainRoot, ...SESSIONS_DIR_PATH.split("/"));
    clauses.push(`session notes not yet moved to the depot, in ${oldDir}: ${unmovedNames.join(", ")}`);
  }
  return `DigiSmith: ${clauses.join("; ")} — read the one matching your session title (get_session self), or say "resume"`;
}

type VoiceInitModule = { default: () => Promise<string | null> };

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export async function loadVoiceSummary(voiceInitPath: string): Promise<string | null> {
  if (!isFile(voiceInitPath)) return null;
  const mod = (await import(pathToFileURL(voiceInitPath).href)) as VoiceInitModule;
  return mod.default();
}

export function formatBanner(profile: string, voiceSummary: string | null): string {
  const parts = [`profile=${profile}`];
  if (voiceSummary) parts.push(`voices=${voiceSummary}`);
  return `DigiSmith: ${parts.join(", ")}`;
}

export async function buildBanner(dir: string, voiceInitPath: string): Promise<string | null> {
  const profile = readProfile(dir);
  if (profile === undefined) return null;
  const voiceSummary = await loadVoiceSummary(voiceInitPath);
  return formatBanner(profile, voiceSummary);
}

export async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  if (isDigismithRepoRoot(path.join(process.cwd(), ".claude-plugin", "plugin.json"))) {
    console.log("DigiSmith: no AI attribution in commits or PRs — no exceptions");
  }
  try {
    const lineagePointer = buildLineagePointer(resolveMainRoot(process.cwd()));
    if (lineagePointer) console.log(lineagePointer);
  } catch (err) {
    console.error(`session-init: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
  try {
    const banner = await buildBanner(DEFAULT_DIR, path.join(scriptDir, VOICE_INIT_FILENAME));
    if (banner) console.log(banner);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.log(`DigiSmith: warning: ${err.message}`);
    } else {
      console.error(`session-init: failed (${(err as Error).message})`);
      process.exitCode = 1;
    }
  }
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
