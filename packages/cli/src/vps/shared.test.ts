import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfigOrExit } from "./shared.ts";

describe("loadConfigOrExit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits 1 and reports when no vps.json exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vps-shared-missing-"));
    const missingPath = path.join(dir, "vps.json");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() => loadConfigOrExit(missingPath)).toThrow("exit:1");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("no VPS configured"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns the parsed config when vps.json is valid", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vps-shared-"));
    const configPath = path.join(dir, "vps.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ host: "h", user: "u", identity_file: "i", tmux_session: "t" })
    );
    try {
      const config = loadConfigOrExit(configPath);
      expect(config).toEqual({ host: "h", user: "u", identity_file: "i", tmux_session: "t" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
