import type { NormalizedOrder, OrderNormalizer, RawOrderContext } from "./types.js";
import { integerValue, numberValue, parseDate, text } from "./normalizeUtils.js";
import { normalizeOrderStatus } from "./OrderStatusNormalizer.js";

export class OnryOrderNormalizer implements OrderNormalizer {
  supports(channelCd: string): boolean {
    return channelCd === "ONRY";
  }

  normalize(order: Record<string, unknown>, _context: RawOrderContext): NormalizedOrder | null {
    const channelOrderId = text(order, "order_number");
    const orderProductId = text(order, "id");
    if (!channelOrderId || !orderProductId) {
      return null;
    }

    const orderStatus = resolveOrderStatus(order);
    const deliveryFee = sumNullable(
      numberValue(order, "delivery_price"),
      numberValue(order, "add_delivery_price")
    );

    return {
      channelOrderId,
      orderStatus,
      orderDate: parseDate(text(order, "ordered_at")),
      paidAt: parseDate(text(order, "paid_at")),
      buyerName: text(order, "buyer_name"),
      buyerTel: text(order, "buyer_phone"),
      orderAmount: numberValue(order, "price"),
      productAmount: numberValue(order, "price"),
      deliveryFee,
      rawPayload: order,
      items: [{
        channelOrderItemId: orderProductId,
        productId: text(order, "product_code"),
        sellerProductCode: text(order, "partner_code"),
        skuCode: text(order, "option_uid"),
        productName: text(order, "product_name"),
        optionName: joinOptions(order),
        itemStatus: orderStatus,
        quantity: integerValue(order, "quantity"),
        unitPrice: numberValue(order, "supply_price", "price"),
        itemAmount: numberValue(order, "price"),
        rawPayload: order
      }],
      delivery: {
        receiverName: text(order, "receiver_name"),
        receiverTel: text(order, "receiver_phone"),
        receiverZipCode: text(order, "receiver_zipcode"),
        receiverAddr1: text(order, "receiver_address1"),
        receiverAddr2: text(order, "receiver_address2"),
        deliveryMemo: text(order, "delivery_message"),
        deliveryCompany: text(order, "shipping_company"),
        trackingNumber: text(order, "tracking_number"),
        deliveryStatus: normalizeOrderStatus(text(order, "shipping_status")),
        rawPayload: order
      }
    };
  }
}

function resolveOrderStatus(order: Record<string, unknown>): string | null {
  const cancelStatus = text(order, "cancel_status");
  if (cancelStatus === "R") {
    return "취소접수";
  }
  if (cancelStatus === "Y") {
    return "취소완료";
  }

  const complainStatus = text(order, "complain_status");
  return normalizeOrderStatus(
    complainStatus,
    text(order, "order_status"),
    text(order, "shipping_status"),
    text(order, "order_pay_status")
  );
}

function joinOptions(order: Record<string, unknown>): string | null {
  const options = [text(order, "option1"), text(order, "option2"), text(order, "option3")]
    .filter((value): value is string => Boolean(value));
  return options.length > 0 ? options.join(" / ") : null;
}

function sumNullable(...values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? present.reduce((sum, value) => sum + value, 0) : null;
}
