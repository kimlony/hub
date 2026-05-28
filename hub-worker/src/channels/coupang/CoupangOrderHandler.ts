import { saveJobLog, saveJobResult } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { CoupangApiClient } from "./CoupangApiClient.js";

type CoupangPayload = {
  channelCd: string;
  mallKey:   string;
  key:       string;   // access key
  key2:      string;   // secret key
  vendorId:  string;
  frDt:      string;
  toDt:      string;
};

export class CoupangOrderHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    const client  = new CoupangApiClient();

    logger.info({
      event: "CHANNEL_API_REQUEST_STARTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      frDt: payload.frDt,
      toDt: payload.toDt,
      hasVendorId: Boolean(payload.vendorId),
      hasKey: Boolean(payload.key),
      hasKey2: Boolean(payload.key2)
    }, "COUPANG order collection started");

    const orders = await client.fetchOrders(
      payload.key,
      payload.key2,
      payload.vendorId,
      payload.frDt,
      payload.toDt
    );

    logger.info({
      event: "ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      orderCount: orders.length
    }, "COUPANG orders collected");
    await saveJobLog({
      requestId: message.requestId,
      eventType: "ORDERS_COLLECTED",
      level: "INFO",
      message: "COUPANG orders collected",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      detail: {
        orderCount: orders.length,
        frDt: payload.frDt,
        toDt: payload.toDt
      }
    });

    await saveJobResult(message, {
      channelCd:  payload.channelCd,
      frDt:       payload.frDt,
      toDt:       payload.toDt,
      totalCount: orders.length,
      orders,
    });

    logger.info({
      event: "CHANNEL_RESULT_SAVE_COMPLETED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      totalCount: orders.length
    }, "COUPANG result save completed");
  }
}

function parsePayload(payload: Record<string, unknown>): CoupangPayload {
  return {
    channelCd: requireString(payload.channelCd, "channelCd"),
    mallKey:   requireString(payload.mallKey,   "mallKey"),
    key:       requireString(payload.key,       "key"),
    key2:      requireString(payload.key2,      "key2"),
    vendorId:  requireString(payload.vendorId,  "vendorId"),
    frDt:      requireString(payload.frDt,      "frDt"),
    toDt:      requireString(payload.toDt,      "toDt"),
  };
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}
