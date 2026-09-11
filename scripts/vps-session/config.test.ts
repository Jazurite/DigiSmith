import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadVpsConfig } from "./config.ts";

function writeTempConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vps-config-"));
  const filePath = path.join(dir, "vps.json");
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("loadVpsConfig", () => {
  it("returns null when the file does not exist", () => {
    const missingPath = path.join(os.tmpdir(), "digismith-vps-config-does-not-exist", "vps.json");
    expect(loadVpsConfig(missingPath)).toBeNull();
  });

  it("returns the parsed config when the file is valid", () => {
    const filePath = writeTempConfig(
      JSON.stringify({
        host: "46.225.49.140",
        user: "root",
        identity_file: "~/.ssh/jazurite",
        tmux_session: "claude-main",
      })
    );
    expect(loadVpsConfig(filePath)).toEqual({
      host: "46.225.49.140",
      user: "root",
      identity_file: "~/.ssh/jazurite",
      tmux_session: "claude-main",
    });
  });

  it("throws a clear error when the file is not valid JSON", () => {
    const filePath = writeTempConfig("not json");
    expect(() => loadVpsConfig(filePath)).toThrow("is not valid JSON");
  });

  it("throws a clear error naming the missing field(s)", () => {
    const filePath = writeTempConfig(JSON.stringify({ host: "1.2.3.4", user: "root" }));
    expect(() => loadVpsConfig(filePath)).toThrow("identity_file, tmux_session");
  });
});
