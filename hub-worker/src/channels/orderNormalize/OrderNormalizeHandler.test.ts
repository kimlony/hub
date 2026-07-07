import { jest } from "@jest/globals";
import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";

const findJobResultForNormalize = jest.fn<() => Promise<unknown>>();
const saveJobLog = jest.fn<() => Promise<void>>();
const saveNormalizeCheckpoint = jest.fn<() => Promise<void>>();
const upsertNormalizedDelivery = jest.fn<() => Promise<void>>();
const upsertNormalizedOrder = jest.fn<() => Promise<number>>();
const upsertNormalizedOrderItem = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("../../db/postgres.js", () => ({
  findJobResultForNormalize,
  saveJobLog,
  saveNormalizeCheckpoint,
  upsertNormalizedDelivery,
  upsertNormalizedOrder,
  upsertNormalizedOrderItem
}));

const { OrderNormalizeHandler } = await import("./OrderNormalizeHandler.js");

describe("OrderNormalizeHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findJobResultForNormalize.mockResolvedValue(jobResult({ orders: [] }));
    saveJobLog.mockResolvedValue(undefined);
    saveNormalizeCheckpoint.mockResolvedValue(undefined);
    upsertNormalizedDelivery.mockResolvedValue(undefined);
    upsertNormalizedOrder.mockResolvedValue(501);
    upsertNormalizedOrderItem.mockResolvedValue(undefined);
  });

  it("saves a successful zero-count checkpoint when the collection result has no orders", async () => {
    await new OrderNormalizeHandler().handle(message());

    expect(findJobResultForNormalize).toHaveBeenCalledWith("collect-1");
    expect(saveNormalizeCheckpoint).toHaveBeenCalledWith({
      sourceRequestId: "collect-1",
      status: "SUCCESS",
      normalizedCount: 0
    });
    expect(upsertNormalizedOrder).not.toHaveBeenCalled();
    expect(upsertNormalizedOrderItem).not.toHaveBeenCalled();
    expect(upsertNormalizedDelivery).not.toHaveBeenCalled();
    expect(saveJobLog).not.toHaveBeenCalled();
  });

  it("normalizes eligible orders and persists order, items, delivery, checkpoint, and log", async () => {
    findJobResultForNormalize.mockResolvedValue(jobResult({
      orders: [{
        orderId: "ORDER-1",
        orderStatus: "PAID",
        orderedAt: "2026-07-01T01:02:03Z",
        buyerName: "Buyer",
        orderAmount: 3000,
        items: [
          { channelOrderItemId: "ITEM-1", productName: "Product 1", quantity: 1, unitPrice: 1000 },
          { channelOrderItemId: "ITEM-2", productName: "Product 2", quantity: 2, unitPrice: 1000 }
        ],
        receiverName: "Receiver",
        receiverTel: "010-0000-0000",
        receiverAddr1: "Seoul"
      }]
    }));

    await new OrderNormalizeHandler().handle(message());

    expect(upsertNormalizedOrder).toHaveBeenCalledWith(expect.objectContaining({
      corpId: 100,
      channelAccountId: 10,
      userId: 1,
      requestId: "collect-1",
      requestKey: "COLLECT_1",
      sourceErp: "HUB",
      channelCd: "MOCK_MALL",
      mallKey: "MOCK_MALL",
      channelOrderId: "ORDER-1",
      buyerName: "Buyer",
      orderAmount: 3000
    }));
    expect(upsertNormalizedOrderItem).toHaveBeenCalledTimes(2);
    expect(upsertNormalizedOrderItem).toHaveBeenNthCalledWith(1, expect.objectContaining({
      orderId: 501,
      channelOrderItemId: "ITEM-1",
      productName: "Product 1",
      quantity: 1,
      unitPrice: 1000
    }));
    expect(upsertNormalizedOrderItem).toHaveBeenNthCalledWith(2, expect.objectContaining({
      orderId: 501,
      channelOrderItemId: "ITEM-2",
      productName: "Product 2",
      quantity: 2,
      unitPrice: 1000
    }));
    expect(upsertNormalizedDelivery).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 501,
      receiverName: "Receiver",
      receiverTel: "010-0000-0000",
      receiverAddr1: "Seoul"
    }));
    expect(saveNormalizeCheckpoint).toHaveBeenCalledWith({
      sourceRequestId: "collect-1",
      status: "SUCCESS",
      normalizedCount: 1
    });
    expect(saveJobLog).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "normalize-1",
      eventType: "ORDER_NORMALIZE_COMPLETED",
      channelCd: "MOCK_MALL",
      detail: expect.objectContaining({
        sourceRequestId: "collect-1",
        fetchedCount: 1,
        statusSkippedCount: 0,
        normalizedCount: 1
      })
    }));
  });

  it("skips malformed orders, missing order ids, and non-initial statuses", async () => {
    findJobResultForNormalize.mockResolvedValue(jobResult({
      orders: [
        "not-an-object",
        { buyerName: "No order id", orderStatus: "PAID" },
        { orderId: "ORDER-SHIPPED", orderStatus: "SHIPPED" },
        { orderId: "ORDER-PAID", orderStatus: "PAID", items: [] }
      ]
    }));

    await new OrderNormalizeHandler().handle(message());

    expect(upsertNormalizedOrder).toHaveBeenCalledTimes(1);
    expect(upsertNormalizedOrder).toHaveBeenCalledWith(expect.objectContaining({
      channelOrderId: "ORDER-PAID"
    }));
    expect(upsertNormalizedOrderItem).not.toHaveBeenCalled();
    expect(saveNormalizeCheckpoint).toHaveBeenCalledWith({
      sourceRequestId: "collect-1",
      status: "SUCCESS",
      normalizedCount: 1
    });
    expect(saveJobLog).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        fetchedCount: 4,
        statusSkippedCount: 1,
        normalizedCount: 1
      })
    }));
  });

  it("fails fast when required normalization context is missing", async () => {
    findJobResultForNormalize.mockResolvedValue(jobResult(
      { orders: [{ orderId: "ORDER-1", orderStatus: "PAID" }] },
      { userId: undefined }
    ));

    await expect(new OrderNormalizeHandler().handle(message({ userId: undefined })))
      .rejects.toThrow("userId is required for order normalization");

    expect(upsertNormalizedOrder).not.toHaveBeenCalled();
    expect(saveNormalizeCheckpoint).not.toHaveBeenCalled();
  });

  it("requires sourceRequestId in the normalize job payload", async () => {
    await expect(new OrderNormalizeHandler().handle(message({}, false)))
      .rejects.toThrow("sourceRequestId is required");

    expect(findJobResultForNormalize).not.toHaveBeenCalled();
  });
});

function message(
  overrides: Record<string, unknown> = {},
  includeSourceRequestId = true
): JobHandlerMessage {
  return {
    requestId: "normalize-1",
    requestKey: "NORMALIZE_collect-1",
    sourceErp: "HUB",
    jobType: "ORDER_NORMALIZE",
    payload: {
      ...(includeSourceRequestId ? { sourceRequestId: "collect-1" } : {}),
      userId: 1,
      corpId: 100,
      channelAccountId: 10,
      channelCd: "MOCK_MALL",
      mallKey: "MOCK_MALL",
      ...overrides
    }
  };
}

function jobResult(
  resultPayload: Record<string, unknown>,
  jobPayloadOverrides: Record<string, unknown> = {}
) {
  return {
    requestId: "collect-1",
    requestKey: "COLLECT_1",
    sourceErp: "HUB",
    resultPayload,
    jobPayload: {
      userId: 1,
      corpId: 100,
      channelAccountId: 10,
      channelCd: "MOCK_MALL",
      mallKey: "MOCK_MALL",
      ...jobPayloadOverrides
    }
  };
}
