import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpTaskType } from "@digismith/clickup-client";
import { assertNameFree, assertCustomType, credentialsTeamId } from "./task-type-write.ts";

const t = (id: number, name: string, plural: string | null): ClickUpTaskType => ({
  id,
  name,
  name_plural: plural,
  description: null,
  avatar: null,
});
const types = [t(1, "milestone", null), t(1005, "Activity", "Activities")];

describe("assertNameFree", () => {
  it("passes for a name no type has", () => {
    expect(() => assertNameFree(types, ["Epic", "Epics"])).not.toThrow();
  });
  it("fails on an existing singular, plural or built-in name, case-insensitive", () => {
    expect(() => assertNameFree(types, ["activity", "x"])).toThrow(/already used by .*Activity \(1005\)/);
    expect(() => assertNameFree(types, ["x", "ACTIVITIES"])).toThrow(/already used/);
    expect(() => assertNameFree(types, ["Milestone", "x"])).toThrow(/already used/);
  });
  it("fails on the reserved plain task name", () => {
    expect(() => assertNameFree(types, ["Task", "x"])).toThrow(/already used/);
  });
  it("ignores the type being edited", () => {
    expect(() => assertNameFree(types, ["Activity", "Activities"], 1005)).not.toThrow();
  });
});

describe("assertCustomType", () => {
  it("rejects built-in ids below 1000, including 0", () => {
    expect(() => assertCustomType(t(1, "milestone", null))).toThrow(/built-in/);
    expect(() => assertCustomType(t(0, "Task", "Tasks"))).toThrow(/built-in/);
  });
  it("accepts a custom type", () => {
    expect(() => assertCustomType(t(1005, "Activity", "Activities"))).not.toThrow();
  });
});

describe("credentialsTeamId", () => {
  afterEach(() => vi.unstubAllEnvs());
  const home = (env?: string): string => {
    const dir = mkdtempSync(join(tmpdir(), "dgs333-"));
    if (env !== undefined) {
      mkdirSync(join(dir, ".digismith-depot"));
      writeFileSync(join(dir, ".digismith-depot", ".env"), env);
    }
    vi.stubEnv("HOME", dir);
    return dir;
  };

  it("returns only the team id, never the token", () => {
    home("CLICKUP_API_TOKEN=pk_secret\nCLICKUP_TEAM_ID=55\nCLICKUP_FRONTDOOR_AUTH=sess\n");
    expect(credentialsTeamId()).toBe("55");
  });

  it("a missing file gives the CredentialsError naming the path, no value", () => {
    const dir = home();
    expect(() => credentialsTeamId()).toThrow(`no credentials file found at ${join(dir, ".digismith-depot", ".env")}`);
  });

  it("an incomplete file names the path and the keys, not the values", () => {
    const dir = home("CLICKUP_API_TOKEN=pk_secret\n");
    let message = "";
    try {
      credentialsTeamId();
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain(join(dir, ".digismith-depot", ".env"));
    expect(message).not.toContain("pk_secret");
  });
});
