**Status:** Not applied. Ordered 2026-10-07 ~21:3x UTC+7 [14:3xZ] by the Master (Jack chose "option 1"). ClickUp: DGS-196 (`14zcebrv55w`, list C.2: CLI, backlog).

**Source:** Jack wants a list of his own Shopee VN purchases (buyer side, shopee.vn) inside `dg`. He records the Shopee web app's own calls with Proxyman. The module reads those captures, the same pattern as the ClickUp Frontdoor captures (`~/.digismith-depot/captures/`).

**Decided, do not reopen:** no live call to Shopee. Its web calls carry per-request signed anti-bot headers (`af-ac-enc-dat`, `x-sap-sec`, `x-sap-ri`, the `sz` token). Forging them bypasses Shopee's anti-bot protection: out of scope. There is no official buyer API (the Open Platform API is seller-side) and no app credentials.

**Behavior:** `dg shopee import-orders <capture-folder-or-file>` (the name may change in the plan).
1. List responses: `GET /api/v4/order/get_all_order_and_checkout_list` (paged with `limit` and `offset`). Take every order.
2. Detail responses: `GET /api/v4/order/get_order_detail?order_id=<id>`. Match on the `order_id` in the request URL.
3. Purchase date = the detail's `data.pc_processing_info.create_time` (epoch seconds), not the list's update time. No detail captured: mark the row `purchase date: MISSING (detail not captured)`, never fall back silently, and print the count.
4. Output: table by default, `--json`, `--csv`. Columns: order id, `order_sn`, purchase date, shop name and id, one row per line item (name, `model_name`, `amount`, `item_price`), order total, currency, status label. Shopee sends money times 100000: convert and say so in the help text. Times UTC+7 first, UTC in brackets; ISO in JSON.
5. Privacy: never output shipping name, phone, address or payment details. No flag to print them.
6. Read request lines and response bodies only. Never read, print, copy or log request headers, cookies or tokens.

**Where:** `packages/cli/src/shopee/` with pure parsers and a thin command, or a `packages/shopee-client` like the ClickUp client (the plan decides). Tests on synthetic fixtures only (invented names and ids).

**To do:** brainstorm (short), plan, TDD. Checkpoint 1 (design and plan) and checkpoint 3 (diff). The Proxyman export goes in `~/.digismith-depot/captures/` (outside the repo).
