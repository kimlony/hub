import { HubJobMessageSchema } from "./schemas.js";

describe("ORDER_STATUS_SYNC schema", () => {
  it("accepts the required status sync payload", () => {
    expect(HubJobMessageSchema.safeParse(message()).success).toBe(true);
  });

  it("rejects an empty statusTypes list", () => {
    const input = message();
    input.payload.statusTypes = [];
    const result = HubJobMessageSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

function message() {
  return {
    requestId: "sync-1",
    sourceErp: "HUB",
    jobType: "ORDER_STATUS_SYNC",
    requestKey: "STATUS_SYNC_23",
    payload: {
      userId: 7,
      corpId: 100,
      channelAccountId: 23,
      mallKey: "MOCK_MALL",
      channelCd: "MOCK_MALL",
      frDt: "20260701",
      toDt: "20260706",
      statusTypes: ["결제완료"],
      syncMode: "RANGE",
      erpApplyEnabled: false
    }
  };
}
