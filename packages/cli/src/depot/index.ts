import { run as runClone } from "./clone.ts";

export function run(argv: string[]): void {
  const [resource, ...rest] = argv;
  if (resource === "clone") {
    runClone(rest);
    return;
  }
  console.error("usage: digismith depot <clone> ...");
  process.exitCode = 1;
}
