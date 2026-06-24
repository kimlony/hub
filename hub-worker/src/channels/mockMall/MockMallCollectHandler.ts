import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { logger } from "../../logger.js";
import { DEFAULT_MOCK_MALL_KEY, MOCK_MALL_CHANNEL_CD } from "./MockMallOrderGenerator.js";
import { MockMallApiClient } from "./MockMallApiClient.js";

type MockMallPayload = {
  channelCd: typeof MOCK_MALL_CHANNEL_CD;
  mallKey: string;
  page: number;
  size: number;
  totalCount: number;
  seed: string;
  delayMs: number;
  errorRate: number;
  timeoutRate: number;
};

export class MockMallCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new MockMallApiClient();
    const result = await client.fetchOrders(payload);

    logger.info({
      event: "MOCK_MALL_COLLECT_COMPLETED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      page: payload.page,
      size: payload.size,
      totalCount: result.totalCount,
      orderCount: result.orders.length,
      hasNext: result.hasNext
    }, "Mock Mall collect completed");

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: result.totalCount,
      orders: result.orders
    };
  }
}

export function parseMockMallPayload(payload: Record<string, unknown>): MockMallPayload {
  return parsePayload(payload);
}

function parsePayload(payload: Record<string, unknown>): MockMallPayload {
  const channelCd = requireString(payload.channelCd, "channelCd");
  if (channelCd !== MOCK_MALL_CHANNEL_CD) {
    throw new Error(`Unsupported channelCd for MOCK_MALL handler: ${channelCd}`);
  }

  return {
    channelCd,
    mallKey: optionalString(payload.mallKey, DEFAULT_MOCK_MALL_KEY),
    page: positiveInteger(payload.page, 1),
    size: positiveInteger(payload.size, 100),
    totalCount: nonNegativeInteger(payload.totalCount, 10000),
    seed: optionalString(payload.seed, "mock-mall-default"),
    delayMs: nonNegativeNumber(payload.delayMs, 0),
    errorRate: rate(payload.errorRate),
    timeoutRate: rate(payload.timeoutRate)
  };
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function rate(value: unknown): number {
  return Math.max(0, Math.min(nonNegativeNumber(value, 0), 1));
}
