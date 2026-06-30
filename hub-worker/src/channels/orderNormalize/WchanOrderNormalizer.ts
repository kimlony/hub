import type { NormalizedOrder, OrderNormalizer, RawOrderContext } from "./types.js";
import { firstNonBlank, integerValue, numberValue, parseDate, text } from "./normalizeUtils.js";

const ORDER_STATUS_NAMES: Record<string, string> = {
  "1": "PAYMENT_PENDING",
  "2": "PAID",
  "3": "ORDER_CONFIRMED",
  "4": "SHIPPING",
  "5": "DELIVERED",
  "6": "CANCEL_REQUESTED",
  "7": "CANCELLED",
  "8": "RETURN_REQUESTED",
  "9": "RETURNED",
  "10": "EXCHANGE_REQUESTED",
  "11": "EXCHANGE_SHIPPING",
  "12": "EXCHANGE_DELIVERED",
  "13": "PAYMENT_TIMEOUT_CANCELLED"
};

export class WchanOrderNormalizer implements OrderNormalizer {
  supports(channelCd: string): boolean {
    return channelCd === "WCHAN";
  }

  normalize(order: Record<string, unknown>, _context: RawOrderContext): NormalizedOrder | null {
    const channelOrderId = text(order, "rdmg_code");
    if (!channelOrderId) {
      return null;
    }

    const itemIndex = firstNonBlank(text(order, "rdmg_index"), "0");
    const statusCode = text(order, "rdmg_order_status");
    const orderStatus = statusCode ? ORDER_STATUS_NAMES[statusCode] ?? statusCode : null;

    return {
      channelOrderId,
      orderStatus,
      orderDate: parseDate(text(order, "rdmg_order_date")),
      buyerName: firstNonBlank(text(order, "lmmf_name"), text(order, "odermbsd_id")),
      buyerTel: text(order, "mbgr_hp"),
      paymentMethod: text(order, "rdmg_payment_composition"),
      orderAmount: numberValue(order, "rdmg_price"),
      productAmount: numberValue(order, "rdmg_price"),
      deliveryFee: numberValue(order, "rdmg_delivery_cost"),
      rawPayload: order,
      items: [{
        channelOrderItemId: `${channelOrderId}-${itemIndex}`,
        productId: text(order, "gdmg_code"),
        sellerProductCode: text(order, "gdmg_mange_code"),
        productName: text(order, "gdmg_goods_name"),
        optionName: text(order, "rdmg_contents"),
        itemStatus: orderStatus,
        quantity: integerValue(order, "rdmg_buy_amount"),
        unitPrice: numberValue(order, "gdmg_support_price", "rdmg_price"),
        itemAmount: numberValue(order, "rdmg_price"),
        rawPayload: order
      }],
      delivery: {
        receiverName: text(order, "rddr_name"),
        receiverTel: text(order, "mbgr_hp"),
        deliveryStatus: orderStatus,
        rawPayload: order
      }
    };
  }
}
