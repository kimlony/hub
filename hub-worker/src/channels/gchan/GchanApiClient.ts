import axios, { type AxiosInstance } from "axios";
import { logger } from "../../logger.js";
import type { GchanOrder } from "./types.js";

type LoginResponse = {
  data?: {
    accessToken?: unknown;
    sellerSeq?: unknown;
  };
};

type OrderListResponse = {
  data?: {
    list?: unknown;
    content?: unknown;
    totalPages?: unknown;
  };
};

export class GchanApiClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.GCHAN_BASE_URL ?? "https://sellerapidev.schancedev.co.kr",
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 30000
    });
  }

  async login(sellerId: string, password: string): Promise<{ accessToken: string; sellerSeq: number }> {
    const response = await this.client.post<LoginResponse>("/api/seller/auth/login", {
      sellerId,
      password
    });
    const data = response.data.data ?? {};
    const accessToken = requireString(data.accessToken, "data.accessToken");
    const sellerSeq = requireNumber(data.sellerSeq, "data.sellerSeq");

    return {
      accessToken,
      sellerSeq
    };
  }

  async fetchOrders(
    accessToken: string,
    sellerSeq: number,
    frDt: string,
    toDt: string
  ): Promise<GchanOrder[]> {
    const orders: GchanOrder[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const params = {
        startAt: toDateString(frDt),
        endAt: toDateString(toDt),
        page,
        size: 100,
        receivedStatus: "RECEIVED"
      };

      logger.debug({
        event: "GCHAN_API_REQUEST_STARTED",
        url: "/api/seller/sales/order/giftchance/recipients",
        sellerSeq,
        params
      }, "GCHAN fetch orders request started");

      const response = await this.client.get<OrderListResponse>(
        "/api/seller/sales/order/giftchance/recipients",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Cookie: `sellerSeq=${sellerSeq}`
          },
          params
        }
      );

      const data = response.data.data ?? {};
      const list = Array.isArray(data.list)
        ? data.list
        : Array.isArray(data.content)
          ? data.content
          : [];
      totalPages = Math.max(1, requireNumber(data.totalPages ?? 1, "data.totalPages"));

      logger.debug({
        event: "GCHAN_API_RESPONSE_RECEIVED",
        page,
        totalPages,
        listCount: list.length,
        dataKeys: Object.keys(data),
        contentCount: Array.isArray(data.content) ? data.content.length : 0
      }, "GCHAN fetch orders response received");

      orders.push(...list.map(normalizeOrder));
      page += 1;
    }

    return orders;
  }
}

function normalizeOrder(raw: unknown): GchanOrder {
  const item = toRecord(raw);

  return {
    ...item,
    recipientId: toNumberValue(item.recipientId),
    giftSendId: toNumberValue(item.giftSendId),
    itemId: toNumberValue(item.itemId),
    orderCode: toStringValue(item.orderCode),
    recipientName: toStringValue(item.recipientName),
    recipientPhone: toStringValue(item.recipientPhone),
    receivedStatus: toStringValue(item.receivedStatus),
    address1: toStringValue(item.address1),
    address2: toStringValue(item.address2),
    productName: toStringValue(item.productName),
    combinationName: toStringValue(item.combinationName),
    quantity: toNumberValue(item.quantity),
    totalPrice: toNumberValue(item.totalPrice),
    giftSupplyPrice: toNumberValue(item.giftSupplyPrice),
    paidAt: toStringValue(item.paidAt),
    paymentStatus: toStringValue(item.paymentStatus),
    sellerSeq: toNumberValue(item.sellerSeq),
    sellerName: toStringValue(item.sellerName),
    senderFullName: toStringValue(item.senderFullName),
    trackingNumber: toStringValue(item.trackingNumber),
    deliveryStatus: toStringValue(item.deliveryStatus)
  };
}

function toDateString(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`Invalid date format: ${value}`);
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

function requireNumber(value: unknown, fieldName: string): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${fieldName} must be a number`);
  }

  return numberValue;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toStringValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function toNumberValue(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}
