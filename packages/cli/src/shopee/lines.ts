import { toVnd } from "./money.ts";

export interface OrderLine {
  shopId: number | null;
  shopName: string | null;
  name: string;
  modelName: string;
  quantity: number;
  unitPrice: number | null;
}

type Obj = Record<string, unknown>;
export const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
export const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

// Refund rule (defensive, no real refund line seen yet): skip a line whose price
// is negative, whose text contains refund / hoan tien / return, or whose item_id
// is in an order-level refund list. Plain flags such as is_refundable_sample and
// is_free_return are never read.
const REFUND_TEXT = /refund|ho[aà]n ti[eề]n|return/i;

function isRefundLine(item: Obj, refundItemIds: Set<number>): boolean {
  const prices = [num(item.item_price), num(item.order_price)];
  if (prices.some((p) => p !== null && p < 0)) return true;
  const itemId = num(item.item_id);
  if (itemId !== null && refundItemIds.has(itemId)) return true;
  return ["name", "model_name", "name_tr", "model_name_tr"].some((k) => REFUND_TEXT.test(str(item[k]) ?? ""));
}

// A bundle is ONE line at the bundle price. Its parts only supply the name.
function itemName(item: Obj): string {
  const parts = arr(obj(obj(item.ext_info)?.bundle_order)?.bundle_deal_items)
    .map((p) => str(obj(p)?.name))
    .filter((n): n is string => !!n);
  return parts.length ? parts.join(" + ") : (str(item.name) ?? "");
}

// Cards are detail parcel_cards or list order_list_cards: same inner shape.
export function parseCards(cards: unknown, refundItemIds: Set<number> = new Set()) {
  const lines: OrderLine[] = [];
  let refundSkipped = 0;
  let currency: string | null = null;
  let paid: number | null = null;
  for (const c of arr(cards)) {
    const card = obj(c);
    const shop = obj(card?.shop_info);
    const pay = obj(card?.payment_info);
    currency ??= str(pay?.currency);
    if (num(pay?.total_price) !== null) paid = (paid ?? 0) + (num(pay?.total_price) as number);
    for (const g of arr(obj(card?.product_info)?.item_groups)) {
      for (const it of arr(obj(g)?.items)) {
        const item = obj(it);
        if (!item) continue;
        if (isRefundLine(item, refundItemIds)) {
          refundSkipped++;
          continue;
        }
        lines.push({
          shopId: num(shop?.shop_id),
          shopName: str(shop?.shop_name),
          name: itemName(item),
          modelName: str(item.model_name) ?? "",
          quantity: num(item.amount) ?? 0,
          unitPrice: toVnd(item.item_price),
        });
      }
    }
  }
  return { lines, refundSkipped, currency, paid: toVnd(paid) };
}

// Ids from any array under a key that contains "refund" (order-level refund list).
export function refundIds(...nodes: unknown[]): Set<number> {
  const ids = new Set<number>();
  for (const n of nodes) {
    for (const [k, v] of Object.entries(obj(n) ?? {})) {
      if (!/refund/i.test(k) || !Array.isArray(v)) continue;
      for (const e of v) {
        const id = num(obj(e)?.item_id);
        if (id !== null) ids.add(id);
      }
    }
  }
  return ids;
}
