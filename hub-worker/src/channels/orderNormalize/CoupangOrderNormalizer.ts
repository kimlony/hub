import type { NormalizedOrder, OrderNormalizer, RawOrderContext } from "./types.js";
import { firstNonBlank, integerValue, isRecord, nestedRecord, numberValue, parseDate, text } from "./normalizeUtils.js";

export class CoupangOrderNormalizer implements OrderNormalizer {
  supports(channelCd: string): boolean {
    return channelCd === "COUPANG";
  }

  normalize(order: Record<string, unknown>, _context: RawOrderContext): NormalizedOrder | null {
    const receiver = nestedRecord(order, "receiver") ?? order;
    const buyer = nestedRecord(order, "orderer") ?? order;
    const items = Array.isArray(order.orderItems) ? order.orderItems.filter(isRecord) : [order];
    const channelOrderId = firstNonBlank(text(order, "orderId"), text(order, "shipmentBoxId"));

    if (!channelOrderId) {
      return null;
    }

    return {
      channelOrderId,
      orderStatus: firstNonBlank(text(order, "status"), text(order, "orderStatus"), text(order, "orderDeliveryStatus")),
      orderDate: parseDate(text(order, "orderedAt")),
      paidAt: parseDate(text(order, "paidAt")),
      buyerName: text(buyer, "name"),
      buyerTel: firstNonBlank(text(buyer, "safeNumber"), text(buyer, "phone")),
      buyerEmail: text(buyer, "email"),
      paymentMethod: "COUPANG_PAY",
      orderAmount: numberValue(order, "orderAmount", "paidAmount"),
      productAmount: numberValue(order, "orderPrice", "productAmount"),
      deliveryFee: numberValue(order, "shippingFee"),
      discountAmount: numberValue(order, "discountAmount"),
      rawPayload: order,
      items: items.map((item, index) => ({
        channelOrderItemId: firstNonBlank(text(item, "vendorItemId"), text(item, "orderItemId")) ?? `${channelOrderId}-${index + 1}`,
        productId: firstNonBlank(text(item, "sellerProductId"), text(item, "productId")),
        sellerProductCode: text(item, "externalVendorSkuCode"),
        skuCode: text(item, "vendorItemId"),
        productName: firstNonBlank(text(item, "vendorItemName"), text(item, "sellerProductName"), text(item, "productName")),
        optionName: firstNonBlank(text(item, "optionName"), text(item, "vendorItemName")),
        itemStatus: firstNonBlank(text(item, "status"), text(order, "status")),
        quantity: integerValue(item, "shippingCount", "quantity"),
        unitPrice: numberValue(item, "salesPrice", "unitPrice"),
        itemAmount: numberValue(item, "orderPrice", "itemAmount"),
        discountAmount: numberValue(item, "instantCouponDiscount", "downloadableCouponDiscount", "discountAmount"),
        expectedSettlementAmount: numberValue(item, "settlementAmount"),
        rawPayload: item
      })),
      delivery: {
        receiverName: text(receiver, "name"),
        receiverTel: firstNonBlank(text(receiver, "safeNumber"), text(receiver, "phone")),
        receiverZipCode: text(receiver, "postCode"),
        receiverAddr1: text(receiver, "addr1"),
        receiverAddr2: text(receiver, "addr2"),
        deliveryMemo: text(receiver, "deliveryMemo"),
        deliveryCompany: text(order, "deliveryCompanyName"),
        trackingNumber: text(order, "invoiceNumber"),
        deliveryStatus: firstNonBlank(text(order, "orderDeliveryStatus"), text(order, "status")),
        rawPayload: receiver
      }
    };
  }
}
