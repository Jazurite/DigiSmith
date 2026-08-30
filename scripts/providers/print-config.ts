import { pathToFileURL } from "node:url";
import { parseArgs, requireArgs } from "../cli-args.ts";
import { resolveProvider } from "./registry.ts";
import { resolveRunner } from "../runners/registry.ts";
import type { GatewayProvider, OffloadRole } from "./types.ts";

const DEFAULT_OUTPUT_LIMIT = 65535;

export function buildOpencodeProviderBlock(
  provider: GatewayProvider,
  role: OffloadRole,
): Record<string, unknown> {
  const modelId = provider.model(role);
  return {
    [provider.name]: {
      npm: "@ai-sdk/openai-compatible",
      name: provider.displayName,
      options: {
        baseURL: provider.baseUrl,
        apiKey: `{env:${provider.credentialEnv}}`,
      },
      models: {
        [modelId]: {
          name: provider.displayName,
          limit: { context: provider.contextWindow, output: DEFAULT_OUTPUT_LIMIT },
        },
      },
    },
  };
}

function main(): void {
  const [providerName, ...rest] = process.argv.slice(2);
  if (!providerName) {
    console.error("print-config: missing required positional argument <provider-name>");
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(rest);
  try {
    requireArgs(args, ["role"]);
  } catch (err) {
    console.error(`print-config: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (args.role !== "mechanical" && args.role !== "task") {
    console.error(`print-config: --role must be "mechanical" or "task", got ${JSON.stringify(args.role)}`);
    process.exitCode = 1;
    return;
  }

  const provider = resolveProvider(providerName);
  if (!provider) {
    console.error(`print-config: no such registered provider ${JSON.stringify(providerName)}`);
    process.exitCode = 1;
    return;
  }

  const runnerName = args.runner ?? "opencode";
  const runner = resolveRunner(runnerName);
  if (!runner) {
    console.error(`print-config: no such registered runner ${JSON.stringify(runnerName)}`);
    process.exitCode = 1;
    return;
  }

  if (!provider.supportsRunner.includes(runner.name)) {
    console.error(
      `print-config: provider ${JSON.stringify(provider.name)} does not support runner ${JSON.stringify(runner.name)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(runner.buildConfig(provider, args.role)));
  process.exitCode = 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
