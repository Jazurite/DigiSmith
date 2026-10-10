import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Attribution must not read a transcript whole: any readFileSync of a .jsonl file fails the test.
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    readFileSync: ((p: unknown, ...rest: unknown[]) => {
      if (typeof p === "string" && p.endsWith(".jsonl")) throw new Error("whole-file read of a transcript");
      return (real.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof real.readFileSync,
  };
});

const { inferSessionsForTicket } = await import("./attribution.ts");

function dirWith(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "proj-"));
  const p = join(root, "-a");
  mkdirSync(p, { recursive: true });
  for (const [n, c] of Object.entries(files)) writeFileSync(join(p, `${n}.jsonl`), c);
  return root;
}
const L = (o: object) => JSON.stringify(o) + "\n";
const filler = (n: number) => L({ type: "user", gitBranch: "main", cwd: "/x" }).repeat(n);

describe("attribution reads incrementally", () => {
  it("scans files larger than the chunk size without a whole-file read", () => {
    const root = dirWith({
      "big-match": filler(100) + L({ type: "user", gitBranch: "dgs-214", cwd: "/x" }) + filler(50_000),
      "big-unrelated": filler(60_000),
    });
    expect(inferSessionsForTicket("DGS-214", root, { chunkSize: 4096 })).toEqual(["big-match"]);
  });

  it("skips a single line over 1 MB without error and still reads later lines", () => {
    const huge = L({ type: "user", gitBranch: "main", cwd: "/x", pad: "x".repeat(1_200_000) });
    const root = dirWith({
      "huge-then-match": huge + L({ type: "custom-title", customTitle: "DGS-214 placeholder" }),
      "huge-only": huge,
    });
    expect(inferSessionsForTicket("DGS-214", root, { chunkSize: 65536 })).toEqual(["huge-then-match"]);
  });

  it("finds a custom-title after line 200 but ignores branch and cwd after line 200", () => {
    const root = dirWith({
      "late-title": filler(250) + L({ type: "custom-title", customTitle: "DGS-214 placeholder" }),
      "late-agent": filler(250) + L({ type: "agent-name", agentName: "dgs-214" }),
      "late-other-agent": filler(250) + L({ type: "agent-name", agentName: "dgs-2140" }),
      "late-other-title": filler(250) + L({ type: "custom-title", customTitle: "DGS-2140 placeholder" }),
      "late-branch": filler(250) + L({ type: "user", gitBranch: "dgs-214", cwd: "/x" }),
    });
    expect(inferSessionsForTicket("DGS-214", root, { chunkSize: 4096 }).sort()).toEqual(["late-agent", "late-title"]);
  });
});
