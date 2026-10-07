import type { Order } from "./detail.ts";

export const MISSING = "purchase date: MISSING (detail not captured)";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const hms = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

// UTC+7 first, UTC in brackets. The bracket repeats the date only when it differs.
export function formatTime(date: Date): string {
  const local = new Date(date.getTime() + 7 * 3600_000);
  const utcPart = ymd(local) === ymd(date) ? `${hms(date)}Z` : `${ymd(date)} ${hms(date)}Z`;
  return `${ymd(local)} ${hms(local)} UTC+7 [${utcPart}]`;
}

function isoLocal(date: Date): string {
  const local = new Date(date.getTime() + 7 * 3600_000);
  return `${ymd(local)}T${hms(local)}+07:00`;
}

interface Row {
  orderId: string;
  orderSn: string;
  date: string;
  shopId: string;
  shopName: string;
  item: string;
  variant: string;
  qty: string;
  price: string;
  total: string;
  currency: string;
  status: string;
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function rows(orders: Order[]): Row[] {
  const out: Row[] = [];
  for (const o of orders) {
    const base = {
      orderId: o.orderId,
      orderSn: s(o.orderSn),
      date: o.purchasedAt ? formatTime(o.purchasedAt) : MISSING,
      total: s(o.total),
      currency: s(o.currency),
      status: s(o.statusLabel),
    };
    const lines = o.lines.length ? o.lines : [null];
    for (const l of lines) {
      out.push({
        ...base,
        shopId: s(l?.shopId),
        shopName: s(l?.shopName),
        item: s(l?.name),
        variant: s(l?.modelName),
        qty: s(l?.quantity),
        price: s(l?.unitPrice),
      });
    }
  }
  return out;
}

const COLUMNS: Array<[keyof Row, string]> = [
  ["orderId", "order id"],
  ["orderSn", "order_sn"],
  ["date", "purchase date"],
  ["shopName", "shop"],
  ["shopId", "shop id"],
  ["item", "item"],
  ["variant", "variant"],
  ["qty", "qty"],
  ["price", "unit price"],
  ["total", "order total"],
  ["currency", "cur"],
  ["status", "status"],
];

export function formatTable(orders: Order[], missing: number, skipped: number): string {
  const data = rows(orders);
  const widths = COLUMNS.map(([k, h]) => Math.max(h.length, ...data.map((r) => r[k].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  const out = [line(COLUMNS.map(([, h]) => h)), ...data.map((r) => line(COLUMNS.map(([k]) => r[k])))];
  out.push("", `orders: ${orders.length}, rows: ${data.length}, missing detail: ${missing}, skipped blocks: ${skipped}`);
  out.push("amounts are in the order currency (VND), converted from Shopee's x100000 integers");
  return out.join("\n");
}

export function formatJson(orders: Order[], missing: number, skipped: number): string {
  return JSON.stringify(
    {
      orders: orders.map((o) => ({
        orderId: o.orderId,
        orderSn: o.orderSn,
        purchasedAt: o.purchasedAt ? { utc7: isoLocal(o.purchasedAt), utc: o.purchasedAt.toISOString() } : null,
        purchaseDateMissing: !o.purchasedAt,
        lines: o.lines,
        total: o.total,
        currency: o.currency,
        status: o.statusLabel,
      })),
      summary: { orders: orders.length, missingDetail: missing, skippedBlocks: skipped },
    },
    null,
    2
  );
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function formatCsv(orders: Order[]): string {
  const data = rows(orders);
  return [COLUMNS.map(([, h]) => h), ...data.map((r) => COLUMNS.map(([k]) => r[k]))]
    .map((cells) => cells.map(csvCell).join(","))
    .join("\n");
}
