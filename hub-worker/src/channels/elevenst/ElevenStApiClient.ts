import axios, { type AxiosInstance } from "axios";
import { XMLParser } from "fast-xml-parser";
import type { ElevenStOrder, ElevenStOrderItem } from "./types.js";

export type ElevenStFetchOrdersResult = {
  rawXml: string;
  orders: ElevenStOrder[];
};

export class ElevenStApiClient {
  private readonly client: AxiosInstance;

  constructor(apiKey: string) {
    const openApiKey = process.env.ELEVENST_API_KEY_OVERRIDE?.trim() || apiKey;

    this.client = axios.create({
      baseURL: "https://api.11st.co.kr/rest",
      headers: {
        openapikey: openApiKey,
        Accept: "application/xml"
      },
      timeout: 30000
    });
  }

  async fetchOrders(frDt: string, toDt: string): Promise<ElevenStFetchOrdersResult> {
    const startTime = `${frDt}0000`;
    const endTime   = `${toDt}2359`;

    // 11번가 API는 EUC-KR로 응답 → ArrayBuffer로 받아서 직접 디코딩
    const response = await this.client.get<ArrayBuffer>(
      `/ordservices/complete/${startTime}/${endTime}`,
      { responseType: "arraybuffer" }
    );

    const decoder  = new TextDecoder("euc-kr");
    const xmlString = decoder.decode(response.data);

    return {
      rawXml: xmlString,
      orders: parseOrdersXml(xmlString)
    };
  }
}

function parseOrdersXml(xml: string): ElevenStOrder[] {
  if (!xml.trim()) {
    return [];
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true
  });
  const parsed = parser.parse(xml) as unknown;
  const orderLines = toArray(toRecord(toRecord(parsed).orders).order);

  if (orderLines.length === 0) {
    return [];
  }

  const ordersByOrdNo = new Map<string, ElevenStOrder>();

  for (const rawLine of orderLines) {
    const line = toRecord(rawLine);
    const ordNo = toStringValue(line.ordNo);

    if (!ordNo) {
      continue;
    }

    const order = ordersByOrdNo.get(ordNo) ?? createOrder(line, ordNo);
    order.items.push(createOrderItem(line));
    ordersByOrdNo.set(ordNo, order);
  }

  return [...ordersByOrdNo.values()];
}

function createOrder(line: Record<string, unknown>, ordNo: string): ElevenStOrder {
  return {
    ordNo,
    ordDt: toStringValue(line.ordDt),
    payDt: toStringValue(line.ordStlEndDt),
    ordStatCd: "",
    ordStatNm: "결제완료",
    buyerNm: toStringValue(line.ordNm),
    buyerTel: firstNonEmpty(line.ordPrtblTel, line.ordTlphnNo),
    rcvrNm: toStringValue(line.rcvrNm),
    rcvrTel: firstNonEmpty(line.rcvrPrtblNo, line.rcvrTlphn),
    rcvrAddr1: toStringValue(line.rcvrBaseAddr),
    rcvrAddr2: toStringValue(line.rcvrDtlsAddr),
    dlvMsg: nullSafeString(line.ordDlvReqCont),
    ordAmt: toNumberValue(line.ordAmt),
    payAmt: toNumberValue(line.ordPayAmt),
    items: []
  };
}

function createOrderItem(line: Record<string, unknown>): ElevenStOrderItem {
  return {
    ordSeq: toStringValue(line.ordPrdSeq),
    prdNo: toStringValue(line.prdNo),
    prdNm: toStringValue(line.prdNm),
    optNm: toStringValue(line.slctPrdOptNm),
    ordQty: toNumberValue(line.ordQty),
    ordPrc: toNumberValue(line.selPrc),
    ordAmt: toNumberValue(line.ordAmt),
    dlvCost: toNumberValue(line.dlvCst),
    statCd: "결제완료"
  };
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
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

function toStringValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function nullSafeString(value: unknown): string {
  const stringValue = toStringValue(value);
  return stringValue.toLowerCase() === "null" ? "" : stringValue;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const stringValue = nullSafeString(value);
    if (stringValue) {
      return stringValue;
    }
  }

  return "";
}

function toNumberValue(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}
