import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const dir = path.join(__dirname);
const sh = fs.readFileSync(path.join(dir, "herdr-boot-castle.sh"), "utf8");
const plist = fs.readFileSync(path.join(dir, "com.jazurite.herdr-castle.plist"), "utf8");

describe("Castle daemon files", () => {
  it("the shell file is valid bash and starts only the Castle server", () => {
    expect(spawnSync("bash", ["-n", path.join(dir, "herdr-boot-castle.sh")]).status).toBe(0);
    expect(sh).toContain("--session Castle server");
    expect(sh).not.toContain("--session default");
    expect(sh).toContain("Starts ONLY the session Castle");
    expect(fs.statSync(path.join(dir, "herdr-boot-castle.sh")).mode & 0o111).not.toBe(0);
  });
  it("the plist is valid XML with the Castle label and log paths", () => {
    if (process.platform === "darwin") expect(() => execFileSync("plutil", ["-lint", path.join(dir, "com.jazurite.herdr-castle.plist")])).not.toThrow();
    else expect((plist.match(/<dict>/g) ?? []).length).toBe((plist.match(/<\/dict>/g) ?? []).length);
    expect(plist).toContain("<key>Label</key><string>com.jazurite.herdr-castle</string>");
    expect(plist).toContain("/Users/workbox/.local/bin/herdr-boot-castle.sh");
    expect(plist).toContain("/Users/workbox/.config/herdr/castle.launchd.out.log");
    expect(plist).toContain("/Users/workbox/.config/herdr/castle.launchd.err.log");
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
    expect(plist).toMatch(/<key>KeepAlive<\/key><dict><key>SuccessfulExit<\/key><false\/><\/dict>/);
    expect(plist).toContain("<key>UserName</key><string>workbox</string>");
  });
  it("the README lists the manual install lines and says Jack types the sudo lines", () => {
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    for (const l of ["cp scripts/herdr/herdr-boot-castle.sh", "chmod +x", "sudo cp", "sudo launchctl bootstrap system /Library/LaunchDaemons/com.jazurite.herdr-castle.plist"]) expect(readme).toContain(l);
    expect(readme).toMatch(/Jack types the `sudo` lines/);
  });
});
