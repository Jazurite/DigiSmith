// Reads pasted Proxyman "copy" text. Only the URL line and the response JSON
// body of each block are kept. The Request section is skipped by position and
// never copied, so nothing from it can reach output or an error.
export interface PasteBlock {
  n: number;
  kind: "list" | "detail";
  orderId?: string;
  offset?: string;
  body: unknown;
}

export interface PasteResult {
  blocks: PasteBlock[];
  errors: string[];
}

const BLOCK_START = /^\[(\d+)\] URL = (\S+)/;
const RESPONSE_MARKER = /^Response\s*$/;
const LIST_PATH = "/api/v4/order/get_all_order_and_checkout_list";
const DETAIL_PATH = "/api/v4/order/get_order_detail";

export function classify(url: URL): PasteBlock["kind"] | null {
  return url.pathname === LIST_PATH ? "list" : url.pathname === DETAIL_PATH ? "detail" : null;
}

// Shared by the paste and folder readers: raw is the response body text only.
export function buildBlock(
  n: number,
  kind: PasteBlock["kind"],
  url: URL,
  raw: string,
  errors: string[]
): PasteBlock | null {
  const text = raw.trim();
  if (!text) {
    errors.push(`block ${n}: no JSON body`);
    return null;
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    errors.push(`block ${n}: body is not JSON`);
    return null;
  }
  const orderId = url.searchParams.get("order_id") ?? undefined;
  if (kind === "detail" && !orderId) {
    errors.push(`block ${n}: no order_id in URL`);
    return null;
  }
  return { n, kind, orderId, offset: url.searchParams.get("offset") ?? undefined, body };
}

export function parsePaste(text: string): PasteResult {
  const lines = text.split(/\r?\n/);
  const starts: number[] = [];
  lines.forEach((line, i) => {
    if (BLOCK_START.test(line)) starts.push(i);
  });
  const blocks: PasteBlock[] = [];
  const errors: string[] = [];

  starts.forEach((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
    const m = BLOCK_START.exec(lines[start])!;
    const n = Number(m[1]);

    let url: URL;
    try {
      url = new URL(m[2]);
    } catch {
      errors.push(`block ${n}: bad URL line`);
      return;
    }
    const kind = classify(url);
    if (!kind) return; // some other call in the paste: ignored

    let marker = -1;
    for (let i = start + 1; i < end; i++) {
      if (RESPONSE_MARKER.test(lines[i])) {
        marker = i;
        break;
      }
    }
    if (marker < 0) {
      errors.push(`block ${n}: no Response section`);
      return;
    }
    let blank = -1;
    for (let i = marker + 1; i < end; i++) {
      if (lines[i].trim() === "") {
        blank = i;
        break;
      }
    }
    const raw = blank < 0 ? "" : lines.slice(blank + 1, end).join("\n");
    const built = buildBlock(n, kind, url, raw, errors);
    if (built) blocks.push(built);
  });

  return { blocks, errors };
}
