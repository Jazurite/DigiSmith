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

export function listBody(orderIds: Array<number | string>) {
  return {
    error: 0,
    data: {
      details_list: orderIds.map((id) => ({ info_card: { order_card: { order_id: Number(id) } } })),
    },
  };
}

export function detailBody(opts: { createTime?: number; sn?: string; shopId?: number; shopName?: string } = {}) {
  const { createTime = 1791338198, sn = "SN0001", shopId = 111, shopName = "Fake Shop" } = opts;
  return {
    error: 0,
    data: {
      status: { status_label: { text: "Completed" }, list_view_status_label: { text: "Done" } },
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
