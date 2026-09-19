import pc from "picocolors";

// picocolors' default export uses `export =`, and doesn't re-export its
// `Colors` interface from the package's main entry point — deriving the
// type from the public `createColors` signature avoids importing an
// unexported type name (`import type { Colors } from "picocolors"` fails to
// compile with TS2305).
type Colors = ReturnType<typeof pc.createColors>;

const HEADER_PATTERN = /^(Commands|Options|Positionals|Domains):$/gm;
const ROOT_MARKER = "personal SDLC CLI";
const ROOT_WORDMARK = "digismith — personal SDLC CLI";

export const ROOT_USAGE = `${ROOT_WORDMARK}\n\nUsage: digismith <command> [options]`;

export function brandOutput(rawOutput: string, colors: Colors = pc): string {
  const isRoot = rawOutput.includes(ROOT_MARKER);
  let text = isRoot ? rawOutput.replace(/^Commands:$/m, "Domains:") : rawOutput;
  text = text.replace(HEADER_PATTERN, (label) => colors.bold(colors.magenta(label)));
  if (isRoot) {
    text = text.replace(
      ROOT_WORDMARK,
      `${colors.bold(colors.magenta("digismith"))}${colors.dim(" — personal SDLC CLI")}`
    );
  }
  return text;
}
