import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  STATE_MARKER,
  catchUpMarker,
  markerLines,
  extractBlock,
  parseStateBody,
  parseTime,
  renderStateBody,
  writeStateBlock,
} from "./state-block.ts";
import { SAMPLE_BODY } from "./test-fixtures.ts";

describe("markers", () => {
  it("builds the conductor-state and catch-up marker lines", () => {
    expect(markerLines(STATE_MARKER)).toEqual({
      open: "<!-- digismith:conductor-state v1 -->",
      close: "<!-- /digismith:conductor-state -->",
    });
    expect(markerLines(catchUpMarker("dsm-maestro-01"))).toEqual({
      open: "<!-- digismith:catch-up v1 maestro=dsm-maestro-01 -->",
      close: "<!-- /digismith:catch-up maestro=dsm-maestro-01 -->",
    });
  });
});

describe("extractBlock", () => {
  const { open, close } = markerLines(STATE_MARKER);
  it("finds the body between the markers", () => {
    const r = extractBlock(`top\n${open}\nBODY\n${close}\nbottom\n`, STATE_MARKER);
    expect(r).toMatchObject({ found: true, body: "BODY\n" });
  });
  it("reports not found", () => {
    expect(extractBlock("nothing here", STATE_MARKER)).toMatchObject({ found: false });
  });
  it("throws on two blocks of the same marker", () => {
    const t = `${open}\na\n${close}\n${open}\nb\n${close}\n`;
    expect(() => extractBlock(t, STATE_MARKER)).toThrow(/two|more than one|2/i);
  });
  it("throws on an open marker without a close", () => {
    expect(() => extractBlock(`${open}\na\n`, STATE_MARKER)).toThrow(/close/i);
  });
  it("tells catch-up blocks of different identities apart", () => {
    const a = markerLines(catchUpMarker("a"));
    const b = markerLines(catchUpMarker("b"));
    const t = `${a.open}\nA\n${a.close}\n${b.open}\nB\n${b.close}\n`;
    expect(extractBlock(t, catchUpMarker("b")).body).toBe("B\n");
  });
});

