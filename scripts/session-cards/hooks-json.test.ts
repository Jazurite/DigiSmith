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
    const c = commands("SessionEnd").filter((x) => x.includes("session-cards/hook-cli.ts"));
    expect(c).toHaveLength(1);
    expect(c[0]).toContain("session-cards/hook-cli.ts\" end");
  });
  it("DGS-785: every event keeps its hook-command count and no command mentions guide", () => {
    const expected: Record<string, number> = { SessionStart: 4, UserPromptSubmit: 1, Notification: 1, PostToolUse: 1, Stop: 1, SessionEnd: 2 };
    const actual = Object.fromEntries(Object.keys(hooks).map((e) => [e, commands(e).length]));
    expect(actual).toEqual(expected);
    for (const e of Object.keys(hooks)) expect(commands(e).some((x) => /guide/i.test(x))).toBe(false);
  });
  it("every command resolves under CLAUDE_PLUGIN_ROOT", () => {
    for (const e of ["SessionStart", "UserPromptSubmit", "SessionEnd"]) {
      for (const c of commands(e)) expect(c).toContain("${CLAUDE_PLUGIN_ROOT}/scripts/");
    }
  });
});
