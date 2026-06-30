import { WchanOrderNormalizer } from "./WchanOrderNormalizer.js";
import type { RawOrderContext } from "./types.js";

const context: RawOrderContext = {
  corpId: 1,
  channelAccountId: 10,
  userId: 20,
  requestId: "request-1",
  requestKey: "request-key-1",
  sourceErp: "HUB",
  channelCd: "WCHAN",
  mallKey: "WCHAN"
};

describe("WchanOrderNormalizer", () => {
  it("maps a WCHAN order row to the common order model", () => {
    const normalizer = new WchanOrderNormalizer();

    const order = normalizer.normalize({
      rdmg_code: "00049921",
      rdmg_index: 3,
      rdmg_order_date: "2026-06-12",
      rdmg_order_status: 2,
      rdmg_price: 1500,
      rdmg_delivery_cost: 3000,
      rdmg_buy_amount: 2,
      rdmg_payment_composition: "V",
      gdmg_code: "00894903",
      gdmg_goods_name: "테스트 상품",
      gdmg_mange_code: "SELLER-001",
      gdmg_support_price: 750,
      rdmg_contents: "옵션 정보",
      lmmf_name: "구매 회원",
      mbgr_hp: "010-1111-2222",
      rddr_name: "수령인"
    }, context);

    expect(order).toMatchObject({
      channelOrderId: "00049921",
      orderStatus: "결제완료",
      buyerName: "구매 회원",
      buyerTel: "010-1111-2222",
      orderAmount: 1500,
      deliveryFee: 3000,
      items: [{
        channelOrderItemId: "00049921-3",
        productId: "00894903",
        productName: "테스트 상품",
        quantity: 2,
        unitPrice: 750
      }],
      delivery: {
        receiverName: "수령인",
        deliveryStatus: "결제완료"
      }
    });
    expect(order?.orderDate?.toISOString()).toBe("2026-06-12T00:00:00.000Z");
  });

  it("returns null when the channel order ID is missing", () => {
    const normalizer = new WchanOrderNormalizer();

    expect(normalizer.normalize({ rdmg_order_status: 2 }, context)).toBeNull();
  });
});