describe("parseStateBody", () => {
  it("parses every section", () => {
    const { state, problems } = parseStateBody(SAMPLE_BODY);
    expect(problems).toEqual([]);
    expect(state.updated).toBe("2026-10-13T14:05+07:00");
    expect(state.conductor).toBe("digismith-conductor");
    expect(state.running).toEqual([
      { worker: "dgs-422", key: "DGS-422", stage: "plan", since: "2026-10-13T13:35+07:00" },
      { worker: "dgs-417", key: "DGS-417", stage: "build", since: "2026-10-13T13:40:00+07:00" },
    ]);
    expect(state.waiting).toEqual([
      { question: "Merge DGS-417 now?", since: "2026-10-13T13:50+07:00", pane: "w2:p5" },
    ]);
    expect(state.decided[0]).toEqual({
      decision: "Use plain ssh",
      why: "herdr --remote only opens the UI",
      allowedBy: "order-roles-followups-parallel",
    });
    expect(state.parked[0]).toEqual({ what: "remote consult", why: "no ssh key", next: "Jack adds a key" });
    expect(state.next).toEqual(["merge DGS-417", "merge DGS-427", "merge DGS-422"]);
    expect(state.seats).toEqual([
      { seat: "jack", fiveHourPct: 19, weeklyPct: 59 },
      { seat: "dev0", fiveHourPct: 12, weeklyPct: 36 },
    ]);
  });
  it("rejects impossible dates", () => {
    expect(parseTime("2026-02-31T10:00+07:00")).toBeUndefined();
    expect(parseTime("2026-02-31 10:00 UTC+7")).toBeUndefined();
    expect(parseTime("2026-10-13T10:00+07:00")).toBe("2026-10-13T10:00+07:00");
  });
  it("normalizes Updated to ISO with offset", () => {
    expect(parseStateBody("Updated: 2026-10-13 14:05 UTC+7\n").state.updated).toBe("2026-10-13T14:05:00+07:00");
  });
  it("keeps a Next item that starts with a number but is not a list marker", () => {
    expect(parseStateBody("## Next\n1.5x speed\n2. real step\n- 3.14 release\n").state.next).toEqual(["1.5x speed", "real step", "3.14 release"]);
  });
  it("reads none and empty sections as empty", () => {
    const { state, problems } = parseStateBody("## Running\nnone\n## Waiting for Jack\n## Next\n- none\n");
    expect(problems).toEqual([]);
    expect(state.running).toEqual([]);
    expect(state.waiting).toEqual([]);
    expect(state.next).toEqual([]);
  });
  it("keeps a pipe inside the free text of the first field", () => {
    const { state } = parseStateBody("## Waiting for Jack\n- a | b? | since 2026-10-13T13:50+07:00 | pane w2:p1\n");
    expect(state.waiting[0].question).toBe("a | b?");
  });
  it("reports a bad line with its line number and the expected format, and keeps going", () => {
    const { state, problems } = parseStateBody("## Running\n- only | two\n- w | K | s | since 2026-10-13T13:35+07:00\n");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/line 2/);
    expect(problems[0]).toMatch(/<worker> \| <KEY> \| <stage> \| since/);
    expect(state.running).toHaveLength(1);
  });
  it("numbers lines from firstLine so a problem points at the line in the note", () => {
    const { problems } = parseStateBody("## Running\n- bad\n", 10);
    expect(problems[0]).toMatch(/line 11/);
  });
  it("reports a bad time and an unknown heading", () => {
    const { problems } = parseStateBody("## Running\n- w | K | s | since yesterday\n## Wat\n- x\n");
    expect(problems.some((p) => /time/i.test(p) && /line 2/.test(p))).toBe(true);
    expect(problems.some((p) => /Wat/.test(p) && /line 3/.test(p))).toBe(true);
  });
  it("reports a bad seats line", () => {
    const { problems } = parseStateBody("## Health\n- Seats and usage: jack lots\n");
    expect(problems[0]).toMatch(/line 2/);
    expect(problems[0]).toMatch(/jack: 5h 19%, weekly 59%/);
  });
  it("ignores a Limits line in Health (computed)", () => {
    expect(parseStateBody("## Health\n- Limits: builder 1/2, reviewer 0/1, role 1/1\n").problems).toEqual([]);
  });
  it("ignores Server and Open tabs lines in Health (computed)", () => {
    const { problems } = parseStateBody("## Health\n- Server: up\n- Open tabs: 3\n");
    expect(problems).toEqual([]);
  });
});

