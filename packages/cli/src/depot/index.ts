import { run as runClone } from "./clone.ts";
import { run as runOpencode } from "./opencode.ts";
import { run as runBridge } from "./bridge.ts";

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
  if (resource === "bridge") {
    runBridge(rest);
    return;
  }
  console.error("usage: digismith depot <clone|opencode|bridge> ...");
  process.exitCode = 1;
}
