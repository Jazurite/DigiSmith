import { parsePaste, type PasteResult } from "./paste.ts";
import { parseOrderList, type ListEntry } from "./list.ts";
import { parseOrderDetail, type Order } from "./detail.ts";
import type { Summary } from "./format.ts";

export interface JoinResult extends Summary {
  orders: Order[];
  errors: string[];
  unknownSkipIds: string[]; // --skip ids that match no order in the data
}

export function joinOrders(text: string, skipIds: Iterable<string> = [], onlyDated = false): JoinResult {
  return joinBlocks(parsePaste(text), skipIds, onlyDated);
}

export function joinBlocks(parsed: PasteResult, skipIds: Iterable<string> = [], onlyDated = false): JoinResult {
  const skip = new Set(skipIds);
  const errors = [...parsed.errors];
  const ids: string[] = [];
  const details = new Map<string, Order>();
  const fromList = new Map<string, ListEntry>();
  const offsets = new Set<number>();
  const nexts = new Set<number>();
  let skippedEntries = 0;
  for (const b of [...parsed.blocks].sort((a, c) => a.n - c.n)) {
    if (b.kind === "list") {
      const list = parseOrderList(b.body);
      skippedEntries += list.skipped;
      for (const id of list.ids) if (!ids.includes(id)) ids.push(id);
      for (const [id, e] of list.entries) fromList.set(id, e);
      if (b.offset !== undefined && Number.isInteger(Number(b.offset))) offsets.add(Number(b.offset));
      if (list.nextOffset !== null && list.nextOffset > 0) nexts.add(list.nextOffset);
    } else {
      const order = parseOrderDetail(b.orderId!, b.body);
      if (order) details.set(b.orderId!, order);
      else errors.push(`block ${b.n}: not an order detail`);
    }
  }
  // Union: a detail whose order is in no list still makes a row (details-only export).
  for (const id of details.keys()) if (!ids.includes(id)) ids.push(id);
  const all = ids.map((id): Order => {
    const detail = details.get(id);
    if (detail) return detail;
    const e = fromList.get(id);
    return {
      orderId: id,
      captured: false,
      orderSn: null,
      purchasedAt: null,
      lines: e?.lines ?? [],
      total: e?.total ?? null,
      currency: null,
      statusLabel: e?.statusLabel ?? null,
      refundSkipped: e?.refundSkipped ?? 0,
      cancelled: e?.cancelled ?? false,
    };
  });
  // Cancelled orders (by the list or the detail) are left out whole.
  const cancelledIds = new Set(all.filter((o) => o.cancelled || fromList.get(o.orderId)?.cancelled).map((o) => o.orderId));
  // --skip: an id the automatic rule already dropped counts as cancelled, not as skipped by the user.
  const userSkipped = new Set(all.filter((o) => skip.has(o.orderId) && !cancelledIds.has(o.orderId)).map((o) => o.orderId));
  const kept = all.filter((o) => !cancelledIds.has(o.orderId) && !userSkipped.has(o.orderId));
  // --only-dated: drop what is left with no purchase date (no captured detail).
  const undated = onlyDated ? kept.filter((o) => !o.purchasedAt) : [];
  const orders = onlyDated ? kept.filter((o) => o.purchasedAt) : kept;
  // The list has no currency and this is Shopee VN: default to VND.
  for (const o of orders) o.currency ??= "VND";
  const sorted = [...offsets].sort((a, b) => a - b);
  return {
    orders,
    errors,
    missing: orders.filter((o) => !o.captured).length,
    skipped: errors.length,
    skippedEntries,
    skippedCancelled: cancelledIds.size,
    skippedByUser: userSkipped.size,
    skippedUndated: undated.length,
    unknownSkipIds: [...skip].filter((id) => !ids.includes(id)),
    refundSkipped: orders.reduce((s, o) => s + o.refundSkipped, 0),
    listOffsets: sorted,
    nextOffsetsNotCaptured: [...nexts].filter((n) => !offsets.has(n)).sort((a, b) => a - b),
  };
}
