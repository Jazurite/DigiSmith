import { parsePaste, type PasteResult } from "./paste.ts";
import { parseOrderList } from "./list.ts";
import { parseOrderDetail, type Order } from "./detail.ts";

export interface JoinResult {
  orders: Order[];
  missing: number;
  errors: string[];
  hasList: boolean;
}

export function joinOrders(text: string): JoinResult {
  return joinBlocks(parsePaste(text));
}

export function joinBlocks(parsed: PasteResult): JoinResult {
  const { blocks } = parsed;
  const errors = [...parsed.errors];
  const ids: string[] = [];
  const details = new Map<string, Order>();
  let hasList = false;
  for (const b of [...blocks].sort((a, c) => a.n - c.n)) {
    if (b.kind === "list") {
      hasList = true;
      for (const id of parseOrderList(b.body)) if (!ids.includes(id)) ids.push(id);
    } else {
      const order = parseOrderDetail(b.orderId!, b.body);
      if (order) details.set(b.orderId!, order);
      else errors.push(`block ${b.n}: not an order detail`);
    }
  }
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
  return { orders, missing: orders.filter((o) => !o.captured).length, errors, hasList };
}
