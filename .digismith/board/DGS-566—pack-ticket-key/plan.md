# Reviewer pack: ticket key in pack.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dg reviewer pack` writes a `ticket: <KEY>` line into `pack.md`, and the Reviewer card and the SDD role-mode text use it.

**Architecture:** `buildPack` gets a new input `ticket` (a key like `DGS-566`, or `none`). It validates it and writes `ticket: <value>` as the first field of the manifest. The CLI gets a `--ticket` option. The card reads the key from that line. The SDD role-mode commands pass `--ticket`.

**Tech Stack:** TypeScript (node `--experimental-strip-types`), yargs, vitest, Markdown skills. pnpm only.

**Spec:** `.digismith/board/DGS-566—pack-ticket-key/design.html`.

## Global Constraints

- The manifest line is `ticket: <KEY>` or `ticket: none`. It is the first field after the title and the blank line, before `type:`. It is written in every round and for both pack types.
- A valid value matches `/^[A-Z][A-Z0-9]*-\d+$/` or is exactly `none`. A missing value fails with `ticket: required`. Any other value fails with `ticket: must be a ticket key such as DGS-566, or none`. The check runs before any folder is made.
- Hand mode never calls `dg reviewer pack`. The old-path tests (`both-paths.test.ts` "the old path (hand mode)", the `anchors` in `sdd.test.ts`) are not edited and must still pass.
- `skills/reviewer/brief.md` is not changed (it has `{{KEY}}` from the conductor). Its test keeps exactly five placeholders.
- Do not bump the plugin version: the post-finish hooks do it.
- pnpm only, never npm. Commit titles are conventional, lowercase, no attribution footer. Commit with a pathspec.

## Running this plan (the first role-mode build)

A Builder runs this plan with `DIGISMITH_REVIEW_MODE=role` (Workbox runbook, "Start of a Reviewer"). Under the role mode of DGS-529 (`skills/reviewer/SKILL.md`, "Role Mode" in `skills/subagent-driven-development/SKILL.md`) no Builder reviews. For each task the Builder runs `review-package`, `dg reviewer pack` and reports `STOP: task-review-ready <pack>`. A task Reviewer worker reviews it, writes `report.md` with a `json findings` block, and the conductor relays it. The final review is a `ticket` Reviewer worker the same way.

- Each task below is small (one commit) so each review has a small diff file.
- Tasks 1 to 3 build in order. Task 1 makes `ticket:` available. The packs of Task 1 itself and any pack built before Task 1 is merged into the Builder's branch have no `ticket:` line: the Reviewer uses the key in the conductor's brief. From Task 2 on, the Builder builds its packs with the new option: pass `--ticket DGS-566`.
- The Builder passes `--ticket DGS-566` (the `**Key:**` line of `ticket.md`) once the option exists. Until then, the command has no such option: omit it for the pack of Task 1 only.

## File Structure

| File | Change |
|---|---|
| `packages/cli/src/reviewer/pack.ts` | `PackInput.ticket`, validation, manifest line |
| `packages/cli/src/reviewer/index.ts` | `--ticket` option, passed to `buildPack` |
| `packages/cli/src/reviewer/pack.test.ts` | manifest and validation tests |
| `packages/cli/src/reviewer/index.test.ts` | the CLI passes `--ticket` and fails without it |
| `packages/cli/src/reviewer/both-paths.test.ts` | role-path test passes `ticket` and asserts the line |
| `skills/reviewer/SKILL.md` | the card reads the `ticket:` line |
| `packages/cli/src/reviewer/card.test.ts` | the card test |
| `skills/subagent-driven-development/SKILL.md` | the four pack commands carry `--ticket <KEY>` |
| `packages/cli/src/reviewer/sdd.test.ts` | every pack command carries `--ticket` |

---

### Task 1: The ticket line in pack.md, the CLI option, the role-path test

