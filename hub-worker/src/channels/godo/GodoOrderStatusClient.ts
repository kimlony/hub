import { GodoApiClient } from "./GodoApiClient.js";
import type { OrderStatusCandidate, OrderStatusClient, OrderStatusFetchInput } from "../orderStatusSync/OrderStatusClient.js";
import { compactDate, requireString, targetOrderIds, text } from "../orderStatusSync/statusClientUtils.js";

export class GodoOrderStatusClient implements OrderStatusClient {
  constructor(private readonly client = new GodoApiClient()) {}

  async fetchOrderStatuses(input: OrderStatusFetchInput): Promise<OrderStatusCandidate[]> {
    const partnerKey = requireString(input.payload.key, "key");
    const key = requireString(input.payload.key2 ?? input.payload.authKey, "key2 or authKey");
    const frDt = compactDate(input.payload.frDt, "frDt");
    const toDt = compactDate(input.payload.toDt, "toDt");
    const targetIds = targetOrderIds(input.targets);
    const result = await this.client.fetchOrders(partnerKey, key, frDt, toDt);

    return result.orders
      .map((order) => ({ order, channelOrderId: text(order, "orderNo", "order_no", "orderNoCd", "orderCd", "ordNo") }))
      .filter((entry): entry is { order: Record<string, unknown>; channelOrderId: string } =>
        entry.channelOrderId !== null && (targetIds.size === 0 || targetIds.has(entry.channelOrderId)))
      .map(({ order, channelOrderId }) => {
        const status = text(order, "orderStatus", "order_status", "status", "orderStatusCd");
        return {
          channelOrderId,
          orderStatus: mapGodoStatus(status),
          claimStatus: mapGodoClaimStatus(status),
          deliveryStatus: mapGodoDeliveryStatus(status),
          deliveryCompany: text(order, "deliveryCompany", "delivery_company", "deliveryCompanyName"),
          trackingNumber: text(order, "trackingNumber", "invoiceNo", "invoiceNumber"),
          rawPayload: order
        };
      });
  }
}

function mapGodoStatus(status: string | null): string | null {
  const value = normalize(status);
  if (value === "O1") return "PAYMENT_PENDING";
  if (value === "P1") return "PAID";
  if (["G1", "G2", "G3"].includes(value)) return "INSTRUCT";
  if (value === "G4") return "READY_FOR_DELIVERY";
  if (value === "D1") return "DELIVERING";
  if (value === "D2") return "FINAL_DELIVERY";
  if (value === "S1") return "PURCHASE_CONFIRMED";
  if (["C1", "C2", "C3"].includes(value)) return "CANCELLED";
  if (value === "C4") return "CANCEL_REQUEST";
  if (["B1", "E1", "R1"].includes(value)) return "RETURN_REQUEST";
  if (["B4", "E5", "R3"].includes(value)) return "RETURN_COMPLETE";
  return status;
}

function mapGodoClaimStatus(status: string | null): string | null {
  const value = normalize(status);
  if (value === "C4") return "CANCEL_REQUEST";
  if (["C1", "C2", "C3"].includes(value)) return "CANCELLED";
  if (value.startsWith("B")) return value === "B4" ? "RETURN_COMPLETE" : "RETURN_REQUEST";
  if (value.startsWith("E")) return value === "E5" ? "EXCHANGE_COMPLETE" : "EXCHANGE_REQUEST";
  if (value.startsWith("R")) return value === "R3" ? "REFUND_COMPLETE" : "REFUND_REQUEST";
  return null;
}

function mapGodoDeliveryStatus(status: string | null): string | null {
  const value = normalize(status);
  if (value === "G4") return "READY_FOR_DELIVERY";
  if (value === "D1") return "DELIVERING";
  if (value === "D2") return "FINAL_DELIVERY";
  return null;
}

function normalize(value: string | null): string {
  return (value ?? "").trim().toUpperCase();
}

