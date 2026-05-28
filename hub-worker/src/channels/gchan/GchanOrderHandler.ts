import { saveJobLog, saveJobResult } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { GchanApiClient } from "./GchanApiClient.js";
// import { GchanOracleSaver } from "./GchanOracleSaver.js";

type GchanPayload = {
  channelCd: string;
  mallKey:   string;
  mallId:    string;   // seller ID (로그인 아이디)
  mallPw:    string;   // password
  frDt:      string;
  toDt:      string;
};

export class GchanOrderHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    const client  = new GchanApiClient();

    logger.info({
      event: "CHANNEL_API_REQUEST_STARTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      frDt: payload.frDt,
      toDt: payload.toDt,
      hasMallId: Boolean(payload.mallId),
      hasMallPw: Boolean(payload.mallPw)
    }, "GCHAN order collection started");

    const { accessToken, sellerSeq } = await client.login(payload.mallId, payload.mallPw);
    const orders = await client.fetchOrders(accessToken, sellerSeq, payload.frDt, payload.toDt);

    logger.info({
      event: "ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      orderCount: orders.length
    }, "GCHAN orders collected");
    await saveJobLog({
      requestId: message.requestId,
      eventType: "ORDERS_COLLECTED",
      level: "INFO",
      message: "GCHAN orders collected",
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

    // await GchanOracleSaver.saveAll(orders, payload);

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
    }, "GCHAN result save completed");
  }
}

function parsePayload(payload: Record<string, unknown>): GchanPayload {
  const parsed = {
    channelCd: requireString(payload.channelCd, "channelCd"),
    mallKey:   requireString(payload.mallKey,   "mallKey"),
    mallId:    requireString(payload.mallId,    "mallId"),
    mallPw:    requireString(payload.mallPw,    "mallPw"),
    frDt:      requireString(payload.frDt,      "frDt"),
    toDt:      requireString(payload.toDt,      "toDt"),
  };

  if (parsed.channelCd !== "GCHAN") {
    throw new Error(`Unsupported channelCd for GCHAN handler: ${parsed.channelCd}`);
  }

  return parsed;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}
