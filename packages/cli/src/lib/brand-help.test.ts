import { describe, it, expect } from "vitest";
import { brandHelp } from "./brand-help.ts";

const ROOT_HELP = [
  "Usage: dg <command>",
  "",
  "Commands:",
  "  dg vps      reconnect to the Hetzner VPS's persistent claude session",
  "  dg depot    manage machine-wide shared resources (clone, opencode, bridge)",
  "",
  "Options:",
  "  --help     Show help",
  "  --version  Show version number",
].join("\n");

const NESTED_HELP = [
  "Usage: dg depot <command>",
  "",
  "Commands:",
  "  dg depot clone      manage the shared packages/ clone",
  "  dg depot opencode   manage the shared OpenCode server",
  "  dg depot bridge     manage the shared Agentic Bridge proxy",
].join("\n");

describe("brandHelp", () => {
  it("prepends the wordmark banner and relabels Commands as Domains at root", () => {
    const out = brandHelp(ROOT_HELP, { root: true });
    expect(out).toContain("digismith");
    expect(out).toContain("personal SDLC CLI");
    expect(out).toContain("Domains:");
    expect(out).not.toMatch(/^Commands:$/m);
  });

  it("omits the banner and keeps the literal Commands header for nested help", () => {
    const out = brandHelp(NESTED_HELP, { root: false });
    expect(out).not.toContain("personal SDLC CLI");
    expect(out).toContain("Commands:");
  });

  it("defaults to non-root when no options are given", () => {
    const out = brandHelp(NESTED_HELP);
    expect(out).not.toContain("personal SDLC CLI");
    expect(out).toContain("Commands:");
  });

  it("applies ANSI color codes to Commands header in nested help when colors are forced", () => {
    const oldForceColor = process.env.FORCE_COLOR;
    try {
      process.env.FORCE_COLOR = "1";
      const out = brandHelp(NESTED_HELP, { root: false });
      // Check for ANSI escape sequence (all colors start with [)
      expect(out).toMatch(/\[[0-9;]*m/);
      expect(out).toContain("Commands:");
    } finally {
      process.env.FORCE_COLOR = oldForceColor;
    }
  });
});
