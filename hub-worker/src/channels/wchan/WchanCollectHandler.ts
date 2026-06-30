import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { logger } from "../../logger.js";
import { WchanApiClient } from "./WchanApiClient.js";

type WchanPayload = {
  corpCd: string;
  channelCd: "WCHAN";
  channelAccountId: string;
  authType: "ID_PW";
  authInfo: {
    mbsd_id: string;
    mbsd_pass: string;
  };
  frDt: string;
  toDt: string;
};

export class WchanCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new WchanApiClient();
    const { sessionKey } = await client.login(
      payload.authInfo.mbsd_id,
      payload.authInfo.mbsd_pass
    );
    const orders = await client.fetchOrders(
      sessionKey,
      payload.authInfo.mbsd_id,
      payload.frDt,
      payload.toDt
    );

    logger.info({
      event: "HTTP_COLLECT_ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      orderCount: orders.length
    }, "WCHAN collect orders collected");

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: orders.length,
      orders
    };
  }
}

function parsePayload(payload: Record<string, unknown>): WchanPayload {
  const authInfo = requireRecord(payload.authInfo, "authInfo");
  const parsed = {
    corpCd: requireString(payload.corpCd, "corpCd"),
    channelCd: requireString(payload.channelCd, "channelCd"),
    channelAccountId: requireString(payload.channelAccountId, "channelAccountId"),
    authType: requireString(payload.authType, "authType"),
    authInfo: {
      mbsd_id: requireCredential(authInfo.mbsd_id, "authInfo.mbsd_id"),
      mbsd_pass: requireCredential(authInfo.mbsd_pass, "authInfo.mbsd_pass")
    },
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "WCHAN") {
    throw new Error(`Unsupported channelCd for WCHAN handler: ${parsed.channelCd}`);
  }

  if (parsed.authType !== "ID_PW") {
    throw new Error(`Unsupported authType for WCHAN: ${parsed.authType}`);
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

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} is required and must be an object`);
  }
  return value as Record<string, unknown>;
}
