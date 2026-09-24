import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_PROFILE_PATH = ".digismith/profile";
export const VOICE_INIT_FILENAME = "voice-init.ts";

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
