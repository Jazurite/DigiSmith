import { describe, it, expect } from "vitest";
import pc from "picocolors";
import { brandOutput, ROOT_USAGE } from "./brand-help.ts";

const colors = pc.createColors(true);

const ROOT_HELP = `${ROOT_USAGE}\n\nCommands:\n  digismith vps    ...\n  digismith depot  ...\n\nOptions:\n  --help\n  --version\n`;
const NESTED_HELP = `digismith depot clone\n\nmanage the shared packages/ clone\n\nCommands:\n  digismith depot clone ensure   ...\n  digismith depot clone refresh  ...\n`;

describe("brandOutput", () => {
  it("colorizes the wordmark and relabels Commands as Domains at root", () => {
    const out = brandOutput(ROOT_HELP, colors);
    expect(out).toContain(`${colors.bold(colors.magenta("digismith"))}${colors.dim(" — personal SDLC CLI")}`);
    expect(out).toContain(`${colors.bold(colors.magenta("Domains:"))}`);
    expect(out).not.toMatch(/^Commands:$/m);
  });

  it("colorizes headers but keeps the literal Commands label and no banner for nested output", () => {
    const out = brandOutput(NESTED_HELP, colors);
    expect(out).not.toContain("personal SDLC CLI");
    expect(out).toContain(`${colors.bold(colors.magenta("Commands:"))}`);
  });
});
