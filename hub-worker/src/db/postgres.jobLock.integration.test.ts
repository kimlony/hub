import dotenv from "dotenv";

dotenv.config();

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";
const describeIntegration = runIntegration ? describe : describe.skip;

type PostgresModule = typeof import("./postgres.js");

describeIntegration("job lock idempotency", () => {
  let db: PostgresModule;

  const lockKey = `ORDER_COLLECT:1:TEST_LOCK:${Date.now()}`;
  const firstRequestId = "lock-test-first";
  const secondRequestId = "lock-test-second";
  const thirdRequestId = "lock-test-third";

  beforeAll(async () => {
    db = await import("./postgres.js");
    await db.ensurePostgresSchema();
  });

  afterAll(async () => {
    await db?.releaseJobLock(lockKey, firstRequestId);
    await db?.releaseJobLock(lockKey, thirdRequestId);
    await db?.closePostgresPool();
  });

  it("allows only one active collector for the same account lock key", async () => {
    // Portfolio note: this verifies the defense that keeps parallel workers from
    // collecting the same user/channel account at the same time.
    const firstAcquired = await db.tryAcquireJobLock(lockKey, firstRequestId);
    const secondAcquired = await db.tryAcquireJobLock(lockKey, secondRequestId);

    expect(firstAcquired).toBe(true);
    expect(secondAcquired).toBe(false);

    await db.releaseJobLock(lockKey, firstRequestId);

    const thirdAcquired = await db.tryAcquireJobLock(lockKey, thirdRequestId);

    expect(thirdAcquired).toBe(true);
  });
});
