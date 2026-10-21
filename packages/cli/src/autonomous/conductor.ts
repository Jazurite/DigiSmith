import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";

export type Exec = (file: string, args: string[]) => Promise<{ code: number; stderr: string }>;

const CONDUCTOR_KEY = "DigiSmith/digismith-conductor";

export const realExec: Exec = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, (err, _stdout, stderr) => {
      if (!err) return resolve({ code: 0, stderr: String(stderr) });
      const code = typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1;
      resolve({ code, stderr: String(stderr) || err.message });
    });
  });

export async function promptConductor(exec: Exec, conductorsJson: string, message: string): Promise<void> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(conductorsJson, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`cannot read ${conductorsJson}: ${(e as Error).message}`);
  }
  if (!data || typeof data !== "object" || !Object.prototype.hasOwnProperty.call(data, CONDUCTOR_KEY)) {
    throw new Error(`no ${CONDUCTOR_KEY} entry in ${conductorsJson}`);
  }
  const name = CONDUCTOR_KEY.split("/")[1];
  const herdr = join(homedir(), ".digismith-depot", "bin", "herdr-ws");
  const r = await exec(herdr, ["agent", "prompt", name, message]);
  if (r.code !== 0) throw new Error(`herdr-ws agent prompt failed (exit ${r.code}): ${r.stderr}`);
}
