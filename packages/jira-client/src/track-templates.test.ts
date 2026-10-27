import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Node = { type: string; attrs?: Record<string, unknown>; text?: string; content?: Node[] };

const dir = fileURLToPath(new URL("../../../skills/jira-progress-write-back/templates/", import.meta.url));
const load = (name: string): Node[] => JSON.parse(readFileSync(dir + name, "utf8"));
const walk = (nodes: Node[], visit: (n: Node) => void): void => {
  for (const n of nodes) {
    visit(n);
    if (n.content) walk(n.content, visit);
  }
};
const textOf = (n: Node): string => (n.text ?? "") + (n.content ?? []).map(textOf).join("");

const STAGES = [
  "Technical Development",
  "Storybook Conversion",
  "Design Review",
  "QA",
  "Engineering Code Review",
  "Translations",
  "Documentation",
  "Rollout",
];

describe.each(["track-single-market.json", "track-multi-market.json"])("%s", (file) => {
  const nodes = load(file);
  const expand = nodes[1];
  const body = expand.content ?? [];

  it("opens with the level-2 Track heading and one expand node with an empty title", () => {
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(textOf(nodes[0])).toBe("📦 Track");
    expect(expand.type).toBe("expand");
    expect(expand.attrs).toEqual({ title: "" });
  });

  it("starts the expand with the level-3 Deliverable heading", () => {
    expect(body[0]).toMatchObject({ type: "heading", attrs: { level: 3 } });
    expect(textOf(body[0])).toBe("📋 Deliverable:");
  });

  it("has one bold-labeled paragraph per stage, in order, each a TO DO status", () => {
    const labels = body
      .filter((n) => n.type === "paragraph" && n.content?.[0]?.type === "text")
      .map((n) => n.content![0].text!.replace(/ –$/, ""))
      .filter((l) => STAGES.includes(l));
    expect(labels).toEqual(STAGES);
    for (const n of body) {
      if (n.type === "paragraph" && STAGES.includes((n.content?.[0]?.text ?? "").replace(/ –$/, ""))) {
        expect(n.content![2].attrs).toEqual({ text: "TO DO", color: "neutral" });
      }
    }
  });

  it("carries the sub-lines under Storybook Conversion and Design Review", () => {
    const lines = body.map(textOf);
    expect(lines).toContain(" 1x component: <component name>");
    expect(lines).toContain(" Round 1");
    expect(lines).toContain(" Obtain design approval");
  });

  it("ends with a rule and a Legend paragraph holding the three lozenges", () => {
    expect(body[body.length - 2].type).toBe("rule");
    const legend = body[body.length - 1];
    expect(legend.content?.[0].text).toBe("Legend:");
    const statuses = (legend.content ?? []).filter((n) => n.type === "status").map((n) => n.attrs);
    expect(statuses).toEqual([
      { text: "TO DO", color: "neutral" },
      { text: "IN PROGRESS", color: "blue" },
      { text: "DONE", color: "green" },
    ]);
  });

  it("uses only the standard check_mark emoji and never a custom one", () => {
    const names: string[] = [];
    walk(nodes, (n) => {
      if (n.type === "emoji") names.push(String(n.attrs?.shortName));
    });
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(new Set([":check_mark:"]));
    expect(JSON.stringify(nodes)).not.toContain("In_Progress");
  });

  it("uses only the three status colors", () => {
    const colors = new Set<string>();
    walk(nodes, (n) => {
      if (n.type === "status") colors.add(String(n.attrs?.color));
    });
    expect([...colors].sort()).toEqual(["blue", "green", "neutral"]);
  });
});

describe("per-market table", () => {
  const find = (nodes: Node[], type: string): Node | undefined => {
    let hit: Node | undefined;
    walk(nodes, (n) => {
      if (!hit && n.type === type) hit = n;
    });
    return hit;
  };

  it("is absent from the single-market template", () => {
    expect(find(load("track-single-market.json"), "table")).toBeUndefined();
    expect(JSON.stringify(load("track-single-market.json"))).not.toContain("Per Market");
  });

  it("sits in the multi-market expand under a Per Market heading, with the six columns and a market row", () => {
    const body = load("track-multi-market.json")[1].content!;
    const headingIdx = body.findIndex((n) => n.type === "heading" && textOf(n) === "🌍 Per Market:");
    expect(headingIdx).toBeGreaterThan(0);
    expect(body[headingIdx + 1].type).toBe("table");
    const rows = body[headingIdx + 1].content!;
    expect(rows[0].content!.map(textOf)).toEqual(["Market", "Dev", "Review", "QA", "Country", "Deployment"]);
    expect(rows[0].content!.every((c) => c.type === "tableHeader")).toBe(true);
    expect(rows[1].content).toHaveLength(6);
    expect(textOf(rows[1].content![0])).toBe("<MARKET>");
  });

  it("keeps the stage list identical to the single-market template", () => {
    const strip = (nodes: Node[]) => nodes[1].content!.filter((n) => n.type !== "table" && !(n.type === "heading" && textOf(n) === "🌍 Per Market:"));
    expect(strip(load("track-multi-market.json"))).toEqual(strip(load("track-single-market.json")));
  });
});
