import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import pc from "picocolors";
import { buildCli, readVersion } from "./index.ts";
import { brandOutput } from "./lib/brand-help.ts";

const ownPackageJson = new URL("../package.json", import.meta.url);
const ownVersion = (JSON.parse(fs.readFileSync(ownPackageJson, "utf-8")) as { version: string }).version;

describe("buildCli", () => {
  it("registers both domains", async () => {
    const help = await buildCli([]).getHelp();
    expect(help).toMatch(/vps/);
    expect(help).toMatch(/depot/);
  });
});

describe("buildCli end-to-end via parse()", () => {
  it("--help produces single branded output, no error", () => {
    expect.assertions(3);
    const argv = ["--help"];
    buildCli(argv).parse(argv, {}, (err, _argv, output) => {
      expect(err).toBeFalsy();
      const c = pc.createColors(true);
      expect(brandOutput(output, c)).toContain(c.bold(c.magenta("Domains:")));
      expect(output.match(/^Usage: digismith/gm)).toHaveLength(1);
    });
  });

  it("--version prints exactly the package version, no error", () => {
    expect.assertions(2);
    const argv = ["--version"];
    buildCli(argv).parse(argv, {}, (err, _argv, output) => {
      expect(err).toBeFalsy();
      expect(output.trim()).toBe(readVersion());
    });
  });

  it("an unknown subcommand fails strict validation", () => {
    expect.assertions(1);
    const argv = ["depot", "clone", "bogus"];
    buildCli(argv).parse(argv, {}, (err) => {
      expect(err).toBeTruthy();
    });
  });
});

describe("readVersion", () => {
  it("reads the version from the package's own package.json by default", () => {
    expect(readVersion()).toBe(ownVersion);
  });

  it("returns unknown when the file is missing", () => {
    expect(readVersion(path.join(os.tmpdir(), "digismith-cli-does-not-exist.json"))).toBe("unknown");
  });

  it("returns unknown when the file has no string version", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-cli-version-"));
    const file = path.join(dir, "package.json");
    fs.writeFileSync(file, JSON.stringify({ name: "x" }));
    try {
      expect(readVersion(file)).toBe("unknown");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
