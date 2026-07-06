import type { OrderStatusSyncTarget } from "../../db/postgres.js";

export type MockMallOrderStatus = {
  channelOrderId: string;
  orderStatus: string;
  claimStatus?: string | null;
  deliveryStatus?: string | null;
  deliveryCompany?: string | null;
  trackingNumber?: string | null;
  rawPayload: Record<string, unknown>;
};

export interface OrderStatusClient {
  fetchOrderStatuses(input: {
    targets: OrderStatusSyncTarget[];
    statusTypes: string[];
  }): Promise<MockMallOrderStatus[]>;
}

export class MockMallOrderStatusClient implements OrderStatusClient {
  async fetchOrderStatuses(input: {
    targets: OrderStatusSyncTarget[];
    statusTypes: string[];
  }): Promise<MockMallOrderStatus[]> {
    return input.targets.map((target) => {
      const cancelled = stableNumber(target.channelOrderId) % 2 === 0;
      const orderStatus = cancelled ? "CANCELLED" : "SHIPPED";
      const deliveryStatus = cancelled ? null : "SHIPPED";
      return {
        channelOrderId: target.channelOrderId,
        orderStatus,
        claimStatus: cancelled ? "CANCELLED" : null,
        deliveryStatus,
        deliveryCompany: cancelled ? null : "MOCK_DELIVERY",
        trackingNumber: cancelled ? null : `MOCK-${stableNumber(target.channelOrderId)}`,
        rawPayload: {
          channelOrderId: target.channelOrderId,
          orderStatus,
          deliveryStatus,
          requestedStatusTypes: input.statusTypes
        }
      };
    });
  }
}

function stableNumber(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}
