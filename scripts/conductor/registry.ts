// The registry lives in the cli package (DGS-683); this shim keeps the scripts/ imports working.
export * from "../../packages/cli/src/conductor-registry/registry.ts";
