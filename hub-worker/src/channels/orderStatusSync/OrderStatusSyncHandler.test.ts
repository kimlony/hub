import { jest } from "@jest/globals";
import { OrderStatusSyncHandler } from "./OrderStatusSyncHandler.js";

describe("OrderStatusSyncHandler", () => {
  it("normalizes a partial status response and records update counts", async () => {
    const client = {
      fetchOrderStatuses: jest.fn(async () => [{
        channelOrderId: "ORDER-1",
        orderStatus: "SHIPPED",
        deliveryStatus: "SHIPPED",
        deliveryCompany: "TEST",
        trackingNumber: "TRACK-1",
        rawPayload: { orderStatus: "SHIPPED" }
      }])
    };
    const findTargets = jest.fn(async () => [{ channelOrderId: "ORDER-1", orderStatus: "결제완료" }]);
    const applyUpdates = jest.fn(async () => ({ fetchedCount: 1, updatedCount: 1, skippedCount: 0 }));
    const saveLog = jest.fn(async () => undefined);
    const handler = new OrderStatusSyncHandler(client, findTargets, applyUpdates, saveLog);

    await handler.handle(message());

    expect(applyUpdates).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "sync-1",
      channelAccountId: 23,
      updates: [expect.objectContaining({
        channelOrderId: "ORDER-1",
        orderStatus: "배송중",
        deliveryStatus: "SHIPPED"
      })]
    }));
    expect(saveLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "ORDER_STATUS_SYNC_COMPLETED",
      detail: { fetchedCount: 1, updatedCount: 1, skippedCount: 0 }
    }));
  });

  it("propagates channel failures to the common retry and DLQ boundary", async () => {
    const client = { fetchOrderStatuses: jest.fn(async () => { throw new Error("Mock status API failed"); }) };
    const handler = new OrderStatusSyncHandler(
      client,
      jest.fn(async () => [{ channelOrderId: "ORDER-1", orderStatus: "결제완료" }]),
      jest.fn(async () => ({ fetchedCount: 0, updatedCount: 0, skippedCount: 0 })),
      jest.fn(async () => undefined)
    );

    await expect(handler.handle(message())).rejects.toThrow("Mock status API failed");
  });
});

function message() {
  return {
    requestId: "sync-1",
    sourceErp: "HUB",
    jobType: "ORDER_STATUS_SYNC",
    requestKey: "STATUS_SYNC_23",
    payload: {
      userId: 7,
      corpId: 100,
      channelAccountId: 23,
      mallKey: "MOCK_MALL",
      channelCd: "MOCK_MALL",
      frDt: "20260701",
      toDt: "20260706",
      statusTypes: ["결제완료"],
      syncMode: "RANGE",
      erpApplyEnabled: false
    }
  };
}
