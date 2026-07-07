import { GchanApiClient } from "./GchanApiClient.js";
import type { OrderStatusCandidate, OrderStatusClient, OrderStatusFetchInput } from "../orderStatusSync/OrderStatusClient.js";
import { compactDate, requireString, targetOrderIds } from "../orderStatusSync/statusClientUtils.js";

export class GchanOrderStatusClient implements OrderStatusClient {
  constructor(private readonly client = new GchanApiClient()) {}

  async fetchOrderStatuses(input: OrderStatusFetchInput): Promise<OrderStatusCandidate[]> {
    const mallId = requireString(input.payload.mallId, "mallId");
    const mallPw = requireString(input.payload.mallPw, "mallPw");
    const frDt = compactDate(input.payload.frDt, "frDt");
    const toDt = compactDate(input.payload.toDt, "toDt");
    const targetIds = targetOrderIds(input.targets);
    const { accessToken, sellerSeq } = await this.client.login(mallId, mallPw);
    const orders = await this.client.fetchOrders(accessToken, sellerSeq, frDt, toDt);

    return orders
      .filter((order) => targetIds.size === 0 || targetIds.has(order.orderCode))
      .map((order) => ({
        channelOrderId: order.orderCode,
        orderStatus: order.receivedStatus || order.paymentStatus,
        deliveryStatus: order.deliveryStatus,
        trackingNumber: order.trackingNumber || null,
        rawPayload: { ...order }
      }));
  }
}

