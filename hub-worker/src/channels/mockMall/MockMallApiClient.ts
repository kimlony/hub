import { generateMockMallOrders, type GenerateMockMallOrdersResult } from "./MockMallOrderGenerator.js";

export type MockMallFetchOrdersInput = {
  page?: number;
  size?: number;
  totalCount?: number;
  seed?: string;
  mallKey?: string;
  delayMs?: number;
  errorRate?: number;
  timeoutRate?: number;
};

export class MockMallApiClient {
  async fetchOrders(input: MockMallFetchOrdersInput): Promise<GenerateMockMallOrdersResult> {
    const delayMs = safeNumber(input.delayMs, 0);
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const failureRoll = deterministicRoll(input.seed, input.page, "failure");
    if (failureRoll < safeRate(input.timeoutRate)) {
      throw new Error("Mock Mall API timeout");
    }

    const errorRoll = deterministicRoll(input.seed, input.page, "error");
    if (errorRoll < safeRate(input.errorRate)) {
      throw new Error("Mock Mall API error");
    }

    return generateMockMallOrders(input);
  }
}

function deterministicRoll(seed: unknown, page: unknown, salt: string): number {
  const text = `${typeof seed === "string" ? seed : "mock-mall-default"}:${Number(page) || 1}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function safeRate(value: unknown): number {
  const parsed = safeNumber(value, 0);
  return Math.max(0, Math.min(parsed, 1));
}

function safeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