**Files:**
- Modify: `packages/cli/src/reviewer/pack.ts`
- Modify: `packages/cli/src/reviewer/index.ts`
- Test: `packages/cli/src/reviewer/pack.test.ts`, `packages/cli/src/reviewer/index.test.ts`, `packages/cli/src/reviewer/both-paths.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PackInput.ticket: string` (required). `buildPack` throws `ticket: required` or `ticket: must be a ticket key such as DGS-566, or none`. `pack.md` has the line `ticket: <value>`. CLI option `--ticket <KEY|none>`.

- [ ] **Step 1: Write the failing tests in `pack.test.ts`**

In `taskInput` and `ticketInput`, add `ticket: "DGS-566"` to the defaults (the object literal that holds `type`, `id`, `round`, ...). For `taskInput` change the first line of the literal to:

```ts
  type: "task", id: "7", round: 1, ticket: "DGS-566", workspace: path.join(ws, "wk"), base: "a1b2c3d", head: "e4f5a6b",
```

and for `ticketInput`:

```ts
  type: "ticket", id: "final", round: 1, ticket: "DGS-566", workspace: path.join(ws, "wk"), base: "a1b2c3d", head: "e4f5a6b",
```

In the first `it` of `describe("buildPack, task round 1")`, after the line `expect(m).toMatch(/^type: task$/m);` add:

```ts
    expect(m).toMatch(/^ticket: DGS-566$/m);
    expect(m.indexOf("ticket: DGS-566")).toBeLessThan(m.indexOf("type: task"));
```

Add a new `describe` at the end of the file:

```ts
describe("buildPack, the ticket line", () => {
  it("is written for a ticket pack and for a round 2 pack", () => {
    expect(manifest(buildPack(ticketInput()).dir)).toMatch(/^ticket: DGS-566$/m);
    const r2 = buildPack(taskInput({ round: 2, findingsIn: w("open.md"), fixBase: "e4f5a6b", head: "9a8b7c6" }));
    expect(manifest(r2.dir)).toMatch(/^ticket: DGS-566$/m);
  });
  it("accepts none and writes it as is", () => {
    expect(manifest(buildPack(taskInput({ ticket: "none" })).dir)).toMatch(/^ticket: none$/m);
  });
  it("refuses a missing or malformed value and makes no folder", () => {
    expect(() => buildPack(taskInput({ ticket: "" }))).toThrow(/ticket: required/);
    for (const bad of ["dgs-566", "566", "DGS-", "DGS-566 x", "None"]) {
      expect(() => buildPack(taskInput({ ticket: bad }))).toThrow(/ticket: must be a ticket key such as DGS-566, or none/);
    }
    expect(fs.existsSync(path.join(ws, "wk", "reviews"))).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing tests in `index.test.ts` and `both-paths.test.ts`**

In `index.test.ts`, in the test `pack prints the pack folder and the model`, add `"--ticket", "DGS-566",` to the argument array (after `"--task", "3",`) and, after the `expect(logs[1])` line, add:

```ts
    const m = fs.readFileSync(path.join(ws, "wk", "reviews", "task-3-r1", "pack.md"), "utf8");
    expect(m).toMatch(/^ticket: DGS-566$/m);
```

Add a new test after it (inside the same `describe`):

```ts
  it("pack exits 1 and says ticket is required when --ticket is missing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = (n: string, t = "x\n") => { const p = path.join(ws, n); fs.writeFileSync(p, t); return p; };
    const diff = w("d2.diff", "# Review package: a1b2c3d..e4f5a6b\n\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n");
    await run([
      "reviewer", "pack", "--type", "task", "--task", "4", "--workspace", path.join(ws, "wk"),
      "--base", "a1b2c3d", "--head", "e4f5a6b", "--diff", diff, "--plan", w("plan2.md"),
      "--brief", w("brief2.md"), "--report", w("rep2.md"),
    ]);
    expect(process.exitCode).toBe(1);
    expect(err.mock.calls.flat().join(" ")).toMatch(/ticket: required/);
  });
