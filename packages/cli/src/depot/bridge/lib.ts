import * as os from "node:os";
import * as path from "node:path";

export { findDigismithRepoMarker, resolveDigismithRepo } from "../../shared/digismith-repo.ts";

export const DEFAULT_TRACKING_FILE = path.join(os.homedir(), ".digismith-depot", "agentic-bridge.json");
export const DEFAULT_LOG_FILE = path.join(os.homedir(), ".digismith-depot", "agentic-bridge.log");
