import { saveJobLog, saveJobResult } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { ElevenStApiClient } from "./ElevenStApiClient.js";
// import { ElevenStOracleSaver } from "./ElevenStOracleSaver.js";

type ElevenStPayload = {
  channelCd: string;
  mallKey:   string;
  key:       string;   // API key
  frDt:      string;
  toDt:      string;
};

export class ElevenStOrderHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    const client  = new ElevenStApiClient(payload.key);

    logger.info({
      event: "CHANNEL_API_REQUEST_STARTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      frDt: payload.frDt,
      toDt: payload.toDt
    }, "11ST order collection started");

    const { rawXml, orders } = await client.fetchOrders(payload.frDt, payload.toDt);

    logger.info({
      event: "ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      orderCount: orders.length
    }, "11ST orders collected");
    await saveJobLog({
      requestId: message.requestId,
      eventType: "ORDERS_COLLECTED",
      level: "INFO",
      message: "11ST orders collected",
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

    // await ElevenStOracleSaver.saveAll(orders, payload);

    await saveJobResult(message, {
      channelCd:  payload.channelCd,
      frDt:       payload.frDt,
      toDt:       payload.toDt,
      totalCount: orders.length,
      rawXml,
      orders,
    });

    logger.info({
      event: "CHANNEL_RESULT_SAVE_COMPLETED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      totalCount: orders.length
    }, "11ST result save completed");
  }
}

function parsePayload(payload: Record<string, unknown>): ElevenStPayload {
  const parsed = {
    channelCd: requireString(payload.channelCd, "channelCd"),
    mallKey:   requireString(payload.mallKey,   "mallKey"),
    key:       requireString(payload.key,       "key"),
    frDt:      requireString(payload.frDt,      "frDt"),
    toDt:      requireString(payload.toDt,      "toDt"),
  };

  if (parsed.channelCd !== "11ST") {
    throw new Error(`Unsupported channelCd for 11ST handler: ${parsed.channelCd}`);
  }

  return parsed;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}
