import {
  findJobResultForNormalize,
  saveJobLog,
  saveNormalizeCheckpoint,
  upsertNormalizedDelivery,
  upsertNormalizedOrder,
  upsertNormalizedOrderItem
} from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { NormalizerRegistry } from "./NormalizerRegistry.js";
import { firstNonBlank, isRecord, toStringValue } from "./normalizeUtils.js";
import type { RawOrderContext } from "./types.js";

const normalizerRegistry = new NormalizerRegistry();

export class OrderNormalizeHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const sourceRequestId = requireString(message.payload.sourceRequestId, "sourceRequestId");
    const result = await findJobResultForNormalize(sourceRequestId);
    const resultPayload = result.resultPayload;
    const jobPayload = result.jobPayload;
    const orders = Array.isArray(resultPayload.orders) ? resultPayload.orders : [];

    if (orders.length === 0) {
      await saveNormalizeCheckpoint({
        sourceRequestId,
        status: "SUCCESS",
        normalizedCount: 0
      });
      return;
    }

    const context = buildContext(message, resultPayload, jobPayload, result);
    const normalizer = normalizerRegistry.get(context.channelCd);
    let normalizedCount = 0;

    // Normalize one raw order at a time so a channel mapper owns only field
    // translation, while persistence/idempotency stays centralized here.
    for (const rawOrder of orders) {
      if (!isRecord(rawOrder)) {
        continue;
      }

      const normalized = normalizer.normalize(rawOrder, context);
      if (!normalized) {
        logger.warn({
          event: "ORDER_NORMALIZE_ITEM_SKIPPED",
          requestId: message.requestId,
          sourceRequestId,
          channelCd: context.channelCd,
          reason: "normalizer_returned_null"
        }, "Order normalize item skipped");
        continue;
      }

      const orderId = await upsertNormalizedOrder({
        userId: context.userId,
        requestId: context.requestId,
        requestKey: context.requestKey,
        sourceErp: context.sourceErp,
        channelCd: context.channelCd,
        mallKey: context.mallKey,
        channelOrderId: normalized.channelOrderId,
        orderStatus: normalized.orderStatus,
        orderDate: normalized.orderDate,
        paidAt: normalized.paidAt,
        buyerName: normalized.buyerName,
        buyerTel: normalized.buyerTel,
        buyerEmail: normalized.buyerEmail,
        paymentMethod: normalized.paymentMethod,
        orderAmount: normalized.orderAmount,
        productAmount: normalized.productAmount,
        deliveryFee: normalized.deliveryFee,
        discountAmount: normalized.discountAmount,
        rawPayload: normalized.rawPayload
      });

      for (const item of normalized.items) {
        await upsertNormalizedOrderItem({
          orderId,
          channelOrderItemId: item.channelOrderItemId,
          productId: item.productId,
          sellerProductCode: item.sellerProductCode,
          skuCode: item.skuCode,
          productName: item.productName,
          optionName: item.optionName,
          itemStatus: item.itemStatus,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          itemAmount: item.itemAmount,
          discountAmount: item.discountAmount,
          expectedSettlementAmount: item.expectedSettlementAmount,
          rawPayload: item.rawPayload
        });
      }

      if (normalized.delivery) {
        await upsertNormalizedDelivery({
          orderId,
          receiverName: normalized.delivery.receiverName,
          receiverTel: normalized.delivery.receiverTel,
          receiverZipCode: normalized.delivery.receiverZipCode,
          receiverAddr1: normalized.delivery.receiverAddr1,
          receiverAddr2: normalized.delivery.receiverAddr2,
          deliveryMemo: normalized.delivery.deliveryMemo,
          deliveryCompany: normalized.delivery.deliveryCompany,
          trackingNumber: normalized.delivery.trackingNumber,
          deliveryStatus: normalized.delivery.deliveryStatus,
          rawPayload: normalized.delivery.rawPayload
        });
      }

      normalizedCount += 1;
    }

    await saveNormalizeCheckpoint({
      sourceRequestId,
      status: "SUCCESS",
      normalizedCount
    });
    await saveJobLog({
      requestId: message.requestId,
      eventType: "ORDER_NORMALIZE_COMPLETED",
      level: "INFO",
      message: "Order normalize completed",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: context.channelCd,
      detail: {
        sourceRequestId,
        normalizedCount,
        normalizer: normalizer.constructor.name
      }
    });

    logger.info({
      event: "ORDER_NORMALIZE_COMPLETED",
      requestId: message.requestId,
      sourceRequestId,
      channelCd: context.channelCd,
      normalizedCount,
      normalizer: normalizer.constructor.name
    }, "Order normalize completed");
  }
}

function buildContext(
  message: JobHandlerMessage,
  resultPayload: Record<string, unknown>,
  jobPayload: Record<string, unknown>,
  result: { requestId: string; requestKey: string; sourceErp: string }
): RawOrderContext {
  const userId = toInteger(message.payload.userId ?? resultPayload.userId ?? jobPayload.userId);
  if (userId === null) {
    throw new Error("userId is required for order normalization");
  }

  const channelCd = firstNonBlank(
    toStringValue(message.payload.channelCd),
    toStringValue(resultPayload.channelCd),
    toStringValue(jobPayload.channelCd)
  );
  if (!channelCd) {
    throw new Error("channelCd is required for order normalization");
  }

  return {
    userId,
    requestId: result.requestId,
    requestKey: result.requestKey,
    sourceErp: result.sourceErp,
    channelCd,
    mallKey: firstNonBlank(toStringValue(message.payload.mallKey), toStringValue(jobPayload.mallKey), channelCd) ?? channelCd
  };
}

function requireString(value: unknown, fieldName: string): string {
  const text = toStringValue(value);
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  return text;
}

function toInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
