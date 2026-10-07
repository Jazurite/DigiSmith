import { toVnd } from "./money.ts";
import { obj, str, num, parseCards, refundIds, type OrderLine } from "./lines.ts";

export type { OrderLine };

export interface Order {
  orderId: string;
  captured: boolean; // true when a detail was captured (it alone gives the purchase date)
  orderSn: string | null;
  purchasedAt: Date | null;
  lines: OrderLine[];
  total: number | null;
  currency: string | null;
  statusLabel: string | null;
  refundSkipped: number;
}

// Allow-list: only the fields below are read. Shipping and payment fields are
// never copied into the result.
export function parseOrderDetail(orderId: string, body: unknown): Order | null {
  const data = obj(obj(body)?.data);
  if (!data) return null;
  const processing = obj(data.pc_processing_info);
  const createTime = num(processing?.create_time);
  const card = obj(data.info_card);
  const parsed = parseCards(card?.parcel_cards, refundIds(data, card));
  if (createTime === null && parsed.lines.length === 0 && parsed.refundSkipped === 0) return null;
  const status = obj(data.status);
  return {
    orderId,
    captured: true,
    orderSn: str(processing?.order_sn),
    purchasedAt: createTime === null ? null : new Date(createTime * 1000),
    lines: parsed.lines,
    total: toVnd(card?.final_total) ?? parsed.paid,
    currency: str(card?.currency) ?? parsed.currency,
    statusLabel: str(obj(status?.status_label)?.text) ?? str(obj(status?.list_view_status_label)?.text),
    refundSkipped: parsed.refundSkipped,
  };
}
