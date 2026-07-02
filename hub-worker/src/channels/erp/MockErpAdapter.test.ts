import type { ErpConnection } from "./ErpConnectionRepository.js";
import { MockErpAdapter, MockErpError } from "./MockErpAdapter.js";

const request = {
  erpConnectionId: "MOCK-100",
  operation: "CREATE",
  idempotencyKey: "abcdef0123456789",
  orders: []
};

const connection = (authType: "NONE" | "TOKEN" = "NONE"): ErpConnection => ({
  id: 1,
  corpId: 100,
  erpConnectionId: "MOCK-100",
  erpType: "MOCK",
  baseUrl: null,
  authType,
  tokenUrl: null,
  clientId: null,
  clientSecret: null,
  accessToken: null,
  refreshToken: null,
  tokenExpiresAt: null,
  isActive: true
});

describe("MockErpAdapter", () => {
  it("returns a deterministic successful response", async () => {
    await expect(new MockErpAdapter().apply(connection(), null, request)).resolves.toEqual({
      erpDocumentNo: "MOCK-ERP-abcdef0123456789",
      acceptedCount: 0,
      status: "APPLIED"
    });
  });

  it("supports a retryable mock failure", async () => {
    await expect(new MockErpAdapter().apply(connection(), null, request, {
      mockFail: true,
      mockErrorCode: "ERP_500"
    })).rejects.toEqual(expect.objectContaining<Partial<MockErpError>>({ code: "ERP_500" }));
  });

  it("rejects a TOKEN connection without an access token", async () => {
    await expect(new MockErpAdapter().apply(connection("TOKEN"), null, request))
      .rejects.toEqual(expect.objectContaining<Partial<MockErpError>>({ code: "ERP_AUTH_FAILED" }));
  });

  it("fails authentication once based on the in-handler attempt", async () => {
    const adapter = new MockErpAdapter();
    await expect(adapter.apply(connection("TOKEN"), "token-1", request, {
      mockAuthFailOnce: true,
      authAttempt: 0
    })).rejects.toEqual(expect.objectContaining<Partial<MockErpError>>({ code: "ERP_401" }));
    await expect(adapter.apply(connection("TOKEN"), "token-2", request, {
      mockAuthFailOnce: true,
      authAttempt: 1
    })).resolves.toMatchObject({ status: "APPLIED" });
  });
});