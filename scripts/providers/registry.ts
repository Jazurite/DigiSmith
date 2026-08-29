import type { GatewayProvider } from "./types.ts";
import { chutes } from "./chutes.ts";
import { tokenreply } from "./tokenreply.ts";

const providers: Record<string, GatewayProvider> = { chutes, tokenreply };

export function resolveProvider(name: string): GatewayProvider | undefined {
  return providers[name];
}
