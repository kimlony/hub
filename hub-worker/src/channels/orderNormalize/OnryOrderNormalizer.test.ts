import { OnryOrderNormalizer } from "./OnryOrderNormalizer.js";
import type { RawOrderContext } from "./types.js";

const context: RawOrderContext = {
  corpId: 1,
  channelAccountId: 10,
  userId: 20,
  requestId: "request-1",
  requestKey: "request-key-1",
  sourceErp: "HUB",
  channelCd: "ONRY",
  mallKey: "ONRY"
};

describe("OnryOrderNormalizer", () => {
  it("maps an order product to the common order model", () => {
    const normalizer = new OnryOrderNormalizer();

    const order = normalizer.normalize({
      id: 101,
      order_number: "ORDER-100",
      product_code: "PRODUCT-1",
      option_uid: "OPTION-1",
      option1: "빨강",
      option2: "대형",
      product_name: "온누리 상품",
      partner_code: "PARTNER-1",
      quantity: 2,
      price: 20000,
      supply_price: 9000,
      delivery_price: 3000,
      add_delivery_price: 500,
      shipping_status: "배송중",
      order_status: "결제완료",
      ordered_at: "2026-06-29T10:00:00Z",
      paid_at: "2026-06-29T10:01:00Z",
      cancel_status: "N",
      buyer_name: "구매자",
      buyer_phone: "010-1111-2222",
      receiver_name: "수령인",
      receiver_phone: "010-3333-4444",
      receiver_zipcode: "12345",
      receiver_address1: "서울시",
      receiver_address2: "상세주소",
      delivery_message: "문 앞",
      shipping_company: "택배사",
      tracking_number: "TRACK-1"
    }, context);

    expect(order).toMatchObject({
      channelOrderId: "ORDER-100",
      orderStatus: "결제완료",
      buyerName: "구매자",
      deliveryFee: 3500,
      items: [{
        channelOrderItemId: "101",
        productId: "PRODUCT-1",
        optionName: "빨강 / 대형",
        quantity: 2,
        unitPrice: 9000
      }],
      delivery: {
        receiverName: "수령인",
        deliveryStatus: "배송중",
        trackingNumber: "TRACK-1"
      }
    });
  });

  it("prioritizes cancel status for later status synchronization", () => {
    const normalizer = new OnryOrderNormalizer();

    const order = normalizer.normalize({
      id: 102,
      order_number: "ORDER-101",
      cancel_status: "R",
      order_status: "결제완료",
      shipping_status: "배송대기"
    }, context);

    expect(order?.orderStatus).toBe("CANCEL_REQUESTED");
  });
});
