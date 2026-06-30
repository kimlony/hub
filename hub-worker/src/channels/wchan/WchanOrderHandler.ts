import { saveJobLog, saveJobResult } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { WchanApiClient } from "./WchanApiClient.js";

type WchanPayload = {
  channelCd: "WCHAN";
  mallKey: string;
  mallId: string;
  mallPw: string;
  frDt: string;
  toDt: string;
};

export class WchanOrderHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    const client = new WchanApiClient();

    logger.info({
      event: "CHANNEL_API_REQUEST_STARTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      frDt: payload.frDt,
      toDt: payload.toDt,
      hasMallId: Boolean(payload.mallId),
      hasMallPw: Boolean(payload.mallPw)
    }, "WCHAN order collection started");

    const { sessionKey } = await client.login(payload.mallId, payload.mallPw);
    const orders = await client.fetchOrders(
      sessionKey,
      payload.mallId,
      payload.frDt,
      payload.toDt
    );

    logger.info({
      event: "ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      orderCount: orders.length
    }, "WCHAN orders collected");
    await saveJobLog({
      requestId: message.requestId,
      eventType: "ORDERS_COLLECTED",
      level: "INFO",
      message: "WCHAN orders collected",
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
      channelCd: payload.channelCd,
      frDt: payload.frDt,
      toDt: payload.toDt,
      totalCount: orders.length,
      orders
    });

    logger.info({
      event: "CHANNEL_RESULT_SAVE_COMPLETED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      totalCount: orders.length
    }, "WCHAN result save completed");
  }
}

function parsePayload(payload: Record<string, unknown>): WchanPayload {
  const parsed = {
    channelCd: requireString(payload.channelCd, "channelCd"),
    mallKey: requireString(payload.mallKey, "mallKey"),
    mallId: requireCredential(payload.mallId, "mallId"),
    mallPw: requireCredential(payload.mallPw, "mallPw"),
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "WCHAN") {
    throw new Error(`Unsupported channelCd for WCHAN handler: ${parsed.channelCd}`);
  }

  return parsed as WchanPayload;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function requireCredential(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}
