import type { NormalizedOrderForErp } from "../../db/postgres.js";
import type { ErpConnection } from "./ErpConnectionRepository.js";

export type MockErpRequest = {
  erpConnectionId: string;
  operation: string;
  idempotencyKey: string;
  orders: NormalizedOrderForErp[];
};

export type MockErpOptions = {
  mockFail?: boolean;
  mockErrorCode?: string;
  mockAuthFailOnce?: boolean;
  mockAuthFailAlways?: boolean;
  authAttempt?: number;
};

export class MockErpError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "MockErpError";
  }

  get isAuthFailure(): boolean {
    return this.code === "ERP_401" || this.code === "ERP_AUTH_FAILED";
  }
}

export class MockErpAdapter {
  async apply(
    connection: ErpConnection,
    accessToken: string | null,
    request: MockErpRequest,
    options: MockErpOptions = {}
  ): Promise<{ erpDocumentNo: string; acceptedCount: number; status: "APPLIED" }> {
    if (connection.authType === "TOKEN" && !accessToken) {
      throw new MockErpError("ERP_AUTH_FAILED", "ERP access token is required");
    }
    const authAttempt = options.authAttempt ?? 0;
    if (options.mockAuthFailAlways || (options.mockAuthFailOnce && authAttempt === 0)) {
      throw new MockErpError("ERP_401", "Mock ERP authentication failed");
    }
    if (options.mockFail) {
      throw new MockErpError(options.mockErrorCode ?? "ERP_500", "Mock ERP apply failed");
    }
    return {
      erpDocumentNo: `MOCK-ERP-${request.idempotencyKey.slice(0, 16)}`,
      acceptedCount: request.orders.length,
      status: "APPLIED"
    };
  }
}