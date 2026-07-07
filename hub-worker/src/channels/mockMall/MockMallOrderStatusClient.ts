import type { OrderStatusCandidate, OrderStatusClient, OrderStatusFetchInput } from "../orderStatusSync/OrderStatusClient.js";

export class MockMallOrderStatusClient implements OrderStatusClient {
  async fetchOrderStatuses(input: OrderStatusFetchInput): Promise<OrderStatusCandidate[]> {
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
