import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  MOCK_MALL_CHANNEL_CD,
  type GenerateMockMallOrdersResult,
  type MockMallOrder,
  type MockMallOrderItem
} from "./MockMallOrderGenerator.js";

const FIXTURE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

type CachedFixture = {
  modifiedAtMs: number;
  orders: MockMallOrder[];
};

export class MockMallFixtureStore {
  private readonly cache = new Map<string, CachedFixture>();

  constructor(private readonly fixtureDirectory = process.env.MOCK_MALL_FIXTURE_DIR ?? path.resolve(process.cwd(), "mock-fixtures")) {}

  async fetchOrders(input: {
    fixtureFile: string;
    page?: number;
    size?: number;
    mallKey?: string;
  }): Promise<GenerateMockMallOrdersResult> {
    const fixtureFile = validateFixtureFileName(input.fixtureFile);
    const orders = await this.readOrders(fixtureFile);
    const page = positiveInteger(input.page, 1);
    const size = positiveInteger(input.size, 100);
    const mallKey = nonBlank(input.mallKey, "mock-mall-001");
    const startIndex = (page - 1) * size;
    const pageOrders: MockMallOrder[] = orders.slice(startIndex, startIndex + size).map((order): MockMallOrder => ({
      ...order,
      channelCd: MOCK_MALL_CHANNEL_CD,
      mallKey
    }));

    return {
      channelCd: MOCK_MALL_CHANNEL_CD,
      mallKey,
      page,
      size,
      totalCount: orders.length,
      seed: `fixture:${fixtureFile}`,
      hasNext: startIndex + pageOrders.length < orders.length,
      orders: pageOrders
    };
  }

  private async readOrders(fixtureFile: string): Promise<MockMallOrder[]> {
    const fixturePath = path.join(this.fixtureDirectory, fixtureFile);
    const metadata = await stat(fixturePath);
    const cached = this.cache.get(fixturePath);
    if (cached?.modifiedAtMs === metadata.mtimeMs) {
      return cached.orders;
    }

    const document = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
    const orders = extractOrders(document, fixtureFile);
    this.cache.set(fixturePath, { modifiedAtMs: metadata.mtimeMs, orders });
    return orders;
  }
}

export function validateFixtureFileName(value: unknown): string {
  if (typeof value !== "string" || !FIXTURE_FILE_NAME.test(value)) {
    throw new Error("fixtureFile must be a JSON filename without a path");
  }
  return value;
}

function extractOrders(document: unknown, fixtureFile: string): MockMallOrder[] {
  const rows = Array.isArray(document)
    ? document
    : isRecord(document) && Array.isArray(document.orders)
      ? document.orders
      : null;
  if (!rows) {
    throw new Error(`Mock Mall fixture ${fixtureFile} must contain an orders array`);
  }

  return rows.map((row, index) => parseOrder(row, fixtureFile, index));
}

function parseOrder(value: unknown, fixtureFile: string, index: number): MockMallOrder {
  if (!isRecord(value)) {
    throw new Error(`Mock Mall fixture ${fixtureFile} order ${index + 1} must be an object`);
  }
  const items = Array.isArray(value.items)
    ? value.items.map((item, itemIndex) => parseItem(item, fixtureFile, index, itemIndex))
    : null;
  if (!items || items.length === 0) {
    throw new Error(`Mock Mall fixture ${fixtureFile} order ${index + 1} must contain items`);
  }

  return {
    channelCd: MOCK_MALL_CHANNEL_CD,
    mallKey: optionalText(value.mallKey, "mock-mall-001"),
    orderNo: requiredText(value.orderNo, fixtureFile, index, "orderNo"),
    orderedAt: requiredText(value.orderedAt, fixtureFile, index, "orderedAt"),
    paidAt: nullableText(value.paidAt),
    orderStatus: requiredStatus(value.orderStatus, fixtureFile, index),
    buyerName: optionalText(value.buyerName, "Demo Buyer"),
    buyerTel: optionalText(value.buyerTel, "010-0000-0000"),
    buyerEmail: optionalText(value.buyerEmail, "demo@mock-mall.test"),
    paymentMethod: optionalText(value.paymentMethod, "CARD"),
    orderAmount: requiredNumber(value.orderAmount, fixtureFile, index, "orderAmount"),
    productAmount: requiredNumber(value.productAmount, fixtureFile, index, "productAmount"),
    deliveryFee: requiredNumber(value.deliveryFee, fixtureFile, index, "deliveryFee"),
    discountAmount: requiredNumber(value.discountAmount, fixtureFile, index, "discountAmount"),
    items,
    receiverName: optionalText(value.receiverName, "Demo Receiver"),
    receiverTel: optionalText(value.receiverTel, "010-0000-0000"),
    receiverZipCode: optionalText(value.receiverZipCode, "00000"),
    receiverAddr1: optionalText(value.receiverAddr1, "Demo-ro 1"),
    receiverAddr2: optionalText(value.receiverAddr2, ""),
    deliveryMemo: optionalText(value.deliveryMemo, "")
  };
}

function parseItem(value: unknown, fixtureFile: string, orderIndex: number, itemIndex: number): MockMallOrderItem {
  if (!isRecord(value)) {
    throw new Error(`Mock Mall fixture ${fixtureFile} order ${orderIndex + 1} item ${itemIndex + 1} must be an object`);
  }
  const context = `${fixtureFile} order ${orderIndex + 1} item ${itemIndex + 1}`;
  return {
    channelOrderItemId: requiredText(value.channelOrderItemId, context, 0, "channelOrderItemId"),
    productId: requiredText(value.productId, context, 0, "productId"),
    productName: requiredText(value.productName, context, 0, "productName"),
    optionName: optionalText(value.optionName, ""),
    quantity: requiredNumber(value.quantity, context, 0, "quantity"),
    unitPrice: requiredNumber(value.unitPrice, context, 0, "unitPrice"),
    itemAmount: requiredNumber(value.itemAmount, context, 0, "itemAmount")
  };
}

function requiredStatus(value: unknown, fixtureFile: string, index: number): MockMallOrder["orderStatus"] {
  if (value === "PAID" || value === "READY_TO_SHIP" || value === "SHIPPED" || value === "CANCELLED") {
    return value;
  }
  throw new Error(`Mock Mall fixture ${fixtureFile} order ${index + 1} has an unsupported orderStatus`);
}

function requiredText(value: unknown, fixtureFile: string, index: number, field: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new Error(`Mock Mall fixture ${fixtureFile} order ${index + 1} requires ${field}`);
}

function optionalText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredNumber(value: unknown, fixtureFile: string, index: number, field: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  throw new Error(`Mock Mall fixture ${fixtureFile} order ${index + 1} requires numeric ${field}`);
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonBlank(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
