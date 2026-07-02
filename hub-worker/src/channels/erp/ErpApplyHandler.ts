import {
  areErpOrdersAlreadyApplied,
  findNormalizedOrdersForErp,
  saveErpApplyResults
} from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { MockErpAdapter, MockErpError, type MockErpRequest } from "./MockErpAdapter.js";

export class ErpApplyHandler implements IJobHandler {
  constructor(private readonly adapter = new MockErpAdapter()) {}

  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    if (await areErpOrdersAlreadyApplied(payload.idempotencyKey, payload.normalizedOrderIds)) {
      return;
    }

    const orders = await findNormalizedOrdersForErp(payload.normalizedOrderIds);
    if (orders.length !== payload.normalizedOrderIds.length) {
      throw new Error("One or more normalized orders were not found for ERP_APPLY");
    }
    const request: MockErpRequest = {
      erpConnectionId: payload.erpConnectionId,
      operation: payload.operation,
      idempotencyKey: payload.idempotencyKey,
      orders
    };

    try {
      const response = await this.adapter.apply(request, {
        mockFail: payload.mockFail,
        mockErrorCode: payload.mockErrorCode
      });
      await saveErpApplyResults({
        requestId: message.requestId,
        correlationId: message.correlationId ?? message.requestId,
        normalizedOrderIds: payload.normalizedOrderIds,
        erpConnectionId: payload.erpConnectionId,
        operation: payload.operation,
        status: "APPLIED",
        idempotencyKey: payload.idempotencyKey,
        erpDocumentNo: response.erpDocumentNo,
        requestPayload: request as unknown as Record<string, unknown>,
        responsePayload: response
      });
    } catch (error) {
      const errorCode = error instanceof MockErpError ? error.code : "ERP_TECHNICAL_ERROR";
      const errorMessage = error instanceof Error ? error.message : String(error);
      await saveErpApplyResults({
        requestId: message.requestId,
        correlationId: message.correlationId ?? message.requestId,
        normalizedOrderIds: payload.normalizedOrderIds,
        erpConnectionId: payload.erpConnectionId,
        operation: payload.operation,
        status: "FAILED",
        idempotencyKey: payload.idempotencyKey,
        requestPayload: request as unknown as Record<string, unknown>,
        errorCode,
        errorMessage
      });
      throw error;
    }
  }
}

function parsePayload(payload: Record<string, unknown>) {
  const normalizedOrderIds = Array.isArray(payload.normalizedOrderIds)
    ? payload.normalizedOrderIds.map(Number).filter(Number.isInteger)
    : [];
  if (normalizedOrderIds.length === 0) {
    throw new Error("normalizedOrderIds is required for ERP_APPLY");
  }
  return {
    normalizedOrderIds,
    erpConnectionId: requiredString(payload.erpConnectionId, "erpConnectionId"),
    operation: requiredString(payload.operation, "operation"),
    idempotencyKey: requiredString(payload.idempotencyKey, "idempotencyKey"),
    mockFail: payload.mockFail === true,
    mockErrorCode: typeof payload.mockErrorCode === "string" ? payload.mockErrorCode : undefined
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required for ERP_APPLY`);
  }
  return value.trim();
}
