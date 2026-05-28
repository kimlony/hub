import axios, { type AxiosInstance } from "axios";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../../logger.js";
import type { GodoFetchOrdersResult, GodoOrder } from "./types.js";

export class GodoApiClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.GODO_BASE_URL ?? "http://openhub.godo.co.kr/godomall5",
      headers: {
        Accept: "application/xml",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 30000
    });
  }

  async fetchOrders(
    partnerKey: string,
    key: string,
    frDt: string,
    toDt: string
  ): Promise<GodoFetchOrdersResult> {
    const form = new URLSearchParams({
      partner_key: partnerKey,
      key,
      dateType: "order",
      startDate: toDateString(frDt),
      endDate: toDateString(toDt),
      size: getPageSize()
    });

    logger.debug({
      event: "GODO_API_REQUEST_STARTED",
      url: "/order/Order_Search.php",
      dateType: "order",
      startDate: toDateString(frDt),
      endDate: toDateString(toDt),
      size: getPageSize()
    }, "GODO fetch orders request started");

    const response = await this.client.post<string>("/order/Order_Search.php", form.toString());
    return parseOrdersXml(response.data);
  }
}

function parseOrdersXml(xml: string): GodoFetchOrdersResult {
  if (!xml.trim()) {
    return {
      rawXml: xml,
      code: "",
      message: "",
      lastOrder: false,
      orders: []
    };
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true
  });
  const parsed = parser.parse(xml) as unknown;
  const data = toRecord(toRecord(parsed).data);
  const header = toRecord(data.header);
  const code = toStringValue(header.code);
  const message = toStringValue(header.msg);
  const lastOrder = toBooleanValue(header.lastOrder);

  if (code && !isSuccessCode(code)) {
    throw new Error(`GODO API failed (${code}): ${message}`);
  }

  return {
    rawXml: xml,
    code,
    message,
    lastOrder,
    orders: extractOrders(data.return)
  };
}

function extractOrders(returnNode: unknown): GodoOrder[] {
  const node = toRecord(returnNode);
  const candidates = [
    node.order,
    node.orders,
    node.order_data,
    node.orderData,
    node.orderList,
    node.list
  ];

  for (const candidate of candidates) {
    const orders = toArray(candidate).map((item) => toRecord(item)).filter(hasKeys);
    if (orders.length > 0) {
      return orders;
    }
  }

  return hasKeys(node) ? [node] : [];
}

function toDateString(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`Invalid date format: ${value}`);
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function getPageSize(): string {
  const pageSize = Number(process.env.GODO_PAGE_SIZE ?? 100);
  return Number.isFinite(pageSize) && pageSize > 0 ? String(Math.trunc(pageSize)) : "100";
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function hasKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

function toStringValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function toBooleanValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return String(value).toLowerCase() === "true";
}

function isSuccessCode(code: string): boolean {
  return code === "000" || code === "0";
}
