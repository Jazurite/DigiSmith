# `dg shopee import-orders`: list Shopee VN purchases from a Proxyman export folder or pasted text

**Status:** Applied and pushed (2026-10-09, `70b4395`, plugin 0.86.0-beta). Ordered 2026-10-07 ~21:3x UTC+7 [14:3xZ] by the Master (Jack chose "option 1"). ClickUp: **DGS-196** (C.2: CLI, task id `14zcebrv55w`).

**Source:** Jack wants a list of his own Shopee VN purchases (buyer side, shopee.vn) inside `dg`. He records the Shopee web app's own calls with Proxyman. The module reads those recordings. It makes no live call to Shopee.

**Input:** a Proxyman Raw export folder, or pasted Proxyman "copy" text (stdin with `-`, or a saved file). It is not a capture folder in `~/.digismith-depot/captures/`.
- Folder: files `[n] Request - ...` and `[n] Response - ...` pair by `[n]`. From a Request file only line 1 is read (the request line: `order_id`, `limit`, `offset`). From a Response file only the body after the first blank line is read (the headers hold cookies).
- Pasted text: blocks start with `[n] URL = ...`. Only the URL line and the response JSON are read. The Request section is ignored.
- Never read, print, log or store request headers, cookies or tokens. A malformed block gives an error that names only the block number.

**Decided, do not reopen:** no live call to Shopee. Its web calls carry per-request signed anti-bot headers (`af-ac-enc-dat`, `x-sap-sec`, `x-sap-ri`, the `sz` token). Forging them bypasses Shopee's anti-bot protection: out of scope. There is no official buyer API (the Open Platform API is seller-side) and no app credentials.

**Behavior:** `dg shopee import-orders <folder | file | ->`.
1. List responses (`/api/v4/order/get_all_order_and_checkout_list`): ids from `new_data.order_or_checkout_data[].order_list_detail.info_card.order_id`. The list also carries lines, total and status, so an order with no detail still prints its items.
2. Detail responses (`/api/v4/order/get_order_detail?order_id=<id>`), matched on `order_id` in the request line. Orders are the union of list ids and detail ids, so a details-only export works.
3. Purchase date = the detail's `data.pc_processing_info.create_time` (epoch seconds), never the list time. No detail: `purchase date: MISSING (detail not captured)`, counted in the footer.
4. Output: table by default, `--json`, `--csv` (one row per line item). Money is divided by 100000. Currency defaults to VND. Times UTC+7 first, UTC in brackets, ISO in JSON.
5. Lines: several item groups give several rows. A bundle is one row at the bundle price, with the part names joined by ` + ` (the parts are not priced rows).
6. Skips, all counted in the footer and the JSON summary:
   - A cancelled order (status label `label_order_cancelled`, or a header text with `cancel` and `refund`) is skipped whole: `skippedCancelledOrders`.
   - `--skip <id[,id...]>` (repeatable) and `--skip-file <path>` (one id per line, `#` comments) leave named orders out: `skippedByUser`. An unknown id prints a note, not an error.
   - `--only-dated` leaves out every order with no purchase date: `skippedUndated`.
   - A refund line item (negative price, text with refund / hoan tien / return, or listed in an order-level refund list) is skipped: `skippedRefundLines`. No real refund line has been seen yet.
7. Paging: the footer lists the captured list pages and the next offset not captured, for example `captured list pages: offsets 0, 5 and 10; next offset 15 not captured`.
8. Privacy: shipping name, phone, address and payment data are never read into the result and never printed. No flag shows them.

**Where:** `packages/cli/src/shopee/`: pure parsers (`paste`, `folder`, `list`, `detail`, `lines`, `join`, `money`, `format`) and a thin command (`import-orders`). Tests use synthetic fixtures only (invented names and ids, dummy secrets in fake Request sections that the tests prove are never output). Plan and design: `.digismith/board/DGS-196—shopee-import-orders/worker-dgs-196/`.

**Not verified:** the refund-line rule has no real example. The paste-text Response marker (a line that is exactly `Response`) is a guess; the folder input was run on two real exports.
