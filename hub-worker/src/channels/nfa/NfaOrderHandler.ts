import { saveJobLog, saveJobResult } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { NfaApiClient } from "./NfaApiClient.js";

type NfaPayload = {
  channelCd: string;
  mallKey:   string;
  key:       string;   // client ID
  key2:      string;   // client secret
  frDt:      string;
  toDt:      string;
};

export class NfaOrderHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    const client  = new NfaApiClient();

    logger.info({
      event: "CHANNEL_API_REQUEST_STARTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      frDt: payload.frDt,
      toDt: payload.toDt,
      hasKey: Boolean(payload.key),
      hasKey2: Boolean(payload.key2)
    }, "NSS order collection started");

    const rawOrders = await client.fetchOrders(
      payload.key,
      payload.key2,
      payload.frDt,
      payload.toDt
    );

    logger.info({
      event: "ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      orderCount: rawOrders.length
    }, "NSS orders collected");
    await saveJobLog({
      requestId: message.requestId,
      eventType: "ORDERS_COLLECTED",
      level: "INFO",
      message: "NSS orders collected",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      detail: {
        orderCount: rawOrders.length,
        frDt: payload.frDt,
        toDt: payload.toDt
      }
    });

    await saveJobResult(message, {
      channelCd:  payload.channelCd,
      frDt:       payload.frDt,
      toDt:       payload.toDt,
      totalCount: rawOrders.length,
      orders:     rawOrders,
    });

    logger.info({
      event: "CHANNEL_RESULT_SAVE_COMPLETED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      totalCount: rawOrders.length
    }, "NSS result save completed");
  }
}

function parsePayload(payload: Record<string, unknown>): NfaPayload {
  const parsed = {
    channelCd: requireString(payload.channelCd, "channelCd"),
    mallKey:   requireString(payload.mallKey,   "mallKey"),
    key:       requireString(payload.key,       "key"),
    key2:      requireString(payload.key2,      "key2"),
    frDt:      requireString(payload.frDt,      "frDt"),
    toDt:      requireString(payload.toDt,      "toDt"),
  };

  if (parsed.channelCd !== "NSS") {
    throw new Error(`Unsupported channelCd for NSS handler: ${parsed.channelCd}`);
  }

  return parsed;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}
