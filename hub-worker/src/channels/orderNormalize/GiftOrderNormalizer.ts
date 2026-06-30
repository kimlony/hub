import type { NormalizedOrder, OrderNormalizer, RawOrderContext } from "./types.js";
import { firstNonBlank, integerValue, numberValue, parseDate, text } from "./normalizeUtils.js";
import { normalizeOrderStatus } from "./OrderStatusNormalizer.js";

export class GiftOrderNormalizer implements OrderNormalizer {
  supports(channelCd: string): boolean {
    return channelCd === "GCHAN";
  }

  normalize(order: Record<string, unknown>, _context: RawOrderContext): NormalizedOrder | null {
    const channelOrderId = firstNonBlank(text(order, "orderCode"), text(order, "giftSendId"), text(order, "recipientId"));

    if (!channelOrderId) {
      return null;
    }

    return {
      channelOrderId,
      orderStatus: normalizeOrderStatus(
        text(order, "paymentStatus"),
        text(order, "receivedStatus"),
        text(order, "orderDeliveryStatus"),
        text(order, "deliveryStatus")
      ),
      orderDate: parseDate(firstNonBlank(text(order, "paidAt"), text(order, "createdAt"))),
      paidAt: parseDate(text(order, "paidAt")),
      buyerName: text(order, "senderFullName"),
      paymentMethod: text(order, "paymentMethod"),
      orderAmount: numberValue(order, "giftSupplyPrice", "orderAmount"),
      productAmount: numberValue(order, "giftSupplyPrice", "productAmount"),
      rawPayload: order,
      items: [{
        channelOrderItemId: `recipient-${firstNonBlank(text(order, "recipientId"), "0")}-item-${firstNonBlank(text(order, "itemId"), "0")}`,
        productId: text(order, "itemId"),
        productName: firstNonBlank(text(order, "itemName"), text(order, "productName"), text(order, "goodsName")),
        optionName: text(order, "optionName"),
        itemStatus: normalizeOrderStatus(text(order, "receivedStatus"), text(order, "orderDeliveryStatus"), text(order, "deliveryStatus")),
        quantity: integerValue(order, "quantity"),
        unitPrice: numberValue(order, "giftSupplyPrice"),
        itemAmount: numberValue(order, "giftSupplyPrice"),
        rawPayload: order
      }],
      delivery: {
        receiverName: text(order, "recipientName"),
        receiverTel: text(order, "recipientPhone"),
        receiverAddr1: text(order, "recipientAddress"),
        receiverAddr2: text(order, "recipientAddressDetail"),
        deliveryCompany: text(order, "carrierCode"),
        trackingNumber: text(order, "trackingNumber"),
        deliveryStatus: normalizeOrderStatus(text(order, "orderDeliveryStatus"), text(order, "deliveryStatus")),
        rawPayload: order
      }
    };
  }
}
