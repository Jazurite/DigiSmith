// Contract between the two sides of DGS-785: `dg guide` writes <depot>/guides/index.json,
// the session-start hook reads it. Real refreshGuides, real file, no ClickUp, temp depot only.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { refreshGuides, type RefreshClient } from "../../packages/cli/src/guide/refresh.ts";
import { buildGuideIndex } from "./index-text.ts";

const NOW = 1_800_000_000_000;
const fixtureDir = path.join(import.meta.dirname, "../../packages/cli/src/guide/fixtures");
const CLOSE = fs.readFileSync(path.join(fixtureDir, "close-a-ticket.md"), "utf8");
const EPIC = fs.readFileSync(path.join(fixtureDir, "start-an-epic.md"), "utf8");
const ADOPTED = "Adopted by Jack on 2026-11-14.";

const tasks = [
  { id: "id-758", custom_id: "DGS-758", name: "Guide: close a ticket", text_content: ADOPTED, date_updated: "100" },
  { id: "id-759", custom_id: "DGS-759", name: "Guide: start an epic", text_content: ADOPTED, date_updated: "100" },
];
const pages: Record<string, string> = { "DGS-758": CLOSE, "DGS-759": EPIC };
const client = {
  getListTasks: async () => tasks,
  getTaskByRef: async (ref: string) => ({ ...tasks.find((t) => t.custom_id === ref)!, markdown_description: pages[ref] }),
} as unknown as RefreshClient;

// A guide line is `- slug: when` (spec D5); the separator after the slug stops a longer slug matching.
const bullet = (slug: string): string => `- ${slug}: `;
const lineFor = (lines: string[], slug: string): string | undefined => lines.find((l) => l.startsWith(bullet(slug)));

let depot: string;
beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "guide-contract-"));
});
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("index.json contract: dg guide writes, the hook reads", () => {
  it("the block carries the header, both slugs with their real When-to-use text, no body, under 3000 bytes", async () => {
    const env = { DIGISMITH_DEPOT_DIR: depot };
    await refreshGuides(client, { env, now: NOW, listId: "L1" });
    const json = fs.readFileSync(path.join(depot, "guides", "index.json"), "utf8");
    const block = buildGuideIndex(json, NOW);
    const lines = block.split("\n");

    expect(lines[0]).toMatch(/^User manual \(DigiSmith\): .*dg guide <slug>\.$/);
    const close = lineFor(lines, "close-a-ticket")!;
    const epic = lineFor(lines, "start-an-epic")!;
    expect(close).toContain("A build ticket is merged and pushed");
    expect(epic).toContain("Jack has an idea for an epic");
    expect(block).not.toContain("## What it is");
    expect(block).not.toContain("Closing a ticket moves it");
    expect(block).not.toContain("not cached yet");
    expect(Buffer.byteLength(block)).toBeLessThanOrEqual(3000);
  });

  it("the line matcher takes the exact slug, not a longer one", () => {
    expect(lineFor(["- close-a-ticket-x: other"], "close-a-ticket")).toBeUndefined();
    expect(lineFor(["- close-a-ticket-x: other", "- close-a-ticket: real"], "close-a-ticket")).toBe("- close-a-ticket: real");
  });
});
