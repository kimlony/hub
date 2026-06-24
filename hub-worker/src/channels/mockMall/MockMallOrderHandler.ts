import { saveJobLog, saveJobResult } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { MockMallApiClient } from "./MockMallApiClient.js";
import { parseMockMallPayload } from "./MockMallCollectHandler.js";

export class MockMallOrderHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parseMockMallPayload(message.payload);
    const client = new MockMallApiClient();

    logger.info({
      event: "MOCK_MALL_ORDER_COLLECTION_STARTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      page: payload.page,
      size: payload.size,
      totalCount: payload.totalCount
    }, "Mock Mall order collection started");

    const result = await client.fetchOrders(payload);

    await saveJobLog({
      requestId: message.requestId,
      eventType: "ORDERS_COLLECTED",
      level: "INFO",
      message: "Mock Mall orders collected",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      detail: {
        page: payload.page,
        size: payload.size,
        totalCount: result.totalCount,
        orderCount: result.orders.length,
        hasNext: result.hasNext,
        seed: payload.seed
      }
    });

    await saveJobResult(message, {
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      page: result.page,
      size: result.size,
      totalCount: result.totalCount,
      seed: result.seed,
      runId: optionalString(message.payload.runId),
      scenario: optionalString(message.payload.scenario),
      hasNext: result.hasNext,
      orders: result.orders
    });

    logger.info({
      event: "MOCK_MALL_RESULT_SAVE_COMPLETED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      orderCount: result.orders.length
    }, "Mock Mall result save completed");
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
