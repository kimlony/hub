import type { NormalizedOrder, OrderNormalizer, RawOrderContext } from "./types.js";
import { firstNonBlank, integerValue, numberValue, parseDate, text } from "./normalizeUtils.js";

const ORDER_STATUS_NAMES: Record<string, string> = {
  "1": "결제대기",
  "2": "결제완료",
  "3": "주문완료",
  "4": "배송중",
  "5": "배송완료",
  "6": "취소접수",
  "7": "취소완료",
  "8": "반품접수",
  "9": "반품완료",
  "10": "교환접수",
  "11": "교환중",
  "12": "교환완료",
  "13": "미결제취소"
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
    const orderStatus = statusCode ? ORDER_STATUS_NAMES[statusCode] ?? "상태확인필요" : "상태확인필요";

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
