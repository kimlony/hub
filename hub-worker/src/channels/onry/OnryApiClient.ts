import axios, { type AxiosInstance } from "axios";
import { logger } from "../../logger.js";
import type { OnryOrder } from "./OnryOrder.js";

export type OnryHttpClient = Pick<AxiosInstance, "get" | "post">;

type LoginResponse = {
  token_type?: unknown;
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  refresh_expires_in?: unknown;
};

type OrderListResponse = {
  total?: unknown;
  page?: unknown;
  size?: unknown;
  items?: unknown;
};

const PAGE_SIZE = 100;

export class OnryApiClient {
  private readonly client: OnryHttpClient;
  private readonly apiKey: string;

  constructor(client?: OnryHttpClient, apiKey = process.env.ONRY_X_API_KEY ?? "") {
    this.client = client ?? axios.create({
      baseURL: process.env.ONRY_BASE_URL ?? "https://api.onnurichance.com",
      timeout: 30000,
      headers: {
        "Content-Type": "application/json"
      }
    });
    this.apiKey = apiKey.trim();
  }

  async login(companyId: string, password: string): Promise<{ accessToken: string }> {
    const apiKey = this.requireApiKey();
    const response = await this.client.post<LoginResponse>(
      "/auth/company/login",
      {
        company_id: companyId,
        password
      },
      {
        headers: {
          "X-API-Key": apiKey
        }
      }
    );

    return {
      accessToken: requireString(response.data.access_token, "access_token")
    };
  }

  async fetchOrders(accessToken: string, frDt: string, toDt: string): Promise<OnryOrder[]> {
    const apiKey = this.requireApiKey();
    const orders: OnryOrder[] = [];
    let page = 1;

    while (true) {
      const params = {
        page,
        size: PAGE_SIZE,
        date_type: "paid",
        from_date: toApiDate(frDt),
        to_date: toApiDate(toDt)
      };

      logger.debug({
        event: "ONRY_API_REQUEST_STARTED",
        url: "/companies/me/order-products",
        page,
        params
      }, "ONRY fetch orders request started");

      const response = await this.client.get<OrderListResponse>(
        "/companies/me/order-products",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-API-Key": apiKey
          },
          params
        }
      );
      const items = Array.isArray(response.data.items) ? response.data.items : [];
      const total = toNonNegativeInteger(response.data.total, items.length);

      logger.debug({
        event: "ONRY_API_RESPONSE_RECEIVED",
        page,
        total,
        itemCount: items.length
      }, "ONRY fetch orders response received");

      orders.push(...items.map(normalizeOrder));

      if (items.length === 0 || orders.length >= total) {
        break;
      }
      page += 1;
    }

    return orders;
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new Error("ONRY_X_API_KEY is required");
    }
    return this.apiKey;
  }
}

function normalizeOrder(raw: unknown): OnryOrder {
  const item = toRecord(raw);

  return {
    ...item,
    id: toNumberValue(item.id),
    order_number: toStringValue(item.order_number),
    product_code: toStringValue(item.product_code),
    option_uid: toStringValue(item.option_uid),
    option1: toStringValue(item.option1),
    option2: toStringValue(item.option2),
    option3: toStringValue(item.option3),
    product_name: toStringValue(item.product_name),
    partner_code: toStringValue(item.partner_code),
    quantity: toNumberValue(item.quantity),
    price: toNumberValue(item.price),
    supply_price: toNumberValue(item.supply_price),
    delivery_price: toNumberValue(item.delivery_price),
    add_delivery_price: toNumberValue(item.add_delivery_price),
    delivery_type: toStringValue(item.delivery_type),
    product_type: toStringValue(item.product_type),
    shipping_status: toStringValue(item.shipping_status),
    shipping_company: toStringValue(item.shipping_company),
    tracking_number: toStringValue(item.tracking_number),
    shipped_at: toStringValue(item.shipped_at),
    completed_at: toStringValue(item.completed_at),
    cancel_status: toStringValue(item.cancel_status),
    complain_status: toStringValue(item.complain_status),
    settlement_status: toStringValue(item.settlement_status),
    ordered_at: toStringValue(item.ordered_at),
    paid_at: toStringValue(item.paid_at),
    order_status: toStringValue(item.order_status),
    order_pay_status: toStringValue(item.order_pay_status),
    order_canceled: toStringValue(item.order_canceled),
    buyer_name: toStringValue(item.buyer_name),
    buyer_phone: toStringValue(item.buyer_phone),
    receiver_name: toStringValue(item.receiver_name),
    receiver_phone: toStringValue(item.receiver_phone),
    receiver_zipcode: toStringValue(item.receiver_zipcode),
    receiver_address1: toStringValue(item.receiver_address1),
    receiver_address2: toStringValue(item.receiver_address2),
    delivery_message: toStringValue(item.delivery_message)
  };
}

function toApiDate(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`Invalid date format: ${value}. Expected yyyyMMdd`);
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
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

function toNonNegativeInteger(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : fallback;
}
