import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const hooks = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "..", "hooks", "hooks.json"), "utf8")).hooks;
const commands = (event: string): string[] =>
  (hooks[event] ?? []).flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));

describe("hooks/hooks.json", () => {
  it("SessionStart runs the card writer FIRST, then session-init", () => {
    const c = commands("SessionStart");
    expect(c[0]).toContain("session-cards/hook-cli.ts\" start");
    expect(c.some((x) => x.includes("session-init.ts"))).toBe(true);
  });
  it("has exactly ONE UserPromptSubmit command (separate entries run in parallel and would race)", () => {
    const c = commands("UserPromptSubmit");
    expect(c).toHaveLength(1);
    expect(c[0]).toContain("session-cards/hook-cli.ts\" prompt");
  });
  it("SessionEnd closes the card", () => {
    expect(commands("SessionEnd")).toEqual([expect.stringContaining("session-cards/hook-cli.ts\" end")]);
  });
  it("every command resolves under CLAUDE_PLUGIN_ROOT", () => {
    for (const e of ["SessionStart", "UserPromptSubmit", "SessionEnd"]) {
      for (const c of commands(e)) expect(c).toContain("${CLAUDE_PLUGIN_ROOT}/scripts/");
    }
  });
});
