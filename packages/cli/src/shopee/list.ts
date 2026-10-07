// Order ids from one list response. The exact shape is a guess until a real
// paste confirms it: any `order_id` under `data`, plus a numeric `index_list`.
function collect(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((x) => collect(x, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "order_id" && (typeof v === "number" || typeof v === "string")) out.push(String(v));
      else collect(v, out);
    }
  }
}

export function parseOrderList(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data;
  const ids: string[] = [];
  collect(data, ids);
  const index = (data as { index_list?: unknown } | undefined)?.index_list;
  if (Array.isArray(index)) for (const v of index) if (typeof v === "number") ids.push(String(v));
  return [...new Set(ids)];
}
