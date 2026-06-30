import { saveJobLog, saveJobResult } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { OnryApiClient } from "./OnryApiClient.js";

type OnryPayload = {
  channelCd: "ONRY";
  mallKey: string;
  mallId: string;
  mallPw: string;
  authKey?: string;
  frDt: string;
  toDt: string;
};

export class OnryOrderHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    const client = new OnryApiClient(undefined, payload.authKey);

    logger.info({
      event: "CHANNEL_API_REQUEST_STARTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      frDt: payload.frDt,
      toDt: payload.toDt,
      hasMallId: Boolean(payload.mallId),
      hasMallPw: Boolean(payload.mallPw),
      apiKeySource: payload.authKey ? "channel_account" : "environment"
    }, "ONRY order collection started");

    const { accessToken } = await client.login(payload.mallId, payload.mallPw);
    const orders = await client.fetchOrders(accessToken, payload.frDt, payload.toDt);

    logger.info({
      event: "ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      orderCount: orders.length
    }, "ONRY orders collected");
    await saveJobLog({
      requestId: message.requestId,
      eventType: "ORDERS_COLLECTED",
      level: "INFO",
      message: "ONRY orders collected",
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
    }, "ONRY result save completed");
  }
}

function parsePayload(payload: Record<string, unknown>): OnryPayload {
  const parsed = {
    channelCd: requireString(payload.channelCd, "channelCd"),
    mallKey: requireString(payload.mallKey, "mallKey"),
    mallId: requireCredential(payload.mallId, "mallId"),
    mallPw: requireCredential(payload.mallPw, "mallPw"),
    authKey: optionalCredential(payload.authKey),
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "ONRY") {
    throw new Error(`Unsupported channelCd for ONRY handler: ${parsed.channelCd}`);
  }
  return parsed as OnryPayload;
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

function optionalCredential(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
