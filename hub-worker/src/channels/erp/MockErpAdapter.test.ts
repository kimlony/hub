import { MockErpAdapter, MockErpError } from "./MockErpAdapter.js";

const request = {
  erpConnectionId: "MOCK-100",
  operation: "CREATE",
  idempotencyKey: "abcdef0123456789",
  orders: []
};

describe("MockErpAdapter", () => {
  it("returns a deterministic successful response", async () => {
    await expect(new MockErpAdapter().apply(request)).resolves.toEqual({
      erpDocumentNo: "MOCK-ERP-abcdef0123456789",
      acceptedCount: 0,
      status: "APPLIED"
    });
  });

  it("supports a retryable mock failure", async () => {
    await expect(new MockErpAdapter().apply(request, {
      mockFail: true,
      mockErrorCode: "ERP_500"
    })).rejects.toEqual(expect.objectContaining<Partial<MockErpError>>({ code: "ERP_500" }));
  });
});
