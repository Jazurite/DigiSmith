import { describe, expect, it } from "vitest";
import { chutes } from "./chutes.ts";
import { tokenreply } from "./tokenreply.ts";
import { resolveProvider } from "./registry.ts";
import type { GatewayProvider } from "./types.ts";

function assertConforms(provider: GatewayProvider) {
  expect(typeof provider.name).toBe("string");
  expect(provider.name.length).toBeGreaterThan(0);
  expect(typeof provider.displayName).toBe("string");
  expect(provider.baseUrl.startsWith("https://")).toBe(true);
  expect(typeof provider.credentialEnv).toBe("string");
  expect(provider.contextWindow).toBeGreaterThan(0);
  expect(typeof provider.model("mechanical")).toBe("string");
  expect(provider.model("mechanical").length).toBeGreaterThan(0);
  expect(typeof provider.model("task")).toBe("string");
  expect(provider.model("task").length).toBeGreaterThan(0);
  expect(Array.isArray(provider.supportsRunner)).toBe(true);
  expect(provider.supportsRunner.length).toBeGreaterThan(0);
}

describe("chutes", () => {
  it("conforms to GatewayProvider", () => assertConforms(chutes));

  it("uses distinct models for mechanical vs. task roles", () => {
    expect(chutes.model("mechanical")).toBe("google/gemma-4-31B-turbo-TEE");
    expect(chutes.model("task")).toBe("moonshotai/Kimi-K3-TEE");
  });

  it("supports only opencode", () => {
    expect(chutes.supportsRunner).toEqual(["opencode"]);
  });
});

describe("tokenreply", () => {
  it("conforms to GatewayProvider", () => assertConforms(tokenreply));

  it("uses the confirmed base URL", () => {
    expect(tokenreply.baseUrl).toBe("https://api.tokenreply.com/v1");
  });

  it("supports both runners", () => {
    expect(tokenreply.supportsRunner).toEqual(["opencode", "claude-code"]);
  });
});

describe("resolveProvider", () => {
  it("resolves a known provider by name", () => {
    expect(resolveProvider("chutes")).toBe(chutes);
    expect(resolveProvider("tokenreply")).toBe(tokenreply);
  });

  it("returns undefined for an unknown provider", () => {
    expect(resolveProvider("openai")).toBeUndefined();
    expect(resolveProvider("")).toBeUndefined();
  });
});
