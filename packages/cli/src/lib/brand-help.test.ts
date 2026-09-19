import { describe, it, expect, afterEach } from "vitest";
import yargs from "yargs";
import { applyBranding } from "./brand-help.ts";

describe("applyBranding", () => {
  const originalForceColor = process.env.FORCE_COLOR;

  afterEach(() => {
    if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = originalForceColor;
  });

  it("colorizes section headers and the root banner", async () => {
    process.env.FORCE_COLOR = "1";
    const cli = applyBranding(
      yargs([]).scriptName("digismith").command("status", "check status").demandCommand(1, "")
    );
    const help = await cli.getHelp();

    expect(help).toContain("digismith");
    expect(help).toContain("personal SDLC CLI");
    expect(help).toMatch(/\x1b\[[0-9;]*mCommands:/); // ANSI-colorized "Commands:" header
  });
});
