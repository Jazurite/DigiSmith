import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenItem } from "./attention.ts";
import { notifyNew } from "./notify.ts";

const item = (n: number, over: Partial<OpenItem> = {}): OpenItem => ({
  id: `r${n}.lost.0`, ts: "2026-10-21T10:00:00.000Z", ticket: `DGS-${n}`, run: `r${n}`, kind: "lost", cause: "pane-gone", since: "2026-10-21T10:00:00.000Z", ...over,
});
const setup = (ok = true) => {
  const calls: string[][] = [];
  const t = { now: Date.parse("2026-10-21T10:05:00Z") };
  const d = { dir: mkdtempSync(join(tmpdir(), "nw-notify-")), now: () => t.now, runDg: async (a: string[]) => { calls.push(a); return { ok }; } };
  return { d, calls, t };
};

describe("notifyNew", () => {
  it("one add-comment per new item with the ticket, UTC+7 time and --yes", async () => {
    const { d, calls } = setup();
    expect(await notifyNew(d, [item(1)])).toEqual({ sent: 1, pending: 0 });
    expect(calls[0].slice(0, 4)).toEqual(["clickup", "add-comment", "--task", "DGS-1"]);
    expect(calls[0]).toContain("--yes");
    expect(calls[0].join(" ")).toContain("17:00");
  });
  it("a lost item comment ends with the salvage ask; other kinds do not", async () => {
    const { d, calls } = setup();
    await notifyNew(d, [item(1), item(2, { id: "r2.stuck.0", kind: "stuck" as OpenItem["kind"] })]);
    const text = (i: number) => calls[i][calls[i].indexOf("--text") + 1];
    expect(text(0).endsWith(" Before any teardown run dg salvage --ticket DGS-1.")).toBe(true);
    expect(text(1)).not.toContain("dg salvage");
  });
  it("the same item is not sent twice", async () => {
    const { d, calls, t } = setup();
    await notifyNew(d, [item(1)]);
    t.now += 2 * 3600_000;
    expect(await notifyNew(d, [item(1)])).toEqual({ sent: 0, pending: 0 });
    expect(calls).toHaveLength(1);
  });
  it("one per ticket and kind per hour; a limited item stays pending and goes out after the hour", async () => {
    const { d, calls, t } = setup();
    await notifyNew(d, [item(1)]);
    expect(await notifyNew(d, [item(1, { id: "r9.lost.0", run: "r9" })])).toEqual({ sent: 0, pending: 1 });
    t.now += 3601_000;
    expect(await notifyNew(d, [item(1, { id: "r9.lost.0", run: "r9" })])).toEqual({ sent: 1, pending: 0 });
    expect(calls).toHaveLength(2);
  });
  it("at most 10 comments in one pass", async () => {
    const { d, calls } = setup();
    const r = await notifyNew(d, Array.from({ length: 12 }, (_, i) => item(i + 1)));
    expect(r).toEqual({ sent: 10, pending: 2 });
    expect(calls).toHaveLength(10);
  });
  it("a failing dg keeps the item pending and it is retried next pass", async () => {
    const bad = setup(false);
    expect(await notifyNew(bad.d, [item(1)])).toEqual({ sent: 0, pending: 1 });
    const good = { ...bad.d, runDg: async () => ({ ok: true }) };
    expect(await notifyNew(good, [item(1)])).toEqual({ sent: 1, pending: 0 });
  });
  it("a ticket-less item gets no comment and is not pending", async () => {
    const { d, calls } = setup();
    expect(await notifyNew(d, [item(1, { ticket: null, run: "-", kind: "failed" })])).toEqual({ sent: 0, pending: 0 });
    expect(calls).toHaveLength(0);
  });
  it("an unparseable since is shown raw and does not reject the pass", async () => {
    const { d, calls } = setup();
    const r = await notifyNew(d, [item(1), item(2, { since: "garbage" })]);
    expect(r).toEqual({ sent: 2, pending: 0 });
    expect(calls[1].join(" ")).toContain("garbage");
    expect(await notifyNew(d, [item(1), item(2, { since: "garbage" })])).toEqual({ sent: 0, pending: 0 });
    expect(calls).toHaveLength(2);
  });
  it("state is saved after each send, before the next dg call", async () => {
    const { d } = setup();
    let n = 0;
    let onDisk = "";
    d.runDg = async () => {
      n++;
      if (n === 2) onDisk = readFileSync(join(d.dir, "notify-state.json"), "utf-8");
      return { ok: true };
    };
    await notifyNew(d, [item(1), item(2)]);
    expect(JSON.parse(onDisk).sent).toEqual(["r1.lost.0"]);
  });
  it("F7: sent keeps only the ids that are still open", async () => {
    const { d } = setup();
    await notifyNew(d, [item(1), item(2)]);
    await notifyNew(d, [item(2)]);
    expect(JSON.parse(readFileSync(join(d.dir, "notify-state.json"), "utf-8")).sent).toEqual(["r2.lost.0"]);
  });
});
