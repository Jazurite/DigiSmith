import { pathToFileURL } from "node:url";
import { resolveRunner } from "./registry.ts";

function main(): void {
  const [runnerName, eventsFile] = process.argv.slice(2);
  if (!runnerName || !eventsFile) {
    console.error("parse-result: missing required positional arguments <runner> <events-file>");
    process.exitCode = 1;
    return;
  }

  const runner = resolveRunner(runnerName);
  if (!runner) {
    console.error(`parse-result: no such registered runner ${JSON.stringify(runnerName)}`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = runner.parseResult(eventsFile);
    console.log(JSON.stringify(result));
    process.exitCode = 0;
  } catch (err) {
    console.error(`parse-result: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
