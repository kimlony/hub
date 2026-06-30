import { CoupangOrderNormalizer } from "./CoupangOrderNormalizer.js";
import { FlatCommerceOrderNormalizer } from "./FlatCommerceOrderNormalizer.js";
import { GiftOrderNormalizer } from "./GiftOrderNormalizer.js";
import { NormalizerRegistry } from "./NormalizerRegistry.js";
import { SmartstoreOrderNormalizer } from "./SmartstoreOrderNormalizer.js";
import type { RawOrderContext } from "./types.js";

const context: RawOrderContext = {
  corpId: 1,
  channelAccountId: 1,
  userId: 1,
  requestId: "source-001",
  requestKey: "SOURCE_001",
  sourceErp: "HUB",
  channelCd: "GCHAN",
  mallKey: "GCHAN"
};

describe("order normalizers", () => {
  it("routes each channel to its dedicated normalizer", () => {
    const registry = new NormalizerRegistry();

    expect(registry.get("NSS")).toBeInstanceOf(SmartstoreOrderNormalizer);
    expect(registry.get("COUPANG")).toBeInstanceOf(CoupangOrderNormalizer);
    expect(registry.get("GCHAN")).toBeInstanceOf(GiftOrderNormalizer);
    expect(registry.get("11ST")).toBeInstanceOf(FlatCommerceOrderNormalizer);
    expect(registry.get("GODO")).toBeInstanceOf(FlatCommerceOrderNormalizer);
  });

  it("normalizes smartstore-style nested orders into the standard order model", () => {
    const normalizer = new SmartstoreOrderNormalizer();

    // Portfolio note: this guards the core promise of the system. Channel raw
    // payloads can differ, but downstream export APIs should receive one stable
    // normalized order shape.
    const order = normalizer.normalize({
      order: {
        orderId: "MOCKNAVERORDER001",
        orderDate: "2026-06-08T09:10:00+09:00",
        paymentDate: "2026-06-08T09:12:00+09:00",
        ordererName: "Naver Buyer",
        ordererTel: "010-0000-0001",
        paymentMeans: "CARD"
      },
      productOrder: {
        productOrderId: "MOCKNAVERITEM001",
        productOrderStatus: "PAYED",
        productId: "MOCKNAVERPRODUCT001",
        sellerProductCode: "MOCKNAVERSKU001",
        productName: "Naver Mock Product",
        productOption: "Color: Black / Size: M",
        quantity: 2,
        unitPrice: 21000,
        totalPaymentAmount: 42000,
        discountAmount: 1000,
        expectedSettlementAmount: 41000,
        deliveryStatus: "READY",
        shippingAddress: {
          name: "Naver Receiver",
          tel1: "010-0000-0002",
          zipCode: "00000",
          baseAddress: "Sample City",
          detailedAddress: "Sample Detail",
          shippingMemo: "Leave at door"
        }
      }
    }, { ...context, channelCd: "NSS", mallKey: "NSS" });

    expect(order?.channelOrderId).toBe("MOCKNAVERORDER001");
    expect(order?.orderStatus).toBe("PAYED");
    expect(order?.buyerName).toBe("Naver Buyer");
    expect(order?.paymentMethod).toBe("CARD");
    expect(order?.productAmount).toBe(21000);
    expect(order?.items).toHaveLength(1);
    expect(order?.items[0]).toMatchObject({
      channelOrderItemId: "MOCKNAVERITEM001",
      productId: "MOCKNAVERPRODUCT001",
      sellerProductCode: "MOCKNAVERSKU001",
      productName: "Naver Mock Product",
      quantity: 2,
      itemAmount: 42000,
      expectedSettlementAmount: 41000
    });
    expect(order?.delivery).toMatchObject({
      receiverName: "Naver Receiver",
      receiverTel: "010-0000-0002",
      receiverAddr1: "Sample City",
      deliveryStatus: "READY"
    });
  });

  it("normalizes gift-style GCHAN recipient orders", () => {
    const normalizer = new GiftOrderNormalizer();
    const order = normalizer.normalize({
      orderCode: "MOCKGCHANORDER001",
      recipientId: 1,
      itemId: 50,
      recipientName: "Gift Receiver",
      recipientPhone: "01000000000",
      receivedStatus: "RECEIVED",
      giftSupplyPrice: 35000,
      senderFullName: "Gift Sender",
      paidAt: "2026-04-01T09:55:00",
      paymentStatus: "PAID",
      paymentMethod: "CARD",
      trackingNumber: "MOCKTRACK0001",
      carrierCode: "Sample Logistics",
      orderDeliveryStatus: "SHIPPING"
    }, context);

    expect(order?.channelOrderId).toBe("MOCKGCHANORDER001");
    expect(order?.buyerName).toBe("Gift Sender");
    expect(order?.items[0].channelOrderItemId).toBe("recipient-1-item-50");
    expect(order?.delivery?.receiverName).toBe("Gift Receiver");
  });

  it("normalizes Coupang shipment-box style orders", () => {
    const normalizer = new CoupangOrderNormalizer();
    const order = normalizer.normalize({
      shipmentBoxId: "MOCKSHIPBOX001",
      orderId: "MOCKCOUPANGORDER001",
      orderedAt: "2026-06-08T11:17:13+09:00",
      paidAt: "2026-06-08T11:18:13+09:00",
      orderer: { name: "Coupang Buyer", email: "buyer@example.com", safeNumber: "010-1000-0022" },
      receiver: { name: "Coupang Receiver", safeNumber: "010-0000-0022", addr1: "Sample City" },
      orderItems: [
        {
          vendorItemId: "MOCKCOUPANGITEM001",
          sellerProductId: "MOCKCOUPANGPRODUCT001",
          vendorItemName: "Coupang Mock Product",
          shippingCount: 1
        }
      ]
    }, { ...context, channelCd: "COUPANG", mallKey: "COUPANG" });

    expect(order?.channelOrderId).toBe("MOCKCOUPANGORDER001");
    expect(order?.buyerName).toBe("Coupang Buyer");
    expect(order?.items[0].channelOrderItemId).toBe("MOCKCOUPANGITEM001");
    expect(order?.delivery?.receiverName).toBe("Coupang Receiver");
  });

  it("normalizes flat commerce orders used by 11ST and GODO", () => {
    const normalizer = new FlatCommerceOrderNormalizer();
    const order = normalizer.normalize({
      ordNo: "MOCK11STORDER001",
      ordDt: "2026-06-08 10:07:11",
      ordNm: "11ST Buyer",
      ordPrtblTel: "010-0000-0011",
      ordPayAmt: 16310,
      ordAmt: 19000,
      paymentMethod: "CARD",
      rcvrNm: "11ST Receiver",
      rcvrPrtblNo: "010-0000-0012",
      rcvrMailNo: "00000",
      rcvrBaseAddr: "Sample City",
      rcvrDtlsAddr: "Sample Detail",
      orderItems: [{
        ordPrdSeq: "1",
        prdNo: "MOCK11STPRODUCT001",
        sellerPrdCd: "MOCK11STSKU001",
        prdNm: "11ST Mock Product",
        slctPrdOptNm: "Size: S / Color: Ivory",
        ordQty: 1,
        goodsPrice: 19000
      }]
    }, { ...context, channelCd: "11ST", mallKey: "11ST" });

    expect(order?.channelOrderId).toBe("MOCK11STORDER001");
    expect(order?.buyerName).toBe("11ST Buyer");
    expect(order?.orderAmount).toBe(16310);
    expect(order?.productAmount).toBe(19000);
    expect(order?.items[0]).toMatchObject({
      channelOrderItemId: "1",
      productId: "MOCK11STPRODUCT001",
      sellerProductCode: "MOCK11STSKU001",
      productName: "11ST Mock Product",
      quantity: 1,
      unitPrice: 19000
    });
    expect(order?.delivery).toMatchObject({
      receiverName: "11ST Receiver",
      receiverTel: "010-0000-0012",
      receiverZipCode: "00000",
      receiverAddr1: "Sample City"
    });
  });

  it("skips raw orders without a channel order id", () => {
    const smartstore = new SmartstoreOrderNormalizer();
    const flatCommerce = new FlatCommerceOrderNormalizer();

    expect(smartstore.normalize({ productOrder: { productOrderId: "ITEM_ONLY" } }, { ...context, channelCd: "NSS" })).toBeNull();
    expect(flatCommerce.normalize({ buyerName: "Missing Order Id" }, { ...context, channelCd: "11ST" })).toBeNull();
  });
});
