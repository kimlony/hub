import type { OrderStatusSyncTarget } from "../../db/postgres.js";

export type OrderStatusCandidate = {
  channelOrderId: string;
  channelOrderItemId?: string | null;
  orderStatus?: string | null;
  claimStatus?: string | null;
  deliveryStatus?: string | null;
  deliveryCompany?: string | null;
  trackingNumber?: string | null;
  rawPayload: Record<string, unknown>;
};

export type OrderStatusFetchInput = {
  targets: OrderStatusSyncTarget[];
  statusTypes: string[];
  payload: Record<string, unknown>;
};

export interface OrderStatusClient {
  fetchOrderStatuses(input: OrderStatusFetchInput): Promise<OrderStatusCandidate[]>;
}

