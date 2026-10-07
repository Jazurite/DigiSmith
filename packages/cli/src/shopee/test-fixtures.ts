// Synthetic Proxyman-copy text. Every value is invented. The Request sections
// hold dummy secrets so tests can prove they are never output.
export const DUMMY_SECRETS = [
  "DUMMY-COOKIE-DO-NOT-LEAK",
  "DUMMY-CSRF-DO-NOT-LEAK",
  "DUMMY-SAP-SEC-DO-NOT-LEAK",
  "DUMMY-AF-AC-ENC-DO-NOT-LEAK",
  "DUMMY-REQUEST-BODY-DO-NOT-LEAK",
];

export const FAKE_PRIVATE = ["Fake Buyer Name", "0900000000", "1 Fake Street, Fake City", "FAKE-CARD-0000"];

export function requestSection(method: string, urlPath: string): string {
  return [
    "Request",
    `${method} ${urlPath} HTTP/2`,
    "Host: shopee.vn",
    `Cookie: session=${DUMMY_SECRETS[0]}`,
    `X-CSRFToken: ${DUMMY_SECRETS[1]}`,
    `x-sap-sec: ${DUMMY_SECRETS[2]}`,
    `af-ac-enc-dat: ${DUMMY_SECRETS[3]}`,
    "",
    `{"note":"${DUMMY_SECRETS[4]}"}`,
  ].join("\n");
}

export function block(n: number, url: string, body: unknown, status = 200): string {
  const u = new URL(url);
  return [
    `[${n}] URL = ${url}`,
    requestSection("GET", u.pathname + u.search),
    "",
    "Response",
    `HTTP/2 ${status}`,
    "content-type: application/json",
    "",
    typeof body === "string" ? body : JSON.stringify(body),
    "",
  ].join("\n");
}

export const CANCELLED_STATUS = {
  status_label: { text: "label_order_cancelled" },
  header_text: { text: "order_status_text_cancelled_order_cancelled_refund" },
  list_view_status_label: { text: "label_cancelled" },
};

export const item = (over: Record<string, unknown> = {}) => ({
  item_id: 9,
  model_id: 9,
  name: "Plain item",
  model_name: "",
  amount: 1,
  item_price: 1000000000,
  order_price: 1000000000,
  ext_info: { is_free_return: true, is_refundable_sample: false, free_return_day: 15 },
  ...over,
});

// A bundle: placeholder item_id, bundle price on the item, parts with their own prices.
export const bundleItem = () =>
  item({
    item_id: 1,
    name: "Bundle placeholder",
    item_price: 27733800000,
    ext_info: {
      bundle_order: {
        bundle_deal_id: 55,
        price_before_bundle: 28299800000,
        bundle_deal_items: [
          { item_id: 21, name: "Part A", item_price: 12999900000, is_refundable_sample: false },
          { item_id: 22, name: "Part B", item_price: 15299900000, is_refundable_sample: false },
        ],
      },
    },
  });

export const card = (groups: unknown[][], shop = { shop_id: 111, shop_name: "Fake Shop" }) => ({
  shop_info: shop,
  product_info: { item_groups: groups.map((items) => ({ items })) },
});

export function listBody(orderIds: Array<number | string>, opts: { nextOffset?: number; cards?: unknown[]; cancelledIds?: Array<number | string> } = {}) {
  return {
    error: 0,
    error_msg: null,
    new_data: {
      ...(opts.nextOffset === undefined ? {} : { next_offset: opts.nextOffset }),
      order_or_checkout_data: orderIds.map((id) => ({
        order_list_detail: {
          status: (opts.cancelledIds ?? []).map(String).includes(String(id))
            ? CANCELLED_STATUS
            : { status_label: { text: "Completed" }, list_view_status_label: { text: "Done" } },
          shipping: { tracking_info: { ctime: 1791400000 } },
          info_card: { order_id: Number(id), order_list_cards: opts.cards ?? [], product_count: 1, subtotal: 100000, final_total: 100000 },
        },
      })),
    },
  };
}

export function detailBody(opts: { createTime?: number; sn?: string; shopId?: number; shopName?: string; cancelled?: boolean } = {}) {
  const { createTime = 1791338198, sn = "SN0001", shopId = 111, shopName = "Fake Shop" } = opts;
  return {
    error: 0,
    data: {
      status: opts.cancelled ? CANCELLED_STATUS : { status_label: { text: "Completed" }, list_view_status_label: { text: "Done" } },
      pc_processing_info: { create_time: createTime, pay_time: createTime + 60, order_sn: sn, paid_amount: 43141700000 },
      address: { shipping_name: FAKE_PRIVATE[0], shipping_phone: FAKE_PRIVATE[1], shipping_address: FAKE_PRIVATE[2] },
      payment: { card: FAKE_PRIVATE[3] },
      info_card: {
        subtotal: 43141700000,
        final_total: 43141700000,
        currency: "VND",
        parcel_cards: [
          {
            forder_id: 1,
            shop_info: { shop_id: shopId, shop_name: shopName },
            payment_info: { currency: "VND", total_price: 43141700000 },
            product_info: {
              item_groups: [
                {
                  items: [
                    { item_id: 1, model_id: 2, name: "Widget, large", model_name: "Blue \"XL\"", amount: 2, item_price: 20000000000, order_price: 20000000000 },
                    { item_id: 3, model_id: 4, name: "Gadget", model_name: "", amount: 1, item_price: 3141700000, order_price: 3141700000 },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  };
}

export const LIST_URL = (offset = 0) =>
  `https://shopee.vn/api/v4/order/get_all_order_and_checkout_list?limit=5&offset=${offset}`;
export const DETAIL_URL = (id: number | string) =>
  `https://shopee.vn/api/v4/order/get_order_detail?_oft=2048&order_id=${id}`;
