import { loadVpsConfig, DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
import { runStatusChecks, formatStatusReport, isFullyHealthy } from "./status.ts";
import { runConnect } from "./connect.ts";

export function run(argv: string[]): void {
  const subcommand = argv[0];
  if (subcommand !== "status" && subcommand !== "connect") {
    console.error("usage: digismith vps <status|connect>");
    process.exitCode = 1;
    return;
  }

  let config: VpsConfig | null;
  try {
    config = loadVpsConfig();
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  if (config === null) {
    console.error(`vps-session: no VPS configured — create ${DEFAULT_VPS_CONFIG_PATH}`);
    process.exitCode = 1;
    return;
  }

  if (subcommand === "status") {
    const report = runStatusChecks(config, DEFAULT_VPS_CONFIG_PATH);
    console.log(formatStatusReport(report));
    process.exitCode = isFullyHealthy(report) ? 0 : 1;
    return;
  }

  runConnect(config, DEFAULT_VPS_CONFIG_PATH);
}
