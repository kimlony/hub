import type { NormalizedOrder, OrderNormalizer, RawOrderContext } from "./types.js";
import {
  firstNonBlank,
  integerValue,
  itemRecords,
  numberValue,
  parseDate,
  text
} from "./normalizeUtils.js";

export class GenericOrderNormalizer implements OrderNormalizer {
  supports(_channelCd: string): boolean {
    return true;
  }

  normalize(order: Record<string, unknown>, context: RawOrderContext): NormalizedOrder | null {
    const channelOrderId = firstNonBlank(
      text(order, "orderNo"),
      text(order, "order_no"),
      text(order, "orderId"),
      text(order, "order_id"),
      text(order, "ordNo"),
      text(order, "ordno"),
      text(order, "orderCode")
    );

    if (!channelOrderId) {
      return null;
    }

    return {
      channelOrderId,
      orderStatus: firstNonBlank(text(order, "orderStatus"), text(order, "status"), text(order, "ordStatus"), text(order, "productOrderStatus")),
      orderDate: parseDate(firstNonBlank(text(order, "orderedAt"), text(order, "orderDate"), text(order, "orderDt"), text(order, "ordDt"), text(order, "regDt"))),
      paidAt: parseDate(firstNonBlank(text(order, "paidAt"), text(order, "paymentDate"), text(order, "payDt"))),
      buyerName: firstNonBlank(text(order, "buyerName"), text(order, "ordererName"), text(order, "ordNm"), text(order, "orderName")),
      buyerTel: firstNonBlank(text(order, "buyerTel"), text(order, "ordererTel"), text(order, "ordPrtblTel"), text(order, "orderCellPhone")),
      buyerEmail: firstNonBlank(text(order, "buyerEmail"), text(order, "orderEmail")),
      paymentMethod: firstNonBlank(text(order, "paymentMethod"), text(order, "paymentMeans"), text(order, "settleKind")),
      orderAmount: numberValue(order, "orderAmount", "amount", "orderPrice", "payAmount", "ordPayAmt", "totalPaymentAmount"),
      productAmount: numberValue(order, "productAmount", "ordAmt", "productPrice"),
      deliveryFee: numberValue(order, "deliveryFee", "shippingFee"),
      discountAmount: numberValue(order, "discountAmount", "discountPrice"),
      rawPayload: order,
      items: itemRecords(order, "items", "orderItems", "productOrders", "orderGoodsData").map((item, index) => ({
        channelOrderItemId: firstNonBlank(
          text(item, "channelOrderItemId"),
          text(item, "productOrderId"),
          text(item, "ordPrdSeq"),
          text(item, "sno"),
          text(item, "vendorItemId")
        ) ?? `${channelOrderId}-${index + 1}`,
        productId: firstNonBlank(text(item, "productId"), text(item, "product_id"), text(item, "prdNo"), text(item, "goodsNo")),
        sellerProductCode: firstNonBlank(text(item, "sellerProductCode"), text(item, "sellerPrdCd")),
        skuCode: firstNonBlank(text(item, "skuCode"), text(item, "vendorItemId")),
        productName: firstNonBlank(text(item, "productName"), text(item, "itemName"), text(item, "goodsNm"), text(item, "prdNm")),
        optionName: firstNonBlank(text(item, "optionName"), text(item, "productOption"), text(item, "optionInfo"), text(item, "slctPrdOptNm")),
        itemStatus: firstNonBlank(text(item, "itemStatus"), text(item, "productOrderStatus"), text(item, "status")),
        quantity: integerValue(item, "quantity", "qty", "orderQty", "ordQty", "goodsCnt"),
        unitPrice: numberValue(item, "unitPrice", "goodsPrice"),
        itemAmount: numberValue(item, "itemAmount", "orderPrice", "totalPaymentAmount", "goodsPrice"),
        discountAmount: numberValue(item, "discountAmount", "goodsDiscount"),
        expectedSettlementAmount: numberValue(item, "expectedSettlementAmount"),
        rawPayload: item
      })),
      delivery: {
        receiverName: firstNonBlank(text(order, "receiverName"), text(order, "receiver"), text(order, "recvName"), text(order, "rcvrNm"), text(order, "name")),
        receiverTel: firstNonBlank(text(order, "receiverTel"), text(order, "receiverCellPhone"), text(order, "rcvrPrtblNo"), text(order, "tel1")),
        receiverZipCode: firstNonBlank(text(order, "receiverZipCode"), text(order, "receiverZonecode"), text(order, "rcvrMailNo"), text(order, "zipCode")),
        receiverAddr1: firstNonBlank(text(order, "receiverAddr1"), text(order, "receiverAddress"), text(order, "rcvrBaseAddr"), text(order, "baseAddress")),
        receiverAddr2: firstNonBlank(text(order, "receiverAddr2"), text(order, "receiverAddressSub"), text(order, "rcvrDtlsAddr"), text(order, "detailedAddress")),
        deliveryMemo: firstNonBlank(text(order, "deliveryMemo"), text(order, "shippingMemo")),
        deliveryCompany: firstNonBlank(text(order, "deliveryCompany"), text(order, "carrierCode")),
        trackingNumber: firstNonBlank(text(order, "trackingNumber"), text(order, "invoiceNo")),
        deliveryStatus: firstNonBlank(text(order, "deliveryStatus"), text(order, "orderDeliveryStatus")),
        rawPayload: order
      }
    };
  }
}
