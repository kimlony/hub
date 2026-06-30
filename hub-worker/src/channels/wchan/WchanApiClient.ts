import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import { logger } from "../../logger.js";
import type { WchanOrder } from "./WchanOrder.js";

export type WchanHttpClient = Pick<AxiosInstance, "get" | "post">;

type OrderListBody = {
  selectOrderStatusStats?: unknown;
  navi?: unknown;
  searchMap?: unknown;
  selectOrderList?: unknown;
};

type OrderListResponse = OrderListBody & {
  data?: OrderListBody;
};

const LOGIN_PATH = "/admin/login-request";
const ORDER_LIST_PATH = "/admin/sell/erp/order/list";
const PAGE_SIZE = 100;

export class WchanApiClient {
  private readonly client: WchanHttpClient;

  constructor(client?: WchanHttpClient) {
    this.client = client ?? axios.create({
      baseURL: process.env.WCHAN_BASE_URL ?? "https://scmdev.buyis.co.kr",
      timeout: 30000
    });
  }

  async login(sellerId: string, password: string): Promise<{ sessionKey: string }> {
    const form = new URLSearchParams({
      mbsd_id: sellerId,
      mbsd_pass: password
    });
    const response = await this.client.post<never, AxiosResponse<unknown>>(
      LOGIN_PATH,
      form.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        maxRedirects: 0,
        validateStatus: (status) => status === 302
      }
    );

    const location = headerValue(response.headers.location);
    if (location?.includes("fail=true")) {
      throw new Error("WCHAN login failed: invalid seller ID or password");
    }

    return {
      sessionKey: extractSessionKey(response.headers["set-cookie"])
    };
  }

  async fetchOrders(
    sessionKey: string,
    sellerId: string,
    frDt: string,
    toDt: string
  ): Promise<WchanOrder[]> {
    const orders: WchanOrder[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const params = {
        mbsd_id: sellerId,
        search_day_from_: requireDate(frDt),
        search_day_to_: requireDate(toDt),
        list_count_: String(PAGE_SIZE),
        currPage: page
      };

      logger.debug({
        event: "WCHAN_API_REQUEST_STARTED",
        url: ORDER_LIST_PATH,
        page,
        params
      }, "WCHAN fetch orders request started");

      const response = await this.client.get<OrderListResponse>(ORDER_LIST_PATH, {
        headers: {
          Cookie: `JSESSIONID=${sessionKey}`
        },
        maxRedirects: 0,
        params
      });
      const data = response.data.data ?? response.data;
      const list = Array.isArray(data.selectOrderList) ? data.selectOrderList : [];
      const navigation = toRecord(data.navi);
      totalPages = Math.max(1, toPositiveInteger(navigation.totalPage, 1));
      const responsePage = toPositiveInteger(navigation.currPage, page);

      if (responsePage !== page) {
        throw new Error(`WCHAN pagination mismatch: requested=${page}, received=${responsePage}`);
      }

      logger.debug({
        event: "WCHAN_API_RESPONSE_RECEIVED",
        page,
        totalPages,
        totalRecords: toPositiveInteger(navigation.totalRec, list.length),
        listCount: list.length
      }, "WCHAN fetch orders response received");

      orders.push(...list.map(normalizeOrder));
      page += 1;
    }

    return orders;
  }
}

function extractSessionKey(setCookie: unknown): string {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];

  for (const cookie of cookies) {
    if (typeof cookie !== "string") {
      continue;
    }
    const match = /(?:^|;\s*)JSESSIONID=([^;]+)/i.exec(cookie);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error("WCHAN login failed: JSESSIONID cookie was not issued");
}

function normalizeOrder(raw: unknown): WchanOrder {
  const item = toRecord(raw);

  return {
    ...item,
    rdmg_code: toStringValue(item.rdmg_code),
    rdmg_index: toNumberValue(item.rdmg_index),
    rdmg_order_date: toStringValue(item.rdmg_order_date),
    rdmg_order_status: toNumberValue(item.rdmg_order_status),
    rdmg_price: toNumberValue(item.rdmg_price),
    rdmg_delivery_cost: toNumberValue(item.rdmg_delivery_cost),
    rdmg_delivery_type: toNumberValue(item.rdmg_delivery_type),
    rdmg_delivery_on: toStringValue(item.rdmg_delivery_on),
    rdmg_buy_amount: toNumberValue(item.rdmg_buy_amount),
    rdmg_contents: toStringValue(item.rdmg_contents),
    rdmg_payment_composition: toStringValue(item.rdmg_payment_composition),
    gdmg_code: toStringValue(item.gdmg_code),
    gdmg_goods_name: toStringValue(item.gdmg_goods_name),
    gdmg_mange_code: toStringValue(item.gdmg_mange_code),
    gdmg_support_price: toNumberValue(item.gdmg_support_price),
    gdmg_sale_channel: toNumberValue(item.gdmg_sale_channel),
    wmng_name: toStringValue(item.wmng_name),
    mdtf_reg_name: toStringValue(item.mdtf_reg_name),
    mdtf_ceo_name: toStringValue(item.mdtf_ceo_name),
    mdtf_phone: toStringValue(item.mdtf_phone),
    sellerId: toStringValue(item.sellerId),
    odermbsd_id: toStringValue(item.odermbsd_id),
    lmmf_idx: toStringValue(item.lmmf_idx),
    lmmf_name: toStringValue(item.lmmf_name),
    mbgr_hp: toStringValue(item.mbgr_hp),
    rddr_name: toStringValue(item.rddr_name),
    lastStatusDate: toStringValue(item.lastStatusDate),
    gmgg_url: toStringValue(item.gmgg_url),
    gmgg_name: toStringValue(item.gmgg_name),
    gmgg_file_format: toStringValue(item.gmgg_file_format)
  };
}

function requireDate(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`Invalid date format: ${value}. Expected yyyyMMdd`);
  }
  return value;
}

function headerValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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

function toPositiveInteger(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : fallback;
}
