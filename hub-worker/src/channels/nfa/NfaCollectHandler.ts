import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { logger } from "../../logger.js";
import { NfaApiClient } from "./NfaApiClient.js";

type NfaPayload = {
  corpCd: string;
  channelCd: "NSS";
  channelAccountId: string;
  authType: "API_KEY";
  authInfo: {
    clientId: string;
    clientSecret: string;
  };
  frDt: string;
  toDt: string;
};

export class NfaCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new NfaApiClient();
    const orders = await client.fetchOrders(
      payload.authInfo.clientId,
      payload.authInfo.clientSecret,
      payload.frDt,
      payload.toDt
    );

    logger.info({
      event: "HTTP_COLLECT_ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      orderCount: orders.length
    }, "NSS collect orders collected");

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: orders.length,
      orders
    };
  }
}

function parsePayload(payload: Record<string, unknown>): NfaPayload {
  const authInfo = requireRecord(payload.authInfo, "authInfo");
  const parsed = {
    corpCd: requireString(payload.corpCd, "corpCd"),
    channelCd: requireString(payload.channelCd, "channelCd"),
    channelAccountId: requireString(payload.channelAccountId, "channelAccountId"),
    authType: requireString(payload.authType, "authType"),
    authInfo: {
      clientId: requireCredential(authInfo.clientId, "authInfo.clientId"),
      clientSecret: requireCredential(authInfo.clientSecret, "authInfo.clientSecret")
    },
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "NSS") {
    throw new Error(`Unsupported channelCd for NSS handler: ${parsed.channelCd}`);
  }

  if (parsed.authType !== "API_KEY") {
    throw new Error(`Unsupported authType for NSS: ${parsed.authType}`);
  }

  return parsed as NfaPayload;
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
