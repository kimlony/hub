import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { logger } from "../../logger.js";
import { OnryApiClient } from "./OnryApiClient.js";

type OnryPayload = {
  corpCd: string;
  channelCd: "ONRY";
  channelAccountId: string;
  authType: "ID_PW";
  authInfo: {
    companyId: string;
    password: string;
    apiKey?: string;
  };
  frDt: string;
  toDt: string;
};

export class OnryCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new OnryApiClient(undefined, payload.authInfo.apiKey);
    const { accessToken } = await client.login(
      payload.authInfo.companyId,
      payload.authInfo.password
    );
    const orders = await client.fetchOrders(accessToken, payload.frDt, payload.toDt);

    logger.info({
      event: "HTTP_COLLECT_ORDERS_COLLECTED",
      requestId: message.requestId,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      orderCount: orders.length
    }, "ONRY collect orders collected");

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: orders.length,
      orders
    };
  }
}

function parsePayload(payload: Record<string, unknown>): OnryPayload {
  const authInfo = requireRecord(payload.authInfo, "authInfo");
  const parsed = {
    corpCd: requireString(payload.corpCd, "corpCd"),
    channelCd: requireString(payload.channelCd, "channelCd"),
    channelAccountId: requireString(payload.channelAccountId, "channelAccountId"),
    authType: requireString(payload.authType, "authType"),
    authInfo: {
      companyId: requireCredential(authInfo.companyId, "authInfo.companyId"),
      password: requireCredential(authInfo.password, "authInfo.password"),
      apiKey: optionalCredential(authInfo.apiKey)
    },
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "ONRY") {
    throw new Error(`Unsupported channelCd for ONRY handler: ${parsed.channelCd}`);
  }
  if (parsed.authType !== "ID_PW") {
    throw new Error(`Unsupported authType for ONRY: ${parsed.authType}`);
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


function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} is required and must be an object`);
  }
  return value as Record<string, unknown>;
}
