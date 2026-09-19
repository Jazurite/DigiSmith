import { loadVpsConfig, DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";

export function loadConfigOrExit(configPath: string = DEFAULT_VPS_CONFIG_PATH): VpsConfig {
  let config: VpsConfig | null;
  try {
    config = loadVpsConfig(configPath);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  if (config === null) {
    console.error(`vps-session: no VPS configured — create ${configPath}`);
    process.exit(1);
  }
  return config;
}
