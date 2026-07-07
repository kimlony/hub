import { WchanApiClient } from "./WchanApiClient.js";
import type { OrderStatusCandidate, OrderStatusClient, OrderStatusFetchInput } from "../orderStatusSync/OrderStatusClient.js";
import { compactDate, requireString, targetOrderIds, text } from "../orderStatusSync/statusClientUtils.js";

export class WchanOrderStatusClient implements OrderStatusClient {
  constructor(private readonly client = new WchanApiClient()) {}

  async fetchOrderStatuses(input: OrderStatusFetchInput): Promise<OrderStatusCandidate[]> {
    const mallId = requireString(input.payload.mallId, "mallId");
    const mallPw = requireString(input.payload.mallPw, "mallPw");
    const frDt = compactDate(input.payload.frDt, "frDt");
    const toDt = compactDate(input.payload.toDt, "toDt");
    const targetIds = targetOrderIds(input.targets);
    const { sessionKey } = await this.client.login(mallId, mallPw);
    const orders = await this.client.fetchOrders(sessionKey, mallId, frDt, toDt);

    return orders
      .filter((order) => targetIds.size === 0 || targetIds.has(order.rdmg_code))
      .map((order) => ({
        channelOrderId: order.rdmg_code,
        orderStatus: mapWchanStatus(order.rdmg_order_status),
        deliveryStatus: mapWchanDeliveryStatus(order.rdmg_order_status),
        deliveryCompany: text(order, "deliveryCompany", "delivery_company", "dlvCompany"),
        trackingNumber: text(order, "trackingNumber", "tracking_number", "invoiceNo"),
        rawPayload: { ...order }
      }));
  }
}

function mapWchanStatus(status: number): string | null {
  if (status === 0) return null;
  if (status >= 500) return "FINAL_DELIVERY";
  if (status >= 400) return "DELIVERING";
  if (status >= 300) return "INSTRUCT";
  if (status >= 200) return "PAID";
  return String(status);
}

function mapWchanDeliveryStatus(status: number): string | null {
  if (status >= 500) return "FINAL_DELIVERY";
  if (status >= 400) return "DELIVERING";
  return null;
}

