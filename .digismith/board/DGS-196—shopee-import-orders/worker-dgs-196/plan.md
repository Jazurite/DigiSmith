# DGS-196 `dg shopee import-orders`: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:executing-plans to implement this plan task by task. TDD: failing test first.

**Goal:** `pbpaste | dg shopee import-orders -` or `dg shopee import-orders <file>` lists Jack's Shopee VN purchases from pasted Proxyman text. No live call to Shopee. No capture folder.

**Architecture:** Pure parsers and formatters in `packages/cli/src/shopee/`, a thin yargs command. No new package. Spec: `design.html` (same folder).

**Tech Stack:** TypeScript, Node 24, yargs, vitest.

## Global Constraints
- Split the text at each `[n] URL = ` line. Keep only the URL line and the response JSON body. Skip the Request section by position. Never print, log, store or echo anything from it, not in errors or test failures.
- A malformed block gives a short error naming the block number only.
- Synthetic fixtures only. Fake Request sections hold obvious dummy secrets. No real order, name, phone or address in the repo.
- Detail parser uses an allow-list. Shipping and payment fields never enter the model.
- Money = integer / 100000. Times UTC+7 first, UTC in brackets. ISO in JSON.
- Worktree `.worktrees/dgs-196`, branch `dgs-196-shopee-import-orders`. Title-only conventional commits, no attribution. No push until "approved: push".
- Touch no other command group, except one line in `src/index.ts`.

## File Structure
- Create `packages/cli/src/shopee/money.ts` (+ test): `toVnd(raw)`.
- Create `packages/cli/src/shopee/paste.ts` (+ test): `parsePaste(text)` returns `{ blocks: {n, method, path, params, body}[], errors: string[] }`. Never returns Request text.
- Create `packages/cli/src/shopee/list.ts` (+ test): `parseOrderList(body)` returns order ids.
- Create `packages/cli/src/shopee/detail.ts` (+ test): `parseOrderDetail(body)` returns `Order`.
- Create `packages/cli/src/shopee/join.ts` (+ test): `joinOrders(blocks)` returns `{ orders, missing }`.
- Create `packages/cli/src/shopee/format.ts` (+ test): `formatTable`, `formatJson`, `formatCsv`, `formatTime`.
- Create `packages/cli/src/shopee/import-orders.ts` (+ test): the yargs command. Input `-` reads stdin, else a file.
- Create `packages/cli/src/shopee/index.ts`: group `shopee`.
- Modify `packages/cli/src/index.ts`: register `shopeeCommand`.
- Create `packages/cli/src/shopee/test-fixtures.ts`: synthetic builders (list body, detail body, a Proxyman-copy block with a dummy-secret Request section).

## Tasks

### Task 1: money
- Test: `toVnd(43141700000)` = 431417; `0` = 0; non-integer or missing returns `null`.
- Commit `feat(cli): shopee money conversion`.

### Task 2: paste reader
- Test: a paste with 3 blocks gives 3 blocks with `n`, URL parts (`order_id`, `limit`, `offset`) and parsed body. CRLF and LF. A Request section with dummy cookie, CSRF and `x-sap-*` values: stringify the whole result and the errors, assert no dummy string appears. A Request body that is itself JSON is not mistaken for the response. A block with no Response section or no JSON body gives `block 836: ...` in `errors` and the other blocks still parse. The error text holds no URL query and no Request text.
- Implement: block splitter, Response-section finder (marker is a guess: isolated), body = text after the first blank line of the response.
- Commit `feat(cli): shopee paste reader`.

### Task 3: detail parser
- Test: synthetic detail gives `Order`: date from `pc_processing_info.create_time` (1791338198 = 2026-10-07 08:56:38 UTC+7), lines from `info_card.parcel_cards[].product_info.item_groups[].items[]`, shop, total, currency, status label. Fixture holds a fake shipping name, phone, address and payment info: assert none reaches the result. Bad shape returns `null`.
- Commit `feat(cli): shopee order detail parser`.

### Task 4: list parser
- Test: synthetic list page gives ids. Pages with different `offset` merge, ids de-duplicated. Shape is a best guess until a real paste works: isolated here.
- Commit `feat(cli): shopee order list parser`.

### Task 5: join
- Test: ids with details give orders. An id with no detail gives `purchasedAt: null` and `missing` 1. Two details for one id: later block wins. Detail matched by `order_id` in the URL.
- Commit `feat(cli): shopee order join`.

### Task 6: formatters
- Test: table shows `purchase date: MISSING (detail not captured)` and a footer with orders, rows, missing and skipped counts. JSON has ISO times and `null` for missing. CSV quotes commas and quotes, one row per line item. `formatTime` gives `2026-10-07 08:56:38 UTC+7 [01:56:38Z]`.
- Commit `feat(cli): shopee order formatters`.

### Task 7: command and registration
- Test (like `get-task.test.ts`): `-` reads injected stdin, a file path reads a file, each format, exit 0. Missing file or empty stdin exits 1 with a plain message. `--json` with `--csv` is rejected. Dummy secrets from the fake Request sections never reach stdout or stderr. Help text states the x100000 rule, that input is pasted Proxyman text, and that no live call is made.
- Implement `import-orders.ts`, `index.ts`, register in `src/index.ts`. Update `index.test.ts` if it lists groups.
- Commit `feat(cli): dg shopee import-orders`.

### Task 8: verify (checkpoint 3)
- `pnpm --filter @digismith/cli test`, typecheck, build. Show diff and test counts. Wait for "approved: checkpoint 3".
