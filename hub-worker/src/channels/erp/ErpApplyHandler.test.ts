import { jest } from "@jest/globals";
import { StaleJobAttemptError } from "../../db/postgres.js";
import type { saveErpApplyResults } from "../../db/postgres.js";
import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { ErpConnection, ErpConnectionRepository } from "./ErpConnectionRepository.js";
import { ErpApplyHandler, ErpConnectionError } from "./ErpApplyHandler.js";
import type { ErpTokenProvider } from "./MockErpTokenProvider.js";
import { MockErpError, type MockErpAdapter } from "./MockErpAdapter.js";

const connection = (overrides: Partial<ErpConnection> = {}): ErpConnection => ({
  id: 1, corpId: 100, erpConnectionId: "ERP-100", erpType: "MOCK", baseUrl: null,
  authType: "TOKEN", tokenUrl: null, clientId: "client", clientSecret: "db-secret",
  accessToken: null, refreshToken: null, tokenExpiresAt: null, isActive: true, ...overrides
});

const message = (extra: Record<string, unknown> = {}): JobHandlerMessage => ({
  requestId: "erp-job-1", requestKey: "ERP_APPLY_normalize-1", sourceErp: "HUB",
  jobType: "ERP_APPLY", correlationId: "corr-1", payload: {
    sourceNormalizeJobId: "normalize-1", normalizedOrderIds: [11], corpId: 100,
    userId: 1, channelAccountId: 10, channelCd: "GODO", erpConnectionId: "ERP-100",
    operation: "CREATE", idempotencyKey: "idem-1", ...extra
  }
});

function dependencies(current: ErpConnection | null = connection()) {
  const adapter = {
    apply: jest.fn<MockErpAdapter["apply"]>(async () => ({ erpDocumentNo: "DOC-1", acceptedCount: 1, status: "APPLIED" as const }))
  };
  const repository: ErpConnectionRepository = {
    findById: jest.fn(async () => current),
    saveToken: jest.fn(async () => undefined)
  };
  const tokenProvider: ErpTokenProvider = {
    getAccessToken: jest.fn(async () => "token-1"),
    forceRefreshToken: jest.fn(async () => "token-2")
  };
  const store = {
    areAlreadyApplied: jest.fn(async () => false),
    assertCurrentExecution: jest.fn(async () => undefined),
    findOrders: jest.fn(async () => [{
      id: 11, channelOrderId: "ORDER-11", orderStatus: "PAID",
      orderAmount: "1000", buyerName: "Buyer", items: []
    }]),
    saveResults: jest.fn<typeof saveErpApplyResults>(async () => undefined)
  };
  const handler = new ErpApplyHandler(adapter, repository, tokenProvider, store);
  return { handler, adapter, repository, tokenProvider, store };
}

describe("ErpApplyHandler token authentication", () => {
  it("passes the acquired token and DB connection to the adapter without putting secrets in payload", async () => {
    // 연결 인증 정보는 Worker 내부에서 조회하며 Kafka envelope과 저장되는 ERP 요청에는
    // 연결 식별자만 포함되어야 한다.
    const deps = dependencies();
    const job = message();
    await deps.handler.handle(job);
    expect(deps.adapter.apply).toHaveBeenCalledWith(
      expect.objectContaining({ erpConnectionId: "ERP-100" }), "token-1",
      expect.objectContaining({ erpConnectionId: "ERP-100" }), expect.objectContaining({ authAttempt: 0 })
    );
    expect(JSON.stringify(job.payload)).not.toMatch(/accessToken|refreshToken|clientSecret|db-secret|token-1/);
    expect(deps.store.saveResults).toHaveBeenCalledWith(expect.objectContaining({ status: "APPLIED" }));
    const savedRequest = deps.store.saveResults.mock.calls[0]?.[0].requestPayload;
    expect(JSON.stringify(savedRequest)).not.toMatch(/accessToken|refreshToken|clientSecret|db-secret|token-1/);
  });

  it("stores MANUAL trigger type from manual ERP payload", async () => {
    const deps = dependencies();
    await deps.handler.handle(message({ triggerType: "MANUAL", userId: 77 }));

    expect(deps.store.saveResults).toHaveBeenCalledWith(expect.objectContaining({
      deliveryType: "ERP_PUSH",
      triggerType: "MANUAL",
      deliveredByUserId: 77
    }));
  });

  it("refreshes once after a 401 and succeeds on the second call", async () => {
    // 한 번의 갱신으로 만료된 토큰을 처리하고 하나의 Job attempt가 무한 인증 재시도로
    // 이어지지 않도록 한다.
    const deps = dependencies();
    deps.adapter.apply
      .mockRejectedValueOnce(new MockErpError("ERP_401", "expired"))
      .mockResolvedValueOnce({ erpDocumentNo: "DOC-2", acceptedCount: 1, status: "APPLIED" });
    await deps.handler.handle(message({ mockAuthFailOnce: true }));
    expect(deps.tokenProvider.forceRefreshToken).toHaveBeenCalledTimes(1);
    expect(deps.adapter.apply).toHaveBeenCalledTimes(2);
    expect(deps.adapter.apply.mock.calls[1]?.[1]).toBe("token-2");
  });

  it("stops after one refresh when authentication always fails and stores FAILED", async () => {
    const deps = dependencies();
    deps.adapter.apply.mockRejectedValue(new MockErpError("ERP_401", "authentication failed"));
    await expect(deps.handler.handle(message({ mockAuthFailAlways: true })))
      .rejects.toEqual(expect.objectContaining({ code: "ERP_401" }));
    expect(deps.tokenProvider.forceRefreshToken).toHaveBeenCalledTimes(1);
    expect(deps.adapter.apply).toHaveBeenCalledTimes(2);
    expect(deps.store.saveResults).toHaveBeenCalledWith(expect.objectContaining({
      status: "FAILED", errorCode: "ERP_401", errorMessage: "authentication failed"
    }));
  });

  it("fails and records the result when the connection is missing", async () => {
    const deps = dependencies(null);
    await expect(deps.handler.handle(message())).rejects.toBeInstanceOf(ErpConnectionError);
    expect(deps.adapter.apply).not.toHaveBeenCalled();
    expect(deps.store.saveResults).toHaveBeenCalledWith(expect.objectContaining({
      status: "FAILED", errorCode: "ERP_CONNECTION_NOT_FOUND"
    }));
  });

  it("fails and records the result when the connection is inactive", async () => {
    const deps = dependencies(connection({ isActive: false }));
    await expect(deps.handler.handle(message())).rejects.toEqual(expect.objectContaining({
      code: "ERP_CONNECTION_INACTIVE"
    }));
    expect(deps.adapter.apply).not.toHaveBeenCalled();
  });

  it("does not call ERP when the preflight execution token is stale", async () => {
    const deps = dependencies();
    deps.store.assertCurrentExecution.mockRejectedValueOnce(
      new StaleJobAttemptError({
        requestId: "erp-job-1",
        attemptId: "00000000-0000-0000-0000-000000000001",
        workerId: "worker-old",
        fencingToken: 1,
        leaseUntil: new Date()
      })
    );

    await expect(deps.handler.handle(message())).rejects.toBeInstanceOf(StaleJobAttemptError);
    expect(deps.adapter.apply).not.toHaveBeenCalled();
    expect(deps.store.saveResults).not.toHaveBeenCalled();
  });
});
