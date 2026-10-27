# Steward shaped event and shaping telemetry step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `shaped` Steward event (backlog to concept) in place of `concept-started`, and the `shaping` token step.

**Architecture:** `EVENTS` and the entry table in `packages/cli/src/steward/` get one renamed key. `viaEntry` already returns a no-op when the ticket is already at the target, so `shaped` from `concept` needs no new code. `STEPS` in `packages/cli/src/tokens/types.ts` gains one value; every consumer derives from that array.

**Tech Stack:** TypeScript, vitest. Package manager: pnpm only.

## Global Constraints

- Design: `.digismith/board/DGS-674—steward-shaped-event/design.html` (approved by the Maestro under Jack's 2026-10-27 delegation).
- `shaped` is not a gate: it must not be added to `GATE_EVENTS`.
- No alias for `concept-started`.
- Commit messages: title-only conventional commits, scope `dgs-674`, no AI attribution lines.
- Never commit to `main`. pnpm only. Run tests with `pnpm vitest run <path>`.

---

### Task 1: Replace concept-started with shaped

**Files:**
- Modify: `packages/cli/src/steward/types.ts:8` (`EVENTS`)
- Modify: `packages/cli/src/steward/rules.ts:10` (entry table)
- Modify: `packages/cli/src/steward/rules.test.ts:17` and add tests after the "entry events, one per status" block
- Modify: `packages/cli/src/steward/event.test.ts:451,454,458,479`
- Modify: `packages/cli/src/steward/README.md:13`

**Interfaces:**
- Consumes: `evaluate(input, view, cfg)` and the `ev`, `view`, `OFF`, `to` helpers already defined at the top of `rules.test.ts`.
- Produces: event name `"shaped"` in `EVENTS` (type `EventName`); the CLI accepts `dg steward event shaped`.

- [ ] **Step 1: Write the failing tests**

In `rules.test.ts` change line 17 from `[ev("concept-started"), view("backlog"), "concept"],` to:

```typescript
    [ev("shaped"), view("backlog"), "concept"],
```

and add this block right after the closing `});` of the `describe("entry events, one per status", ...)` block:

```typescript
describe("shaped (DGS-674)", () => {
  it("needs no quote and is not a gate", () => {
    expect(GATE_EVENTS).not.toContain("shaped");
    expect(to(evaluate(ev("shaped"), view("backlog"), OFF))).toBe("concept");
  });
  it("is a no-op on a ticket already in concept", () => {
    expect(evaluate(ev("shaped"), view("concept"), OFF)).toEqual({ kind: "noop" });
  });
  it("is refused from any other status", () => {
    expect(to(evaluate(ev("shaped"), view("to do"), OFF))).toBe("refuse");
  });
  it("concept-started no longer exists", () => {
    expect(EVENTS as readonly string[]).not.toContain("concept-started");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/steward/rules.test.ts`
Expected: FAIL (`shaped` is an unknown event, and `concept-started` is still in `EVENTS`).

- [ ] **Step 3: Make the change**

In `types.ts` line 8 replace `"concept-started"` with `"shaped"` in the `EVENTS` array (keep the position).

In `rules.ts` line 10 replace the key:

```typescript
  shaped: { from: ["backlog"], to: "concept" },
```

In `event.test.ts` replace `event: "concept-started"` with `event: "shaped"` on lines 451, 454, 458 and 479 (four occurrences; leave the surrounding comments).

In `README.md` line 13 replace the row with:

```markdown
| `shaped` | backlog | concept (the shaping skill fires it at its end; from concept it does nothing) |
```

- [ ] **Step 4: Run the steward tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/steward`
Expected: PASS (all steward tests, including the four edited ones in `event.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward
git commit -m "feat(dgs-674): add the shaped event in place of concept-started"
```

---

### Task 2: Add the shaping token step

**Files:**
- Modify: `packages/cli/src/tokens/types.ts:1` (`STEPS`)
- Modify: `packages/cli/src/tokens/entry.test.ts` (add a test after test `b2`)

**Interfaces:**
- Consumes: the `fixture()` and `run()` helpers and `lines()` in `entry.test.ts`.
- Produces: `"shaping"` as a valid value of type `Step` and of `--step`.

- [ ] **Step 1: Write the failing test**

Add after the `b2: step-end appends a step_end line` test:

```typescript
  it("b3: step-start accepts the shaping step (DGS-674)", () => {
    const f = fixture();
    const r = run(["step-start", "--ticket", "T-1", "--step", "shaping", "--session-id", "sess-1"], f);
    expect(r.status).toBe(0);
    expect(lines(f.registry)[0]).toMatchObject({ kind: "step_start", step: "shaping", session_id: "sess-1" });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/cli/src/tokens/entry.test.ts -t "b3"`
Expected: FAIL (`invalid --step shaping`, nothing written).

- [ ] **Step 3: Add the step**

In `packages/cli/src/tokens/types.ts` line 1:

```typescript
export const STEPS = ["shaping", "brainstorming", "writing-plans", "implementation", "finishing", "other"] as const;
```

- [ ] **Step 4: Run the tokens tests**

Run: `pnpm vitest run packages/cli/src/tokens`
Expected: PASS. If a test enumerates the step list and now fails, add `"shaping"` to that expectation and keep everything else.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens
git commit -m "feat(dgs-674): add the shaping token step"
```
