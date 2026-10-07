import { parsePaste, type PasteResult } from "./paste.ts";
import { parseOrderList } from "./list.ts";
import { parseOrderDetail, type Order } from "./detail.ts";

export interface JoinResult {
  orders: Order[];
  missing: number;
  errors: string[];
  skippedEntries: number;
}

export function joinOrders(text: string): JoinResult {
  return joinBlocks(parsePaste(text));
}

export function joinBlocks(parsed: PasteResult): JoinResult {
  const { blocks } = parsed;
  const errors = [...parsed.errors];
  const ids: string[] = [];
  const details = new Map<string, Order>();
  let skippedEntries = 0;
  for (const b of [...blocks].sort((a, c) => a.n - c.n)) {
    if (b.kind === "list") {
      const list = parseOrderList(b.body);
      skippedEntries += list.skipped;
      for (const id of list.ids) if (!ids.includes(id)) ids.push(id);
    } else {
      const order = parseOrderDetail(b.orderId!, b.body);
      if (order) details.set(b.orderId!, order);
      else errors.push(`block ${b.n}: not an order detail`);
    }
  }
  // Union: a detail whose order is in no list still makes a row (details-only export).
  for (const id of details.keys()) if (!ids.includes(id)) ids.push(id);
  const orders = ids.map(
    (id): Order =>
      details.get(id) ?? {
        orderId: id,
        captured: false,
        orderSn: null,
        purchasedAt: null,
        lines: [],
        total: null,
        currency: null,
        statusLabel: null,
      }
  );
  return { orders, missing: orders.filter((o) => !o.captured).length, errors, skippedEntries };
}