```

Check the top of `index.test.ts`: it must import `fs` and `path` (the existing tests already use `path` and `fs`). If `fs` is not imported, add `import * as fs from "node:fs";`.

In the existing `pack exits 1 and names the problem on bad input` test add `"--ticket", "DGS-566",` after `"--task", "3",` so it still fails on the diff, not on the ticket.

In `both-paths.test.ts`, in the role-mode `buildPack({...})` call, add `ticket: "DGS-566",` after `round: 1,`. After `expect(model).toBe("claude-sonnet-5-5");` add:

```ts
    expect(fs.readFileSync(path.join(dir, "pack.md"), "utf8")).toMatch(/^ticket: DGS-566$/m);
```

- [ ] **Step 3: Run the tests and see them fail**

Run: `pnpm exec vitest run packages/cli/src/reviewer/pack.test.ts packages/cli/src/reviewer/index.test.ts packages/cli/src/reviewer/both-paths.test.ts`
Expected: FAIL. The new tests fail (no `ticket:` line, no `ticket: required`).

- [ ] **Step 4: Implement in `pack.ts`**

In `PackInput` add the field after `round`:

```ts
  ticket: string;
```

Below `const SHA_RE = ...` add:

```ts
const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;
```

Below the `sha` function add:

```ts
function ticketKey(v: string): string {
  if (v === "") throw new Error("ticket: required");
  if (v !== "none" && !TICKET_RE.test(v)) throw new Error("ticket: must be a ticket key such as DGS-566, or none");
  return v;
}
```

In `buildPack`, after the `round` check line and before `const base = sha("base", input.base);` add:

```ts
  const ticket = ticketKey(input.ticket ?? "");
```

In the manifest array, add the line after the empty string that follows the title:

```ts
    `# Review pack: ${label} round ${input.round}`,
    "",
    `ticket: ${ticket}`,
    `type: ${input.type}`,
```

- [ ] **Step 5: Implement in `index.ts`**

In `PackArgs` add `ticket?: string;` (after `round: number;`). In the `builder` add, after the `.option("round", ...)` line:

```ts
      .option("ticket", { type: "string", describe: "the ticket key, such as DGS-566, or none when the work has no tracker key" })
