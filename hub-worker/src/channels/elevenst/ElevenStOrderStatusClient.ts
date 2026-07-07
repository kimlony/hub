import axios, { type AxiosInstance } from "axios";
import { XMLParser } from "fast-xml-parser";
import type { OrderStatusCandidate, OrderStatusClient, OrderStatusFetchInput } from "../orderStatusSync/OrderStatusClient.js";
import { requireString, toArray, toRecord, text, targetOrderIds } from "../orderStatusSync/statusClientUtils.js";

export class ElevenStOrderStatusClient implements OrderStatusClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://api.11st.co.kr/rest",
      timeout: 30000,
      headers: {
        Accept: "application/xml"
      }
    });
  }

  async fetchOrderStatuses(input: OrderStatusFetchInput): Promise<OrderStatusCandidate[]> {
    const apiKey = requireString(input.payload.key, "key");
    const orderIds = [...targetOrderIds(input.targets)];
    if (orderIds.length === 0) {
      return [];
    }

    const updates: OrderStatusCandidate[] = [];
    for (const chunk of chunks(orderIds, getChunkSize())) {
      const response = await this.client.get<ArrayBuffer>(
        `/claimservice/orderlistalladdr/${chunk.join(",")}`,
        {
          responseType: "arraybuffer",
          headers: { openapikey: apiKey }
        }
      );
      const xml = new TextDecoder("euc-kr").decode(response.data);
      updates.push(...parseStatusXml(xml));
    }
    return updates;
  }
}

function parseStatusXml(xml: string): OrderStatusCandidate[] {
  if (!xml.trim()) {
    return [];
  }
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const parsed = parser.parse(xml) as unknown;
  const rows = toArray(toRecord(toRecord(parsed).orders).order);
  return rows
    .map((row) => toRecord(row))
    .map((row) => ({
      channelOrderId: requireString(row.ordNo, "ordNo"),
      channelOrderItemId: text(row, "ordPrdSeq"),
      orderStatus: mapElevenStStatus(text(row, "ordPrdStat", "ordPrdStatNm")),
      claimStatus: mapElevenStClaimStatus(text(row, "ordPrdStat", "ordPrdStatNm")),
      deliveryStatus: mapElevenStDeliveryStatus(text(row, "ordPrdStat", "ordPrdStatNm")),
      deliveryCompany: text(row, "dlvEtprsCd"),
      trackingNumber: text(row, "invcNo"),
      rawPayload: row
    }));
}

function mapElevenStStatus(value: string | null): string | null {
  const code = normalizeCode(value);
  if (["101"].includes(code)) return "ORDER_CONFIRMED";
  if (["102"].includes(code)) return "PAYMENT_PENDING";
  if (["201", "202"].includes(code)) return "PAID";
  if (["301"].includes(code)) return "INSTRUCT";
  if (["401"].includes(code)) return "DELIVERING";
  if (["501", "901"].includes(code)) return "FINAL_DELIVERY";
  if (["701", "B01", "C01"].includes(code)) return "CANCELLED";
  if (["A01"].includes(code)) return "RETURN_COMPLETE";
  return value;
}

function mapElevenStClaimStatus(value: string | null): string | null {
  const code = normalizeCode(value);
  if (["601"].includes(code)) return "CLAIM_IN_PROGRESS";
  if (["701"].includes(code)) return "CANCEL_REQUEST";
  if (["B01", "C01"].includes(code)) return "CANCELLED";
  if (["A01"].includes(code)) return "RETURN_COMPLETE";
  return null;
}

function mapElevenStDeliveryStatus(value: string | null): string | null {
  const code = normalizeCode(value);
  if (["401"].includes(code)) return "DELIVERING";
  if (["501", "901"].includes(code)) return "FINAL_DELIVERY";
  return null;
}

function normalizeCode(value: string | null): string {
  return (value ?? "").trim().toUpperCase();
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function getChunkSize(): number {
  const value = Number(process.env.ELEVENST_STATUS_SYNC_CHUNK_SIZE ?? 50);
  return Number.isInteger(value) && value > 0 ? value : 50;
}

