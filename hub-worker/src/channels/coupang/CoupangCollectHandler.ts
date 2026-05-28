import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { logger } from "../../logger.js";
import { CoupangApiClient } from "./CoupangApiClient.js";

type CoupangPayload = {
  corpCd: string;
  channelCd: "COUPANG";
  channelAccountId: string;
  authType: "API_KEY";
  authInfo: {
    apiKey: string;
    secretKey: string;
    vendorId: string;
  };
  frDt: string;
  toDt: string;
};

export class CoupangCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new CoupangApiClient();
    const orders = await client.fetchOrders(
      payload.authInfo.apiKey,
      payload.authInfo.secretKey,
      payload.authInfo.vendorId,
      payload.frDt,
      payload.toDt
    );

    logger.info({
      event: "HTTP_COLLECT_ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      orderCount: orders.length
    }, "COUPANG collect orders collected");

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: orders.length,
      orders
    };
  }
}

function parsePayload(payload: Record<string, unknown>): CoupangPayload {
  const authInfo = requireRecord(payload.authInfo, "authInfo");
  const parsed = {
    corpCd: requireString(payload.corpCd, "corpCd"),
    channelCd: requireString(payload.channelCd, "channelCd"),
    channelAccountId: requireString(payload.channelAccountId, "channelAccountId"),
    authType: requireString(payload.authType, "authType"),
    authInfo: {
      apiKey: requireCredential(authInfo.apiKey, "authInfo.apiKey"),
      secretKey: requireCredential(authInfo.secretKey, "authInfo.secretKey"),
      vendorId: requireCredential(authInfo.vendorId, "authInfo.vendorId")
    },
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "COUPANG") {
    throw new Error(`Unsupported channelCd for COUPANG handler: ${parsed.channelCd}`);
  }

  if (parsed.authType !== "API_KEY") {
    throw new Error(`Unsupported authType for COUPANG: ${parsed.authType}`);
  }

  return parsed as CoupangPayload;
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
