import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_PROFILE_PATH = ".digismith/profile";
export const VOICE_INIT_FILENAME = "voice-init.ts";
export const SESSIONS_DIR_PATH = ".digismith/sessions";

export function readProfile(filePath: string): string | undefined {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const content = new TextDecoder("utf-8", { fatal: true }).decode(raw).trim();
  return content || undefined;
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

export function listHandoffFiles(sessionsDir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(sessionsDir, entry.name));
}

export function findNewestHandoff(sessionsDir: string): string | undefined {
  const files = listHandoffFiles(sessionsDir);
  if (files.length === 0) return undefined;
  return files.reduce((newest, current) =>
    fs.statSync(current).mtimeMs > fs.statSync(newest).mtimeMs ? current : newest,
  );
}

export function readHandoffTitle(filePath: string): string | undefined {
  if (!isFile(filePath)) return undefined;
  const firstLine = fs.readFileSync(filePath, "utf8").split("\n")[0]?.trim();
  if (!firstLine) return undefined;
  return firstLine.replace(/^#+\s*/, "");
}

export function buildHandoffPointer(sessionsDir: string): string | undefined {
  const files = listHandoffFiles(sessionsDir);
  if (files.length === 0) return undefined;
  const newest = findNewestHandoff(sessionsDir)!;
  const title = readHandoffTitle(newest) ?? "(untitled)";
  const countSuffix = files.length > 1 ? ` (${files.length} pending)` : "";
  return `DigiSmith: handoff from prior session — "${title}"${countSuffix} — see ${SESSIONS_DIR_PATH}/`;
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

export async function buildBanner(profilePath: string, voiceInitPath: string): Promise<string | null> {
  const profile = readProfile(profilePath);
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
    const handoffPointer = buildHandoffPointer(path.join(process.cwd(), SESSIONS_DIR_PATH));
    if (handoffPointer) console.log(handoffPointer);
  } catch (err) {
    console.error(`session-init: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
  try {
    const banner = await buildBanner(
      path.join(process.cwd(), DEFAULT_PROFILE_PATH),
      path.join(scriptDir, VOICE_INIT_FILENAME),
    );
    if (banner) console.log(banner);
  } catch (err) {
    console.error(`session-init: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
