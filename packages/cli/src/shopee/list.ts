// Order ids from one list response. Real shape: new_data.order_or_checkout_data[]
// .order_list_detail.info_card.order_id. An entry with no order_list_detail is
// counted as skipped. The older guess (any order_id under data, numeric
// index_list) stays as a fallback when new_data is absent.
export interface ListResult {
  ids: string[];
  skipped: number;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
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
  const entries = obj(root?.new_data)?.order_or_checkout_data;
  const ids: string[] = [];
  let skipped = 0;
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const id = asId(obj(obj(obj(e)?.order_list_detail)?.info_card)?.order_id);
      if (id) ids.push(id);
      else skipped++;
    }
  } else {
    const data = root?.data;
    collect(data, ids);
    const index = obj(data)?.index_list;
    if (Array.isArray(index)) for (const v of index) if (typeof v === "number") ids.push(String(v));
  }
  return { ids: [...new Set(ids)], skipped };
}
