import {
  areErpOrdersAlreadyApplied,
  assertCurrentJobExecutionAuthority,
  findNormalizedOrdersForErp,
  saveErpApplyResults
} from "../../db/postgres.js";
import { StaleJobAttemptError } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import {
  PostgresErpConnectionRepository,
  type ErpConnection,
  type ErpConnectionRepository
} from "./ErpConnectionRepository.js";
import { MockErpTokenProvider, type ErpTokenProvider } from "./MockErpTokenProvider.js";
import {
  MockErpAdapter,
  MockErpError,
  type MockErpOptions,
  type MockErpRequest
} from "./MockErpAdapter.js";

type ErpApplyStore = {
  areAlreadyApplied: typeof areErpOrdersAlreadyApplied;
  assertCurrentExecution: typeof assertCurrentJobExecutionAuthority;
  findOrders: typeof findNormalizedOrdersForErp;
  saveResults: typeof saveErpApplyResults;
};

const postgresStore: ErpApplyStore = {
  areAlreadyApplied: areErpOrdersAlreadyApplied,
  assertCurrentExecution: assertCurrentJobExecutionAuthority,
  findOrders: findNormalizedOrdersForErp,
  saveResults: saveErpApplyResults
};

export class ErpConnectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ErpConnectionError";
  }
}

export class ErpApplyHandler implements IJobHandler {
  private readonly tokenProvider: ErpTokenProvider;

  constructor(
    private readonly adapter = new MockErpAdapter(),
    private readonly connectionRepository: ErpConnectionRepository = new PostgresErpConnectionRepository(),
    tokenProvider?: ErpTokenProvider,
    private readonly store: ErpApplyStore = postgresStore
  ) {
    this.tokenProvider = tokenProvider ?? new MockErpTokenProvider(connectionRepository);
  }

  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    if (await this.store.areAlreadyApplied(payload.idempotencyKey, payload.normalizedOrderIds)) {
      return;
    }

    const orders = await this.store.findOrders(payload.normalizedOrderIds);
    if (orders.length !== payload.normalizedOrderIds.length) {
      throw new Error("One or more normalized orders were not found for ERP_APPLY");
    }
    // Secrets and tokens intentionally stay out of this request and the Kafka payload.
    const request: MockErpRequest = {
      erpConnectionId: payload.erpConnectionId,
      operation: payload.operation,
      idempotencyKey: payload.idempotencyKey,
      orders
    };

    try {
      const connection = await this.resolveConnection(payload.corpId, payload.erpConnectionId);
      const token = connection.authType === "TOKEN"
        ? await this.tokenProvider.getAccessToken(connection)
        : null;
      const options: MockErpOptions = {
        mockFail: payload.mockFail,
        mockErrorCode: payload.mockErrorCode,
        mockAuthFailOnce: payload.mockAuthFailOnce,
        mockAuthFailAlways: payload.mockAuthFailAlways,
        authAttempt: 0
      };
      let response;
      try {
        // 외부 I/O 직전에 처리 권한을 다시 확인하여 lease를 잃고 reclaim된 attempt가
        // 새 ERP 요청을 시작하지 않도록 한다.
        await this.store.assertCurrentExecution(message.requestId);
        response = await this.adapter.apply(connection, token, request, options);
      } catch (error) {
        if (!(error instanceof MockErpError) || !error.isAuthFailure || connection.authType !== "TOKEN") {
          throw error;
        }
        // 인증 실패 시 이 attempt 안에서는 한 번만 토큰을 갱신한다. 이후 실패는 여기서
        // 반복하지 않고 공통 Job retry 정책으로 넘긴다.
        const refreshedToken = await this.tokenProvider.forceRefreshToken(connection);
        await this.store.assertCurrentExecution(message.requestId);
        response = await this.adapter.apply(connection, refreshedToken, request, {
          ...options,
          authAttempt: 1
        });
      }
      await this.store.saveResults({
        requestId: message.requestId,
        correlationId: message.correlationId ?? message.requestId,
        normalizedOrderIds: payload.normalizedOrderIds,
        erpConnectionId: payload.erpConnectionId,
        operation: payload.operation,
        status: "APPLIED",
        idempotencyKey: payload.idempotencyKey,
        erpDocumentNo: response.erpDocumentNo,
        requestPayload: request as unknown as Record<string, unknown>,
        responsePayload: response,
        deliveryType: "ERP_PUSH",
        triggerType: payload.triggerType,
        deliveredByUserId: payload.deliveredByUserId
      });
    } catch (error) {
      if (error instanceof StaleJobAttemptError) {
        throw error;
      }
      const errorCode = error instanceof MockErpError || error instanceof ErpConnectionError
        ? error.code
        : "ERP_TECHNICAL_ERROR";
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.store.saveResults({
        requestId: message.requestId,
        correlationId: message.correlationId ?? message.requestId,
        normalizedOrderIds: payload.normalizedOrderIds,
        erpConnectionId: payload.erpConnectionId,
        operation: payload.operation,
        status: "FAILED",
        idempotencyKey: payload.idempotencyKey,
        requestPayload: request as unknown as Record<string, unknown>,
        errorCode,
        errorMessage,
        deliveryType: "ERP_PUSH",
        triggerType: payload.triggerType,
        deliveredByUserId: payload.deliveredByUserId
      });
      throw error;
    }
  }

  private async resolveConnection(corpId: number, erpConnectionId: string): Promise<ErpConnection> {
    const connection = await this.connectionRepository.findById(corpId, erpConnectionId);
    if (!connection) {
      throw new ErpConnectionError(
        "ERP_CONNECTION_NOT_FOUND",
        `ERP connection was not found: ${erpConnectionId}`
      );
    }
    if (!connection.isActive) {
      throw new ErpConnectionError(
        "ERP_CONNECTION_INACTIVE",
        `ERP connection is inactive: ${erpConnectionId}`
      );
    }
    return connection;
  }
}

function parsePayload(payload: Record<string, unknown>) {
  const normalizedOrderIds = Array.isArray(payload.normalizedOrderIds)
    ? payload.normalizedOrderIds.map(Number).filter(Number.isInteger)
    : [];
  if (normalizedOrderIds.length === 0) {
    throw new Error("normalizedOrderIds is required for ERP_APPLY");
  }
  const corpId = Number(payload.corpId);
  if (!Number.isInteger(corpId) || corpId <= 0) {
    throw new Error("corpId is required for ERP_APPLY");
  }
  const triggerType = parseTriggerType(payload.triggerType);
  return {
    normalizedOrderIds,
    corpId,
    erpConnectionId: requiredString(payload.erpConnectionId, "erpConnectionId"),
    operation: requiredString(payload.operation, "operation"),
    idempotencyKey: requiredString(payload.idempotencyKey, "idempotencyKey"),
    triggerType,
    deliveredByUserId: triggerType === "MANUAL" ? optionalPositiveInteger(payload.userId) : null,
    mockFail: payload.mockFail === true,
    mockErrorCode: typeof payload.mockErrorCode === "string" ? payload.mockErrorCode : undefined,
    mockAuthFailOnce: payload.mockAuthFailOnce === true,
    mockAuthFailAlways: payload.mockAuthFailAlways === true
  };
}

function parseTriggerType(value: unknown): "AUTO" | "MANUAL" {
  return value === "MANUAL" ? "MANUAL" : "AUTO";
}

function optionalPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required for ERP_APPLY`);
  }
  return value.trim();
}
