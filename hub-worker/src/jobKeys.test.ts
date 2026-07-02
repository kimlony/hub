import { resolveJobLockKey, resolveJobPartitionKey } from "./jobKeys.js";

const job = (jobType: string, payload: Record<string, unknown>) => ({
  requestId: "request-001",
  jobType,
  payload
});

describe("job resource keys", () => {
  it("uses the same channel account partition and lock across channel operations", () => {
    const payload = { corpId: 100, channelAccountId: 10 };
    expect(resolveJobPartitionKey(job("ORDER_COLLECT", payload))).toBe("channel-account:100:10");
    expect(resolveJobPartitionKey(job("ORDER_STATUS_SYNC", payload))).toBe("channel-account:100:10");
    expect(resolveJobLockKey(job("ORDER_COLLECT", payload))).toBe("channel-account:100:10");
    expect(resolveJobPartitionKey(job("ORDER_COLLECT", payload)))
      .toBe(resolveJobLockKey(job("ORDER_COLLECT", payload)));
    expect(resolveJobPartitionKey(job("ORDER_COLLECT", {
      corpId: 100,
      channelAccountId: 11
    }))).toBe("channel-account:100:11");
  });

  it("keeps normalize partitioned by source request and does not lock it", () => {
    const input = job("ORDER_NORMALIZE", {
      corpId: 100,
      channelAccountId: 10,
      sourceRequestId: "collect-001"
    });
    expect(resolveJobPartitionKey(input)).toBe("collect-001");
    expect(resolveJobLockKey(input)).toBeNull();
  });

  it("resolves future source and ERP resource contracts without implementing handlers", () => {
    expect(resolveJobLockKey(job("EXTERNAL_ORDER_IMPORT", {
      tenantId: "tenant-a",
      sourceSystem: "SABANGNET",
      sourceAccountId: "account-1"
    }))).toBe("source-account:tenant-a:SABANGNET:account-1");
    expect(resolveJobLockKey(job("ERP_APPLY", {
      corpId: 100,
      erpConnectionId: 50
    }))).toBe("erp-connection:100:50");
  });
});
