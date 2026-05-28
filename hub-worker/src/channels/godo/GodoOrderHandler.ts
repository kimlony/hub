import { saveJobLog, saveJobResult } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { GodoApiClient } from "./GodoApiClient.js";

type GodoPayload = {
  channelCd: string;
  mallKey: string;
  partnerKey: string;
  key: string;
  frDt: string;
  toDt: string;
};

export class GodoOrderHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    const client = new GodoApiClient();

    logger.info({
      event: "CHANNEL_API_REQUEST_STARTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      frDt: payload.frDt,
      toDt: payload.toDt,
      hasKey: Boolean(payload.key),
      hasPartnerKey: Boolean(payload.partnerKey)
    }, "GODO order collection started");

    const result = await client.fetchOrders(
      payload.partnerKey,
      payload.key,
      payload.frDt,
      payload.toDt
    );

    logger.info({
      event: "ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      orderCount: result.orders.length,
      code: result.code,
      lastOrder: result.lastOrder
    }, "GODO orders collected");
    await saveJobLog({
      requestId: message.requestId,
      eventType: "ORDERS_COLLECTED",
      level: "INFO",
      message: "GODO orders collected",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      detail: {
        orderCount: result.orders.length,
        frDt: payload.frDt,
        toDt: payload.toDt,
        code: result.code,
        message: result.message,
        lastOrder: result.lastOrder
      }
    });

    await saveJobResult(message, {
      channelCd: payload.channelCd,
      frDt: payload.frDt,
      toDt: payload.toDt,
      totalCount: result.orders.length,
      code: result.code,
      message: result.message,
      lastOrder: result.lastOrder,
      rawXml: result.rawXml,
      orders: result.orders
    });

    logger.info({
      event: "CHANNEL_RESULT_SAVE_COMPLETED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      totalCount: result.orders.length
    }, "GODO result save completed");
  }
}

function parsePayload(payload: Record<string, unknown>): GodoPayload {
  const parsed = {
    channelCd: requireString(payload.channelCd, "channelCd"),
    mallKey: requireString(payload.mallKey, "mallKey"),
    partnerKey: requireString(payload.key, "key"),
    key: requireString(payload.key2 ?? payload.authKey, "key2 or authKey"),
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "GODO") {
    throw new Error(`Unsupported channelCd for GODO handler: ${parsed.channelCd}`);
  }

  return parsed;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}
