import { resolveJobLockKey, resolveJobPartitionKey } from "./jobKeys.js";

describe("ORDER_STATUS_SYNC resource keys", () => {
  it("uses the same channel-account key for Kafka partition and DB lock", () => {
    const job = {
      requestId: "sync-1",
      jobType: "ORDER_STATUS_SYNC",
      payload: { corpId: 100, channelAccountId: 23 }
    };

    expect(resolveJobPartitionKey(job)).toBe("channel-account:100:23");
    expect(resolveJobLockKey(job)).toBe("channel-account:100:23");
  });
});
