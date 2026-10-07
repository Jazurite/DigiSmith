import { toVnd } from "./money.ts";
import { obj, str, parseCards, refundIds, type OrderLine } from "./lines.ts";

// Order ids from one list response. Real shape: new_data.order_or_checkout_data[]
// .order_list_detail.info_card.order_id. An entry with no order_list_detail is
// counted as skipped. The older guess (any order_id under data, numeric
// index_list) stays as a fallback when new_data is absent.
// The list also carries lines, total and status, so an order with no detail
// still prints its items. Only the purchase date needs the detail.
export interface ListEntry {
  id: string;
  lines: OrderLine[];
  refundSkipped: number;
  total: number | null;
  statusLabel: string | null;
}

export interface ListResult {
  ids: string[];
  skipped: number;
  nextOffset: number | null;
  entries: Map<string, ListEntry>;
}

const asId = (v: unknown): string | null =>
  typeof v === "number" || (typeof v === "string" && v !== "") ? String(v) : null;

function collect(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((x) => collect(x, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const id = k === "order_id" ? asId(v) : null;
      if (id) out.push(id);
      else collect(v, out);
    }
  }
}

export function parseOrderList(body: unknown): ListResult {
  const root = obj(body);
  const newData = obj(root?.new_data);
  const entries = new Map<string, ListEntry>();
  const ids: string[] = [];
  let skipped = 0;
  const next = newData?.next_offset;
  const nextOffset = typeof next === "number" && Number.isInteger(next) ? next : null;
  if (Array.isArray(newData?.order_or_checkout_data)) {
    for (const e of newData.order_or_checkout_data) {
      const detail = obj(obj(e)?.order_list_detail);
      const card = obj(detail?.info_card);
      const id = asId(card?.order_id);
      if (!id) {
        skipped++;
        continue;
      }
      ids.push(id);
      const parsed = parseCards(card?.order_list_cards, refundIds(detail, card));
      const status = obj(detail?.status);
      entries.set(id, {
        id,
        lines: parsed.lines,
        refundSkipped: parsed.refundSkipped,
        total: toVnd(card?.final_total),
        statusLabel: str(obj(status?.status_label)?.text) ?? str(obj(status?.list_view_status_label)?.text),
      });
    }
  } else {
    const data = root?.data;
    collect(data, ids);
    const index = obj(data)?.index_list;
    if (Array.isArray(index)) for (const v of index) if (typeof v === "number") ids.push(String(v));
  }
  return { ids: [...new Set(ids)], skipped, nextOffset, entries };
}
