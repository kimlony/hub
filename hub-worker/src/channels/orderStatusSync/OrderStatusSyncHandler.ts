import {
  applyOrderStatusUpdates,
  findOrdersForStatusSync,
  saveJobLog,
  type OrderStatusUpdateResult,
  type OrderStatusSyncTarget
} from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import {
  MockMallOrderStatusClient,
  type OrderStatusClient
} from "../mockMall/MockMallOrderStatusClient.js";
import { normalizeOrderStatus } from "../orderNormalize/OrderStatusNormalizer.js";

type FindTargets = typeof findOrdersForStatusSync;
type ApplyUpdates = typeof applyOrderStatusUpdates;
type SaveLog = typeof saveJobLog;

export class OrderStatusSyncHandler implements IJobHandler {
  constructor(
    private readonly client: OrderStatusClient = new MockMallOrderStatusClient(),
    private readonly findTargets: FindTargets = findOrdersForStatusSync,
    private readonly applyUpdates: ApplyUpdates = applyOrderStatusUpdates,
    private readonly saveLog: SaveLog = saveJobLog
  ) {}

  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    const targets: OrderStatusSyncTarget[] = await this.findTargets({
      channelAccountId: payload.channelAccountId,
      from: parseCompactDate(payload.frDt),
      toExclusive: dayAfter(parseCompactDate(payload.toDt))
    });
    const fetched = await this.client.fetchOrderStatuses({
      targets,
      statusTypes: payload.statusTypes
    });
    const result: OrderStatusUpdateResult = await this.applyUpdates({
      requestId: message.requestId,
      channelAccountId: payload.channelAccountId,
      updates: fetched.map((status) => ({
        channelOrderId: status.channelOrderId,
        orderStatus: normalizeOrderStatus(
          status.orderStatus,
          status.claimStatus,
          status.deliveryStatus
        ),
        claimStatus: status.claimStatus,
        deliveryStatus: status.deliveryStatus,
        deliveryCompany: status.deliveryCompany,
        trackingNumber: status.trackingNumber,
        rawPayload: status.rawPayload
      }))
    });

    logger.info({
      event: "ORDER_STATUS_SYNC_COMPLETED",
      requestId: message.requestId,
      channelAccountId: payload.channelAccountId,
      ...result
    }, "Order status sync completed");
    await this.saveLog({
      requestId: message.requestId,
      eventType: "ORDER_STATUS_SYNC_COMPLETED",
      level: "INFO",
      message: "Order status sync completed",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: payload.channelCd,
      mallKey: payload.mallKey,
      detail: result
    });
  }
}

function parsePayload(payload: Record<string, unknown>): {
  channelAccountId: number;
  channelCd: string;
  mallKey: string;
  frDt: string;
  toDt: string;
  statusTypes: string[];
} {
  const statusTypes = Array.isArray(payload.statusTypes)
    ? payload.statusTypes.filter((value): value is string => typeof value === "string" && value.trim() !== "")
    : [];
  if (statusTypes.length === 0) throw new Error("statusTypes is required");
  return {
    channelAccountId: requiredPositiveNumber(payload.channelAccountId, "channelAccountId"),
    channelCd: requiredString(payload.channelCd, "channelCd"),
    mallKey: requiredString(payload.mallKey, "mallKey"),
    frDt: requiredDate(payload.frDt, "frDt"),
    toDt: requiredDate(payload.toDt, "toDt"),
    statusTypes
  };
}

function requiredPositiveNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} is required`);
  return parsed;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
}

function requiredDate(value: unknown, field: string): string {
  const text = requiredString(value, field);
  if (!/^\d{8}$/.test(text)) throw new Error(`${field} must be yyyyMMdd`);
  return text;
}

function parseCompactDate(value: string): Date {
  const date = new Date(Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8))
  ));
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function dayAfter(value: Date): Date {
  return new Date(value.getTime() + 24 * 60 * 60 * 1000);
}
