import type { Argv } from "yargs";
import pc from "picocolors";

export function applyBranding(y: Argv): Argv {
  const header = (label: string) => pc.bold(pc.magenta(label));
  return y
    .updateLocale({
      "Commands:": header("Commands:"),
      "Options:": header("Options:"),
      "Positionals:": header("Positionals:"),
    })
    .usage(`${pc.bold(pc.magenta("digismith"))}${pc.dim(" — personal SDLC CLI")}\n\nUsage: $0 <command> [options]`);
}
