import axios, { type AxiosInstance } from "axios";
import { AxiosError } from "axios";
import crypto from "node:crypto";
import { logger } from "../../logger.js";
import type { CoupangOrder, CoupangOrderItem } from "./types.js";

type CoupangApiOrderItem = {
  orderItemId?: unknown;
  productId?: unknown;
  sellerProductName?: unknown;
  sellerProductItemName?: unknown;
  shippingCount?: unknown;
  orderPrice?: unknown;
};

type CoupangApiOrder = {
  orderId?: unknown;
  orderStatus?: unknown;
  orderedAt?: unknown;
  receiver?: {
    name?: unknown;
    safeNumber?: unknown;
    phone?: unknown;
    addr1?: unknown;
    addr2?: unknown;
    postCode?: unknown;
    deliveryMemo?: unknown;
  };
  totalPrice?: unknown;
  orderItems?: CoupangApiOrderItem[];
};

type CoupangApiResponse = {
  data?: CoupangApiOrder[];
  nextToken?: string | null;
};

export class CoupangApiClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://api-gateway.coupang.com",
      timeout: 30000
    });
  }

  async fetchOrders(
    apiKey: string,
    secretKey: string,
    vendorId: string,
    frDt: string,
    toDt: string
  ): Promise<CoupangOrder[]> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets`;
    const orders: CoupangOrder[] = [];
    let nextToken: string | undefined;

    do {
      const queryString = buildQueryString(frDt, toDt, nextToken);
      const datetime = createCoupangDatetime();
      const signature = createSignature(secretKey, datetime, "GET", path, queryString);
      const authorization = createAuthorization(apiKey, datetime, signature);

      logger.debug({
        event: "COUPANG_API_REQUEST_SIGNED",
        method: "GET",
        path,
        queryString,
        datetime,
        authorizationPreview: createAuthorization(
          maskSecret(apiKey),
          datetime,
          `${signature.slice(0, 8)}...${signature.slice(-8)}`
        ),
        token: nextToken ?? null
      }, "COUPANG request signed");

      let response;
      try {
        response = await this.client.get<CoupangApiResponse>(`${path}?${queryString}`, {
          headers: {
            Authorization: authorization,
            "Content-Type": "application/json;charset=UTF-8"
          }
        });
      } catch (error) {
        if (error instanceof AxiosError) {
          logger.error({
            event: "COUPANG_API_REQUEST_FAILED",
            err: error,
            status: error.response?.status,
            statusText: error.response?.statusText,
            responseData: error.response?.data,
            path,
            queryString,
            datetime
          }, "COUPANG request failed");
        }

        throw error;
      }

      const data = response.data.data ?? [];
      orders.push(...data.map(mapOrder));

      nextToken = normalizeOptionalString(response.data.nextToken);
    } while (nextToken);

    return orders;
  }
}

function buildQueryString(frDt: string, toDt: string, token?: string): string {
  const params = new URLSearchParams();
  params.set("createdAtFrom", `${toIsoDate(frDt)}T00:00`);
  params.set("createdAtTo", `${toIsoDate(toDt)}T23:59`);
  params.set("status", "ACCEPT");
  params.set("searchType", "timeFrame");
  params.set("perPage", "100");

  if (token) {
    params.set("token", token);
  }

  return params.toString();
}

function createCoupangDatetime(): string {
  const now = new Date();
  const yy = pad2(now.getUTCFullYear() % 100);
  const mm = pad2(now.getUTCMonth() + 1);
  const dd = pad2(now.getUTCDate());
  const hh = pad2(now.getUTCHours());
  const mi = pad2(now.getUTCMinutes());
  const ss = pad2(now.getUTCSeconds());
  return `${yy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function createSignature(
  secretKey: string,
  datetime: string,
  method: string,
  path: string,
  queryString: string
): string {
  const message = `${datetime}${method}${path}${queryString}`;
  return crypto.createHmac("sha256", secretKey).update(message).digest("hex");
}

function createAuthorization(apiKey: string, datetime: string, signature: string): string {
  return `CEA algorithm=HmacSHA256, access-key=${apiKey}, signed-date=${datetime}, signature=${signature}`;
}

function mapOrder(item: CoupangApiOrder): CoupangOrder {
  const receiver = item.receiver ?? {};
  const addr1 = normalizeString(receiver.addr1);
  const addr2 = normalizeString(receiver.addr2);

  return {
    orderId: normalizeString(item.orderId),
    orderStatus: normalizeString(item.orderStatus),
    orderedAt: normalizeString(item.orderedAt),
    receiverName: normalizeString(receiver.name),
    receiverPhone: normalizeString(receiver.safeNumber) || normalizeString(receiver.phone),
    receiverAddress: `${addr1} ${addr2}`.trim(),
    receiverZipCode: normalizeString(receiver.postCode),
    deliveryMessage: normalizeString(receiver.deliveryMemo),
    totalPrice: normalizeNumber(item.totalPrice),
    items: (item.orderItems ?? []).map(mapOrderItem)
  };
}

function mapOrderItem(item: CoupangApiOrderItem): CoupangOrderItem {
  return {
    orderItemId: normalizeString(item.orderItemId),
    productId: normalizeString(item.productId),
    sellerProductName: normalizeString(item.sellerProductName),
    itemName: normalizeString(item.sellerProductItemName),
    quantity: normalizeNumber(item.shippingCount),
    orderPrice: normalizeNumber(item.orderPrice)
  };
}

function toIsoDate(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`Invalid date format: ${value}`);
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return value.trim();
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
