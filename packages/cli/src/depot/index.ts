import { run as runClone } from "./clone.ts";
import { run as runOpencode } from "./opencode.ts";

export function run(argv: string[]): void {
  const [resource, ...rest] = argv;
  if (resource === "clone") {
    runClone(rest);
    return;
  }
  if (resource === "opencode") {
    runOpencode(rest);
    return;
  }
  console.error("usage: digismith depot <clone|opencode> ...");
  process.exitCode = 1;
}