describe("renderStateBody", () => {
  it("round-trips through parseStateBody", () => {
    const { state } = parseStateBody(SAMPLE_BODY);
    const again = parseStateBody(renderStateBody(state));
    expect(again.problems).toEqual([]);
    expect(again.state).toEqual(state);
  });
  it("writes none for empty sections", () => {
    const text = renderStateBody({ running: [], waiting: [], decided: [], parked: [], next: [], seats: [] });
    expect(text).toMatch(/## Running\nnone\n/);
    expect(text).toMatch(/## Next\nnone\n/);
  });
});

describe("writeStateBlock", () => {
  let dir: string;
  let note: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dgs422-"));
    note = path.join(dir, "note.md");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { open, close } = markerLines(STATE_MARKER);

  it("appends a block at the end when none exists, leaving the rest as it was", () => {
    const free = "# My note\n\nfree text\n## Session end x\nResult: ok\n";
    fs.writeFileSync(note, free);
    writeStateBlock(note, "BODY\n", STATE_MARKER);
    const out = fs.readFileSync(note, "utf-8");
    expect(out.startsWith(free)).toBe(true);
    expect(out).toContain(`${open}\nBODY\n${close}\n`);
  });
  it("replaces only the text between the markers", () => {
    const before = "# top\nline\n\n";
    const after = "\n## Session end a\nResult: ok\nmore free text, no trailing newline";
    fs.writeFileSync(note, `${before}${open}\nOLD\n${close}\n${after}`);
    writeStateBlock(note, "NEW\n", STATE_MARKER);
    expect(fs.readFileSync(note, "utf-8")).toBe(`${before}${open}\nNEW\n${close}\n${after}`);
  });
  it("replaces one catch-up block in place and leaves other identities alone", () => {
    const a = markerLines(catchUpMarker("a"));
    const b = markerLines(catchUpMarker("b"));
    fs.writeFileSync(note, `x\n${a.open}\nA1\n${a.close}\n${b.open}\nB1\n${b.close}\ny\n`);
    writeStateBlock(note, "A2\n", catchUpMarker("a"));
    expect(fs.readFileSync(note, "utf-8")).toBe(`x\n${a.open}\nA2\n${a.close}\n${b.open}\nB1\n${b.close}\ny\n`);
  });
  it("creates the note (and its folder) when missing", () => {
    const deep = path.join(dir, "sub", "note.md");
    writeStateBlock(deep, "B\n", STATE_MARKER);
    expect(fs.readFileSync(deep, "utf-8")).toBe(`${open}\nB\n${close}\n`);
  });
  it("writes through a symlinked note: the link stays and the target gets the block", () => {
    const real = path.join(dir, "real.md");
    fs.writeFileSync(real, "hello\n");
    fs.symlinkSync(real, note);
    writeStateBlock(note, "B\n", STATE_MARKER);
    expect(fs.lstatSync(note).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(real, "utf-8")).toContain(`${open}\nB\n${close}\n`);
    expect(fs.readFileSync(real, "utf-8").startsWith("hello\n")).toBe(true);
  });
  it("refuses to write when there are two blocks, and changes nothing", () => {
    const t = `${open}\na\n${close}\n${open}\nb\n${close}\n`;
    fs.writeFileSync(note, t);
    expect(() => writeStateBlock(note, "C\n", STATE_MARKER)).toThrow();
    expect(fs.readFileSync(note, "utf-8")).toBe(t);
  });
  it("refuses a body that contains a marker line", () => {
    fs.writeFileSync(note, "x\n");
    expect(() => writeStateBlock(note, `${close}\n`, STATE_MARKER)).toThrow(/marker/i);
  });
  it("is atomic: leaves no temp file and keeps the file mode", () => {
    fs.writeFileSync(note, `${open}\nOLD\n${close}\n`, { mode: 0o640 });
    fs.chmodSync(note, 0o640);
    writeStateBlock(note, "NEW\n", STATE_MARKER);
    expect(fs.readdirSync(dir)).toEqual(["note.md"]);
    expect(fs.statSync(note).mode & 0o777).toBe(0o640);
  });
});

describe("Workers header and Owner unknown line (DGS-462)", () => {
  it("round-trips both", () => {
    const body = renderStateBody({ conductor: "c", workers: ["dgs-1", "dgs-2"], ownerUnknown: ["x"], running: [], waiting: [], decided: [], parked: [], next: [], seats: [] });
    expect(body).toContain("Workers: dgs-1, dgs-2");
    expect(body).toContain("- Owner unknown: x");
    const { state, problems } = parseStateBody(body);
    expect(problems).toEqual([]);
    expect(state.workers).toEqual(["dgs-1", "dgs-2"]);
    expect(state.ownerUnknown).toEqual(["x"]);
  });
  it("reads 'Workers: none' as an empty list and omits both when unset", () => {
    expect(parseStateBody("Workers: none\n").state.workers).toEqual([]);
    const body = renderStateBody({ running: [], waiting: [], decided: [], parked: [], next: [], seats: [] });
    expect(body).not.toMatch(/Workers:|Owner unknown/);
  });
});

describe("header lines of DGS-577", () => {
  const body = `Updated: 2026-10-26T10:00+07:00
Changed: 2026-10-24T09:00+07:00
Conductor: c
Watch: /a/note.md, /a/board
Running: unknown (no herdr workspace)

## Running
none

## Waiting for Jack
none

## Decided under the mandate
none

## Parked or failed
none

## Next
none

## Health
- Seats and usage: none
`;
  it("parses Changed, Watch and Running unknown", () => {
    const { state, problems } = parseStateBody(body);
    expect(problems).toEqual([]);
    expect(state.changed).toBe("2026-10-24T09:00+07:00");
    expect(state.watch).toEqual(["/a/note.md", "/a/board"]);
    expect(state.runningUnknown).toBe("no herdr workspace");
  });
  it("round-trips through renderStateBody", () => {
    const { state } = parseStateBody(body);
    expect(parseStateBody(renderStateBody(state)).state).toEqual(state);
  });
  it("rejects a bad Changed time and accepts a block without one", () => {
    expect(parseStateBody(body.replace("2026-10-24T09:00+07:00", "yesterday")).problems[0]).toMatch(/Changed needs a time/);
    expect(parseStateBody(body.replace(/Changed:.*\n/, "")).state.changed).toBeUndefined();
  });
});
