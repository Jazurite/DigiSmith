import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { findViolations, importsOf, keyOf, zoneOf } from "./boundaries.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Ratchet: today's Scripture -> Oculus imports. Each later move deletes the entries it fixes.
// The test fails when a new violation appears AND when a listed one is gone (delete it).
const KNOWN: string[] = [
  "packages/cli/src/index.ts -> ./autonomous/index.ts",
  "packages/cli/src/index.ts -> ./autonomous/director/command.ts",
  "packages/cli/src/index.ts -> ./salvage/index.ts",
  "packages/cli/src/index.ts -> ./oculus/index.ts",
  "packages/cli/src/index.ts -> ./conductor/index.ts",
  "packages/cli/src/run/index.ts -> ./limit-check.ts",
  "packages/cli/src/run/index.ts -> ./limit.ts",
  "scripts/conductor/idle-check.ts -> ./state.ts",
];

describe("zoneOf", () => {
  it("maps paths to zones", () => {
    expect(zoneOf("packages/cli/src/tokens/count.ts")).toBe("scripture");
    expect(zoneOf("packages/cli/src/salvage/index.ts")).toBe("oculus");
    expect(zoneOf("packages/cli/src/run/limit-check.ts")).toBe("oculus");
    expect(zoneOf("packages/cli/src/conductor-registry/registry.ts")).toBe("scripture");
    expect(zoneOf("scripts/conductor/idle-check.ts")).toBe("scripture");
    expect(zoneOf("scripts/conductor/flux.ts")).toBe("oculus");
    expect(zoneOf("scripts/nexus-api/src/app.ts")).toBe("app");
    expect(zoneOf("aspects/oculus/nexus/api/src/app.ts")).toBe("app");
    expect(zoneOf("packages/clickup-client/src/index.ts")).toBe("lib");
    expect(zoneOf("libs/jira-client/src/cli.ts")).toBe("lib");
    expect(zoneOf("aspects/oculus/src/autonomous/state.ts")).toBe("oculus");
    expect(zoneOf("aspects/scripture/src/tokens/count.ts")).toBe("scripture");
    expect(zoneOf("docs/readme.ts")).toBe("other");
  });
});

describe("importsOf", () => {
  it("reads static, dynamic and side-effect imports", () => {
    expect(importsOf(`import a from "./a.ts"; const b = await import("./b.ts"); import "./c.ts";`)).toEqual(["./a.ts", "./b.ts", "./c.ts"]);
  });
});

describe("findViolations on a fixture tree", () => {
  let dir: string;
  const put = (rel: string, text: string): void => {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "boundaries-"));
    put("packages/cli/src/tokens/count.ts", `import { x } from "./other.ts";`);
    put("packages/cli/src/tokens/other.ts", `export const x = 1;`);
    put("packages/cli/src/tokens/bad.ts", `import { y } from "../salvage/index.ts";`);
    put("packages/cli/src/salvage/index.ts", `export const y = 2;`);
    put("packages/cli/src/tokens/bad.test.ts", `import { y } from "../salvage/index.ts";`);
    put("packages/cli/src/tokens/pkg.ts", `import "@digismith/oculus";`);
    put("aspects/oculus/nexus/api/src/app.ts", `import "@digismith/scripture";`);
    put("aspects/oculus/src/salvage/ok.ts", `import "@digismith/scripture/run"; import "@digismith/clickup-client";`);
    put("aspects/oculus/src/salvage/deep.ts", `import "@digismith/scripture/secret";`);
    put("node_modules/skip/index.ts", `import "@digismith/oculus";`);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("flags each breach and nothing else", () => {
    expect(findViolations(dir).map(keyOf).sort()).toEqual([
      "aspects/oculus/nexus/api/src/app.ts -> @digismith/scripture",
      "aspects/oculus/src/salvage/deep.ts -> @digismith/scripture/secret",
      "packages/cli/src/tokens/bad.ts -> ../salvage/index.ts",
      "packages/cli/src/tokens/pkg.ts -> @digismith/oculus",
    ]);
  });
});

describe("boundary", () => {
  it("has no import beyond the known list", { timeout: 30_000 }, () => {
    const keys = findViolations(ROOT).map(keyOf).sort();
    expect(keys).toEqual([...KNOWN].sort());
  });
});
