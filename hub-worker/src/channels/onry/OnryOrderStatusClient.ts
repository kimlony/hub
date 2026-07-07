import { OnryApiClient } from "./OnryApiClient.js";
import type { OrderStatusCandidate, OrderStatusClient, OrderStatusFetchInput } from "../orderStatusSync/OrderStatusClient.js";
import { compactDate, optionalString, requireString, targetOrderIds } from "../orderStatusSync/statusClientUtils.js";

export class OnryOrderStatusClient implements OrderStatusClient {
  constructor(private readonly clientFactory = (apiKey?: string) => new OnryApiClient(undefined, apiKey)) {}

  async fetchOrderStatuses(input: OrderStatusFetchInput): Promise<OrderStatusCandidate[]> {
    const mallId = requireString(input.payload.mallId, "mallId");
    const mallPw = requireString(input.payload.mallPw, "mallPw");
    const authKey = optionalString(input.payload.authKey) ?? undefined;
    const frDt = compactDate(input.payload.frDt, "frDt");
    const toDt = compactDate(input.payload.toDt, "toDt");
    const targetIds = targetOrderIds(input.targets);
    const client = this.clientFactory(authKey);
    const { accessToken } = await client.login(mallId, mallPw);
    const orders = await client.fetchOrders(accessToken, frDt, toDt);

    return orders
      .filter((order) => targetIds.size === 0 || targetIds.has(order.order_number))
      .map((order) => ({
        channelOrderId: order.order_number,
        orderStatus: resolveOnryOrderStatus(order),
        claimStatus: resolveOnryClaimStatus(order),
        deliveryStatus: order.shipping_status,
        deliveryCompany: order.shipping_company || null,
        trackingNumber: order.tracking_number || null,
        rawPayload: { ...order }
      }));
  }
}

function resolveOnryOrderStatus(order: {
  cancel_status: string;
  complain_status: string;
  shipping_status: string;
  order_status: string;
  order_pay_status: string;
}): string | null {
  if (order.cancel_status === "Y") return "CANCELLED";
  if (order.cancel_status === "R") return "CANCEL_REQUEST";
  if (order.complain_status) return order.complain_status;
  return order.shipping_status || order.order_status || order.order_pay_status || null;
}

function resolveOnryClaimStatus(order: { cancel_status: string; complain_status: string }): string | null {
  if (order.cancel_status === "Y") return "CANCELLED";
  if (order.cancel_status === "R") return "CANCEL_REQUEST";
  return order.complain_status || null;
}