```

In the `buildPack({...})` call add `ticket: args.ticket ?? "",` after `round: args.round,`.

- [ ] **Step 6: Run the tests and see them pass**

Run: `pnpm exec vitest run packages/cli/src/reviewer`
Expected: PASS (all reviewer tests, including the old-path tests of `both-paths.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/reviewer/pack.ts packages/cli/src/reviewer/index.ts packages/cli/src/reviewer/pack.test.ts packages/cli/src/reviewer/index.test.ts packages/cli/src/reviewer/both-paths.test.ts
git commit -m "feat(dgs-566): write the ticket key into pack.md"
```

---

### Task 2: The Reviewer card reads the ticket line

**Files:**
- Modify: `skills/reviewer/SKILL.md` (the registration rule under "Rules for the Reviewer"; flow step 1)
- Test: `packages/cli/src/reviewer/card.test.ts`

**Interfaces:**
- Consumes: the `ticket:` line that Task 1 puts in `pack.md`.
- Produces: card text that says where the key comes from. Nothing later depends on it.

- [ ] **Step 1: Write the failing test**

In `card.test.ts`, inside `describe("skills/reviewer/SKILL.md")`, add:

```ts
  it("takes the ticket key from the ticket line of pack.md, not from a path", () => {
    expect(card).toContain("`ticket:` line");
    expect(card).toContain("ticket: none");
    expect(card).not.toMatch(/board folder/);
    expect(card).not.toMatch(/has no ticket line/);
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm exec vitest run packages/cli/src/reviewer/card.test.ts`
Expected: FAIL on the new test.

- [ ] **Step 3: Edit the card**

In `skills/reviewer/SKILL.md`, in the rule that starts `- Register this session first`, replace the sentence

```
`pack.md` has no ticket line: the key is the ticket key of the board folder named in the paths of `pack.md`.
```

with

```
`pack.md` has a `ticket:` line: its value is `<KEY>`. A `ticket: none` line means the work has no tracker key: skip the command.
```

In Flow step 1, replace `The pack folder holds `pack.md`, which lists the input files by absolute path.` with `The pack folder holds `pack.md`, which gives the ticket key (`ticket:`) and lists the input files by absolute path.`

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm exec vitest run packages/cli/src/reviewer/card.test.ts`
Expected: PASS (the brief test still sees exactly five placeholders).

- [ ] **Step 5: Commit**

```bash
git add skills/reviewer/SKILL.md packages/cli/src/reviewer/card.test.ts
git commit -m "docs(dgs-566): point the reviewer card at the ticket line"
```

---

### Task 3: The SDD role-mode commands pass --ticket

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (Role Mode, the four `dg reviewer pack --type` commands, and one sentence after the first)
- Test: `packages/cli/src/reviewer/sdd.test.ts`

**Interfaces:**
- Consumes: the `--ticket` option from Task 1.
- Produces: role-mode text where every pack command carries `--ticket <KEY>`.

- [ ] **Step 1: Write the failing test**

In `sdd.test.ts`, inside `describe("SDD has the role-mode path (new)")`, add:

```ts
  it("passes --ticket <KEY> in every pack command and says where the key comes from", () => {
    const lines = sdd.split("\n").filter((l) => l.includes("dg reviewer pack --type"));
    expect(lines.length).toBe(4);
    for (const l of lines) expect(l).toContain("--ticket <KEY>");
    expect(sdd).toMatch(/`<KEY>` is the `\*\*Key:\*\*` line of the ticket's `ticket\.md`/);
    expect(sdd).toContain("or `none`");
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm exec vitest run packages/cli/src/reviewer/sdd.test.ts`
Expected: FAIL on the new test.

- [ ] **Step 3: Edit the SDD skill**

In Role Mode, add `--ticket <KEY> ` right after `--type <x> ` in each of the four commands, so they read `dg reviewer pack --type task --ticket <KEY> --task <N> ...`, `dg reviewer pack --type task --ticket <KEY> --task <N> --round <R+1> ...`, `dg reviewer pack --type ticket --ticket <KEY> --workspace ...` and `dg reviewer pack --type ticket --ticket <KEY> --round 2 --workspace ...`. Each command stays on its one line.

Update the test regex input accordingly: the existing test `gives full re-review pack examples` looks for `--type ticket --round 2`. Change that expectation in `sdd.test.ts` to `--type ticket --ticket <KEY> --round 2`.

After the paragraph of step 1 under "After each task" (the one that ends `... accepts refs, but `dg reviewer pack` does not.`), add this paragraph, indented like step 1's other continuation lines:

```
   `<KEY>` is the `**Key:**` line of the ticket's `ticket.md`, for example
   `DGS-566`, or `none` when the work has no tracker key. Pass the same value
   in every pack of the ticket. The Reviewer takes the key from the `ticket:`
   line of `pack.md`.
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm exec vitest run packages/cli/src/reviewer`
Expected: PASS. Then run the whole suite: `pnpm exec vitest run` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md packages/cli/src/reviewer/sdd.test.ts
git commit -m "docs(dgs-566): pass the ticket key in the SDD role-mode pack commands"
```

---

## Self-Review

- **Spec coverage:** key source and required option (Task 1, `ticketKey`, `--ticket`); validation before any folder (Task 1 test "makes no folder"); manifest line position (Task 1 test `indexOf`); card text (Task 2); SDD lines (Task 3); old-path protection and the role-path assertion (Task 1 `both-paths.test.ts`; Task 3 leaves the `anchors` untouched); first role-mode build (section "Running this plan").
- **One change from the spec:** the CLI does not use yargs `demandOption` for `--ticket`. `buildPack` throws `ticket: required`. The result is the same, and it prints like every other pack error (`error: ...`, exit 1).
- **Placeholders:** none. **Types:** `ticket: string` in `PackInput`, `ticketKey(v: string)`, `args.ticket ?? ""` agree.
