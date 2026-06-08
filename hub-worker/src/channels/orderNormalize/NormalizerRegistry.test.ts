import { CoupangOrderNormalizer } from "./CoupangOrderNormalizer.js";
import { GiftOrderNormalizer } from "./GiftOrderNormalizer.js";
import { NormalizerRegistry } from "./NormalizerRegistry.js";
import { SmartstoreOrderNormalizer } from "./SmartstoreOrderNormalizer.js";
import type { RawOrderContext } from "./types.js";

const context: RawOrderContext = {
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
  });

  it("normalizes gift-style GCHAN recipient orders", () => {
    const normalizer = new GiftOrderNormalizer();
    const order = normalizer.normalize({
      orderCode: "S20260329000001",
      recipientId: 1,
      itemId: 50,
      recipientName: "Gift Receiver",
      recipientPhone: "01012345678",
      receivedStatus: "RECEIVED",
      giftSupplyPrice: 35000,
      senderFullName: "Gift Sender",
      paidAt: "2026-04-01T09:55:00",
      paymentStatus: "PAID",
      paymentMethod: "CARD",
      trackingNumber: "1234567890",
      carrierCode: "CJ Logistics",
      orderDeliveryStatus: "SHIPPING"
    }, context);

    expect(order?.channelOrderId).toBe("S20260329000001");
    expect(order?.buyerName).toBe("Gift Sender");
    expect(order?.items[0].channelOrderItemId).toBe("recipient-1-item-50");
    expect(order?.delivery?.receiverName).toBe("Gift Receiver");
  });

  it("normalizes Coupang shipment-box style orders", () => {
    const normalizer = new CoupangOrderNormalizer();
    const order = normalizer.normalize({
      shipmentBoxId: "642538970006401429",
      orderId: "22000009546234",
      orderedAt: "2026-06-08T11:17:13+09:00",
      paidAt: "2026-06-08T11:18:13+09:00",
      orderer: { name: "Coupang Buyer", email: "buyer@example.com", safeNumber: "010-1000-0022" },
      receiver: { name: "Coupang Receiver", safeNumber: "010-2000-0022", addr1: "Gyeonggi Osan-si" },
      orderItems: [
        {
          vendorItemId: "3242596358",
          sellerProductId: "80240831",
          vendorItemName: "Coupang Mock Product",
          shippingCount: 1
        }
      ]
    }, { ...context, channelCd: "COUPANG", mallKey: "COUPANG" });

    expect(order?.channelOrderId).toBe("22000009546234");
    expect(order?.buyerName).toBe("Coupang Buyer");
    expect(order?.items[0].channelOrderItemId).toBe("3242596358");
    expect(order?.delivery?.receiverName).toBe("Coupang Receiver");
  });
});
