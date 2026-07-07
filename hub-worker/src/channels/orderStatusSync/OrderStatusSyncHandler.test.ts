import { jest } from "@jest/globals";
import { OrderStatusSyncHandler } from "./OrderStatusSyncHandler.js";
import type { OrderStatusClient } from "./OrderStatusClient.js";
import { OrderStatusClientRegistry } from "./OrderStatusClientRegistry.js";

function registryFor(client: OrderStatusClient): OrderStatusClientRegistry {
  const registry = new OrderStatusClientRegistry();
  registry.register("MOCK_MALL", client);
  return registry;
}

describe("OrderStatusSyncHandler", () => {
  it("selects a channel status client and records update counts", async () => {
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
    const findTargets = jest.fn(async () => [{ channelOrderId: "ORDER-1", orderStatus: "PAID" }]);
    const applyUpdates = jest.fn(async () => ({ fetchedCount: 1, updatedCount: 1, skippedCount: 0 }));
    const saveLog = jest.fn(async () => undefined);
    const handler = new OrderStatusSyncHandler(registryFor(client), findTargets, applyUpdates, saveLog);

    await handler.handle(message());

    expect(client.fetchOrderStatuses).toHaveBeenCalledWith(expect.objectContaining({
      targets: [{ channelOrderId: "ORDER-1", orderStatus: "PAID" }],
      statusTypes: ["SHIPPED"],
      payload: expect.objectContaining({ channelCd: "MOCK_MALL" })
    }));
    expect(applyUpdates).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "sync-1",
      channelAccountId: 23,
      updates: [expect.objectContaining({
        channelOrderId: "ORDER-1",
        deliveryStatus: "SHIPPED",
        deliveryCompany: "TEST",
        trackingNumber: "TRACK-1"
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
      registryFor(client),
      jest.fn(async () => [{ channelOrderId: "ORDER-1", orderStatus: "PAID" }]),
      jest.fn(async () => ({ fetchedCount: 0, updatedCount: 0, skippedCount: 0 })),
      jest.fn(async () => undefined)
    );

    await expect(handler.handle(message())).rejects.toThrow("Mock status API failed");
  });

  it("fails fast when the channel status adapter is not registered", async () => {
    const handler = new OrderStatusSyncHandler(
      new OrderStatusClientRegistry(),
      jest.fn(async () => [{ channelOrderId: "ORDER-1", orderStatus: "PAID" }]),
      jest.fn(async () => ({ fetchedCount: 0, updatedCount: 0, skippedCount: 0 })),
      jest.fn(async () => undefined)
    );

    await expect(handler.handle(message())).rejects.toThrow("ORDER_STATUS_SYNC is not supported for channelCd: MOCK_MALL");
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
      statusTypes: ["SHIPPED"],
      syncMode: "RANGE",
      erpApplyEnabled: false
    }
  };
}