import { toVnd } from "./money.ts";

export interface OrderLine {
  shopId: number | null;
  shopName: string | null;
  name: string;
  modelName: string;
  quantity: number;
  unitPrice: number | null;
}

export interface Order {
  orderId: string;
  captured: boolean;
  orderSn: string | null;
  purchasedAt: Date | null;
  lines: OrderLine[];
  total: number | null;
  currency: string | null;
  statusLabel: string | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

// Allow-list: only the fields below are read. Shipping and payment fields are
// never copied into the result.
export function parseOrderDetail(orderId: string, body: unknown): Order | null {
  const data = obj(obj(body)?.data);
  if (!data) return null;
  const processing = obj(data.pc_processing_info);
  const createTime = num(processing?.create_time);
  const card = obj(data.info_card);
  const lines: OrderLine[] = [];
  let parcelCurrency: string | null = null;
  let parcelTotal: number | null = null;
  for (const p of arr(card?.parcel_cards)) {
    const parcel = obj(p);
    const shop = obj(parcel?.shop_info);
    const pay = obj(parcel?.payment_info);
    parcelCurrency ??= str(pay?.currency);
    parcelTotal = (parcelTotal ?? 0) + (num(pay?.total_price) ?? 0);
    for (const g of arr(obj(parcel?.product_info)?.item_groups)) {
      for (const it of arr(obj(g)?.items)) {
        const item = obj(it);
        if (!item) continue;
        lines.push({
          shopId: num(shop?.shop_id),
          shopName: str(shop?.shop_name),
          name: str(item.name) ?? "",
          modelName: str(item.model_name) ?? "",
          quantity: num(item.amount) ?? 0,
          unitPrice: toVnd(item.item_price),
        });
      }
    }
  }
  if (createTime === null && lines.length === 0) return null;
  const status = obj(data.status);
  return {
    orderId,
    captured: true,
    orderSn: str(processing?.order_sn),
    purchasedAt: createTime === null ? null : new Date(createTime * 1000),
    lines,
    total: toVnd(card?.final_total) ?? toVnd(parcelTotal),
    currency: str(card?.currency) ?? parcelCurrency,
    statusLabel: str(obj(status?.status_label)?.text) ?? str(obj(status?.list_view_status_label)?.text),
  };
}
