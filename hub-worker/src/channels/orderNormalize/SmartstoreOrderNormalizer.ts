import type { NormalizedOrder, OrderNormalizer, RawOrderContext } from "./types.js";
import { firstNestedText, firstNonBlank, integerValue, nestedRecord, numberValue, parseDate, text } from "./normalizeUtils.js";
import { normalizeOrderStatus } from "./OrderStatusNormalizer.js";

export class SmartstoreOrderNormalizer implements OrderNormalizer {
  supports(channelCd: string): boolean {
    return ["NAVER", "NSS"].includes(channelCd);
  }

  normalize(order: Record<string, unknown>, _context: RawOrderContext): NormalizedOrder | null {
    const orderPart = nestedRecord(order, "order") ?? order;
    const productOrder = nestedRecord(order, "productOrder") ?? order;
    const shippingAddress = nestedRecord(productOrder, "shippingAddress") ?? order;
    const channelOrderId = firstNonBlank(text(orderPart, "orderId"), text(order, "orderId"), text(order, "orderNo"));
    const productOrderId = firstNonBlank(text(productOrder, "productOrderId"), text(order, "productOrderId"));

    if (!channelOrderId) {
      return null;
    }

    return {
      channelOrderId,
      orderStatus: normalizeOrderStatus(text(productOrder, "productOrderStatus"), text(order, "orderStatus")),
      orderDate: parseDate(firstNonBlank(text(orderPart, "orderDate"), text(order, "orderDate"))),
      paidAt: parseDate(firstNonBlank(text(orderPart, "paymentDate"), text(order, "paymentDate"))),
      buyerName: firstNonBlank(text(orderPart, "ordererName"), text(order, "ordererName")),
      buyerTel: firstNonBlank(text(orderPart, "ordererTel"), text(order, "ordererTel")),
      paymentMethod: firstNonBlank(text(orderPart, "paymentMeans"), text(order, "paymentMeans")),
      orderAmount: numberValue(productOrder, "totalPaymentAmount", "orderAmount"),
      productAmount: numberValue(productOrder, "productAmount", "unitPrice"),
      deliveryFee: numberValue(productOrder, "deliveryFee"),
      discountAmount: numberValue(productOrder, "discountAmount"),
      rawPayload: order,
      items: [{
        channelOrderItemId: productOrderId ?? `${channelOrderId}-1`,
        productId: firstNonBlank(text(productOrder, "productId"), text(order, "productId")),
        sellerProductCode: firstNonBlank(text(productOrder, "sellerProductCode"), text(order, "sellerProductCode")),
        skuCode: firstNonBlank(text(productOrder, "skuCode"), text(order, "skuCode")),
        productName: firstNonBlank(text(productOrder, "productName"), text(order, "productName")),
        optionName: firstNonBlank(text(productOrder, "productOption"), text(order, "productOption")),
        itemStatus: normalizeOrderStatus(text(productOrder, "productOrderStatus"), text(order, "productOrderStatus")),
        quantity: integerValue(productOrder, "quantity"),
        unitPrice: numberValue(productOrder, "unitPrice"),
        itemAmount: numberValue(productOrder, "totalPaymentAmount", "orderAmount"),
        discountAmount: numberValue(productOrder, "discountAmount"),
        expectedSettlementAmount: numberValue(productOrder, "expectedSettlementAmount"),
        rawPayload: productOrder
      }],
      delivery: {
        receiverName: firstNonBlank(text(shippingAddress, "name"), firstNestedText(order, [["shippingAddress", "name"]])),
        receiverTel: firstNonBlank(text(shippingAddress, "tel1"), text(shippingAddress, "receiverTel")),
        receiverZipCode: text(shippingAddress, "zipCode"),
        receiverAddr1: text(shippingAddress, "baseAddress"),
        receiverAddr2: text(shippingAddress, "detailedAddress"),
        deliveryMemo: text(shippingAddress, "shippingMemo"),
        deliveryStatus: normalizeOrderStatus(text(productOrder, "deliveryStatus"), text(order, "deliveryStatus")),
        rawPayload: shippingAddress
      }
    };
  }
}
