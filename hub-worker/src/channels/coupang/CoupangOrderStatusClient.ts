import { CoupangApiClient } from "./CoupangApiClient.js";
import type { OrderStatusCandidate, OrderStatusClient, OrderStatusFetchInput } from "../orderStatusSync/OrderStatusClient.js";
import { compactDate, requireString, targetOrderIds } from "../orderStatusSync/statusClientUtils.js";

export class CoupangOrderStatusClient implements OrderStatusClient {
  constructor(private readonly client = new CoupangApiClient()) {}

  async fetchOrderStatuses(input: OrderStatusFetchInput): Promise<OrderStatusCandidate[]> {
    const apiKey = requireString(input.payload.key, "key");
    const secretKey = requireString(input.payload.key2, "key2");
    const vendorId = requireString(input.payload.vendorId, "vendorId");
    const frDt = compactDate(input.payload.frDt, "frDt");
    const toDt = compactDate(input.payload.toDt, "toDt");
    const targetIds = targetOrderIds(input.targets);

    const orders = await this.client.fetchOrders(apiKey, secretKey, vendorId, frDt, toDt);
    return orders
      .filter((order) => targetIds.size === 0 || targetIds.has(order.orderId))
      .map((order) => ({
        channelOrderId: order.orderId,
        orderStatus: order.status || order.orderStatus,
        deliveryStatus: order.status || order.orderStatus,
        deliveryCompany: order.deliveryCompanyName ?? null,
        trackingNumber: order.invoiceNumber ?? null,
        rawPayload: { ...order }
      }));
  }
}

