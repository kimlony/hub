import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { logger } from "../../logger.js";
import { GchanApiClient } from "./GchanApiClient.js";

type GchanPayload = {
  corpCd: string;
  channelCd: "GCHAN";
  channelAccountId: string;
  authType: "ID_PW";
  authInfo: {
    sellerId: string;
    password: string;
  };
  frDt: string;
  toDt: string;
};

export class GchanCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new GchanApiClient();
    const { accessToken, sellerSeq } = await client.login(
      payload.authInfo.sellerId,
      payload.authInfo.password
    );
    const orders = await client.fetchOrders(accessToken, sellerSeq, payload.frDt, payload.toDt);

    logger.info({
      event: "HTTP_COLLECT_ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      orderCount: orders.length
    }, "GCHAN collect orders collected");

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: orders.length,
      orders
    };
  }
}

function parsePayload(payload: Record<string, unknown>): GchanPayload {
  const authInfo = requireRecord(payload.authInfo, "authInfo");
  const parsed = {
    corpCd: requireString(payload.corpCd, "corpCd"),
    channelCd: requireString(payload.channelCd, "channelCd"),
    channelAccountId: requireString(payload.channelAccountId, "channelAccountId"),
    authType: requireString(payload.authType, "authType"),
    authInfo: {
      sellerId: requireCredential(authInfo.sellerId, "authInfo.sellerId"),
      password: requireCredential(authInfo.password, "authInfo.password")
    },
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "GCHAN") {
    throw new Error(`Unsupported channelCd for GCHAN handler: ${parsed.channelCd}`);
  }

  if (parsed.authType !== "ID_PW") {
    throw new Error(`Unsupported authType for GCHAN: ${parsed.authType}`);
  }

  return parsed as GchanPayload;
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
