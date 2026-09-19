import type { Argv } from "yargs";
import pc from "picocolors";

const HEADER_PATTERN = /^(Commands|Options|Positionals|Domains):$/gm;

export interface BrandHelpOptions {
  root?: boolean;
}

export function brandHelp(rawHelp: string, options: BrandHelpOptions = {}): string {
  const relabeled = options.root ? rawHelp.replace(/^Commands:$/m, "Domains:") : rawHelp;
  const colored = relabeled.replace(HEADER_PATTERN, (label) => pc.bold(pc.magenta(label)));
  const banner = options.root
    ? `${pc.bold(pc.magenta("digismith"))}${pc.dim(" — personal SDLC CLI")}\n\n`
    : "";
  return `${banner}${colored}`;
}

export function attachHelp(y: Argv, options: BrandHelpOptions = {}): Argv {
  return y.showHelp((text: string) => console.log(brandHelp(text, options)));
}
