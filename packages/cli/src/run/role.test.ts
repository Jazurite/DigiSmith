import { describe, it, expect } from "vitest";
import { roleOf, ticketOfAgentName } from "./role.ts";

const herdr = (agentName: string | null) => roleOf({ inHerdr: true, looked: true, agentName, maestroIdentity: false });

describe("roleOf", () => {
  it("outside herdr: maestro with one identity card, else other", () => {
    expect(roleOf({ inHerdr: false, looked: false, agentName: null, maestroIdentity: true })).toEqual({ role: "maestro", role_from: "identity" });
    expect(roleOf({ inHerdr: false, looked: false, agentName: null, maestroIdentity: false })).toEqual({ role: "other", role_from: "none" });
  });
  it("inside herdr before the labeller: other, pending", () => {
    expect(roleOf({ inHerdr: true, looked: false, agentName: null, maestroIdentity: true })).toEqual({ role: "other", role_from: "pending" });
  });
  it("applies the agent name table, first match wins", () => {
    expect(herdr("digismith-conductor")).toEqual({ role: "conductor", role_from: "herdr" });
    expect(herdr("main-conductor")).toEqual({ role: "conductor", role_from: "herdr" });
    expect(herdr("dgs-598-rev1")).toEqual({ role: "reviewer", role_from: "herdr" });
    expect(herdr("dgs-598-review")).toEqual({ role: "reviewer", role_from: "herdr" });
    expect(herdr("usage-scout")).toEqual({ role: "scout", role_from: "herdr" });
    expect(herdr("dgs-401-probe")).toEqual({ role: "scout", role_from: "herdr" });
    expect(herdr("dgs-598")).toEqual({ role: "builder", role_from: "herdr" });
    expect(herdr("emkt-9001")).toEqual({ role: "builder", role_from: "herdr" });
    expect(herdr("b2b-1")).toEqual({ role: "builder", role_from: "herdr" });
    expect(herdr("notes")).toEqual({ role: "other", role_from: "herdr" });
  });
  it("gives other, none when the pane has no agent entry", () => {
    expect(herdr(null)).toEqual({ role: "other", role_from: "none" });
  });
});

describe("ticketOfAgentName", () => {
  it("upper-cases a key-shaped name only", () => {
    expect(ticketOfAgentName("dgs-598")).toBe("DGS-598");
    expect(ticketOfAgentName("b2b-1")).toBe("B2B-1");
    expect(ticketOfAgentName("DGS-598")).toBeNull();
    expect(ticketOfAgentName("dgs-598-rev1")).toBeNull();
    expect(ticketOfAgentName("digismith-conductor")).toBeNull();
    expect(ticketOfAgentName(null)).toBeNull();
  });
});
