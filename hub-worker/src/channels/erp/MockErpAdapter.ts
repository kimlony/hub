import type { NormalizedOrderForErp } from "../../db/postgres.js";

export type MockErpRequest = {
  erpConnectionId: string;
  operation: string;
  idempotencyKey: string;
  orders: NormalizedOrderForErp[];
};

export class MockErpError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "MockErpError";
  }
}

export class MockErpAdapter {
  async apply(
    request: MockErpRequest,
    options: { mockFail?: boolean; mockErrorCode?: string } = {}
  ): Promise<{ erpDocumentNo: string; acceptedCount: number; status: "APPLIED" }> {
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
