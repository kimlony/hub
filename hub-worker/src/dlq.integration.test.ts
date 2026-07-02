import dotenv from "dotenv";
import { jest } from "@jest/globals";
import { Kafka, logLevel, type Consumer } from "kafkajs";
import type pg from "pg";
import type { JobHandlerMessage } from "./handlers/IJobHandler.js";
import {
  createIntegrationPgPool,
  setupWorkerIntegrationContainers,
  stopWorkerIntegrationContainers
} from "./test/containers.js";

dotenv.config();

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";
const describeIntegration = runIntegration ? describe : describe.skip;

type PostgresModule = typeof import("./db/postgres.js");
type DlqModule = typeof import("./dlq.js");

type DlqPayload = {
  failedAt: string;
  source: "consumer" | "recovery";
  errorMessage: string;
  retryCount: number;
  maxRetryCount: number;
  job: JobHandlerMessage;
};

function parseDlqPayload(value: Buffer | null): DlqPayload | null {
  if (!value) {
    return null;
  }

  const parsed: unknown = JSON.parse(value.toString("utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  return parsed as DlqPayload;
}

describeIntegration("DLQ publish after retry exhaustion", () => {
  jest.setTimeout(180_000);

  let db: PostgresModule;
  let dlq: DlqModule;
  let pool: pg.Pool;
  let consumer: Consumer | null = null;
  let dlqTopic: string;
  let kafkaBrokers: string[];

  const requestId = `dlq-test-${Date.now()}`;
  const erpRequestId = `dlq-erp-test-${Date.now()}`;
  const requestKey = "DLQ_TEST_001";
  const errorMessage = "retry exhausted external API failure";

  beforeAll(async () => {
    await setupWorkerIntegrationContainers({ kafka: true });
    pool = createIntegrationPgPool();
    dlqTopic = process.env.KAFKA_DLQ_TOPIC ?? "hub.jobs.dlq";
    kafkaBrokers = (process.env.KAFKA_BROKERS ?? "localhost:9092")
      .split(",")
      .map((broker) => broker.trim())
      .filter(Boolean);

    // Integration setup mirrors the minimal hub_job columns needed to exercise
    // retry exhaustion before publishing the failed job to Kafka DLQ.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_job (
        id BIGSERIAL PRIMARY KEY,
        request_id VARCHAR(100) UNIQUE NOT NULL,
        request_key VARCHAR(200),
        channel_cd VARCHAR(30),
        status VARCHAR(30) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        retry_count INT NOT NULL DEFAULT 0,
        error_message TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        job_type VARCHAR(100) NOT NULL DEFAULT 'ORDER_COLLECT',
        source_erp VARCHAR(100) NOT NULL DEFAULT 'HUB',
        next_retry_at TIMESTAMPTZ
      )
    `);

    db = await import("./db/postgres.js");
    dlq = await import("./dlq.js");
    await db.ensurePostgresSchema();

    const kafka = new Kafka({
      clientId: `hub-worker-dlq-test-admin-${Date.now()}`,
      brokers: kafkaBrokers,
      logLevel: logLevel.NOTHING
    });
    const admin = kafka.admin();
    await admin.connect();
    const topics = await admin.listTopics();
    if (!topics.includes(dlqTopic)) {
      await admin.createTopics({
        waitForLeaders: true,
        topics: [{
          topic: dlqTopic,
          numPartitions: 4,
          replicationFactor: 1
        }]
      });
    }
    await admin.disconnect();
  }, 180_000);

  afterAll(async () => {
    await consumer?.disconnect().catch(() => undefined);
    await dlq?.closeDlqProducer();
    await pool?.query("DELETE FROM hub_job_log WHERE request_id = $1", [requestId]);
    await pool?.query("DELETE FROM hub_job_log WHERE request_id = $1", [erpRequestId]);
    await pool?.query("DELETE FROM hub_job WHERE request_id = $1", [requestId]);
    await pool?.query("DELETE FROM hub_job WHERE request_id = $1", [erpRequestId]);
    await db?.closePostgresPool();
    await pool?.end();
    await stopWorkerIntegrationContainers();
  }, 90_000);

  it("publishes exhausted retry jobs to the DLQ topic with retry metadata", async () => {
    await pool.query(
      `
        INSERT INTO hub_job (
          request_id,
          request_key,
          channel_cd,
          status,
          payload,
          retry_count,
          job_type,
          source_erp,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, 'PROCESSING', $4::jsonb, 3, 'ORDER_COLLECT', 'HUB_TEST', NOW(), NOW())
      `,
      [requestId, requestKey, "TEST", JSON.stringify({ userId: 1, mallKey: "TEST", channelCd: "TEST" })]
    );

    const decision = await db.retryOrFailJob(requestId, errorMessage);
    expect(decision.status).toBe("FAILED");

    const jobMessage: JobHandlerMessage = {
      requestId,
      requestKey,
      sourceErp: "HUB_TEST",
      jobType: "ORDER_COLLECT",
      payload: { userId: 1, mallKey: "TEST", channelCd: "TEST" }
    };

    const kafka = new Kafka({
      clientId: `hub-worker-dlq-test-consumer-${Date.now()}`,
      brokers: kafkaBrokers,
      logLevel: logLevel.NOTHING
    });
    consumer = kafka.consumer({ groupId: `hub-worker-dlq-test-${requestId}` });
    await consumer.connect();
    await consumer.subscribe({ topic: dlqTopic, fromBeginning: true });

    const received = new Promise<DlqPayload>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`DLQ message not received for requestId=${requestId}`));
      }, 15_000);

      consumer?.run({
        eachMessage: async ({ message }) => {
          const payload = parseDlqPayload(message.value);
          if (payload?.job.requestId !== requestId) {
            return;
          }

          clearTimeout(timeout);
          resolve(payload);
        }
      }).catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });

    const published = await dlq.publishDlq({
      jobMessage,
      errorMessage,
      retryCount: decision.retryCount,
      maxRetryCount: decision.maxRetryCount,
      source: "consumer"
    });

    expect(published).toBe(true);

    const payload = await received;
    expect(payload).toMatchObject({
      source: "consumer",
      errorMessage,
      retryCount: 3,
      maxRetryCount: 3,
      job: jobMessage
    });
    expect(new Date(payload.failedAt).toString()).not.toBe("Invalid Date");
  });

  it("keeps the ERP_APPLY envelope when retry exhaustion publishes to DLQ", async () => {
    const erpPayload = {
      sourceNormalizeJobId: "normalize-dlq-001",
      normalizedOrderIds: [101],
      corpId: 100,
      userId: 1,
      channelAccountId: 10,
      channelCd: "GODO",
      erpConnectionId: "MOCK-100",
      operation: "CREATE",
      idempotencyKey: "erp-dlq-key-001",
      mockFail: true
    };
    await pool.query(
      `
        INSERT INTO hub_job (
          request_id, request_key, channel_cd, status, payload, retry_count,
          job_type, source_erp, parent_job_id, correlation_id, causation_id,
          schema_version, payload_version, created_at, updated_at
        ) VALUES (
          $1, 'ERP_APPLY_DLQ_001', 'GODO', 'PROCESSING', $2::jsonb, 3,
          'ERP_APPLY', 'HUB', 'normalize-dlq-001', 'correlation-dlq-001',
          'normalize-dlq-001', '1.0', '1.0', NOW(), NOW()
        )
      `,
      [erpRequestId, JSON.stringify(erpPayload)]
    );
    const decision = await db.retryOrFailJob(erpRequestId, "Mock ERP apply failed");
    expect(decision.status).toBe("FAILED");
    const jobMessage: JobHandlerMessage = {
      requestId: erpRequestId,
      requestKey: "ERP_APPLY_DLQ_001",
      sourceErp: "HUB",
      jobType: "ERP_APPLY",
      parentJobId: "normalize-dlq-001",
      correlationId: "correlation-dlq-001",
      causationId: "normalize-dlq-001",
      schemaVersion: "1.0",
      payloadVersion: "1.0",
      payload: erpPayload
    };

    const kafka = new Kafka({
      clientId: `hub-worker-erp-dlq-test-${Date.now()}`,
      brokers: kafkaBrokers,
      logLevel: logLevel.NOTHING
    });
    const erpConsumer = kafka.consumer({ groupId: `hub-worker-dlq-test-${erpRequestId}` });
    await erpConsumer.connect();
    await erpConsumer.subscribe({ topic: dlqTopic, fromBeginning: true });
    try {
      const received = new Promise<DlqPayload>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("ERP_APPLY DLQ message not received")), 15_000);
        erpConsumer.run({
          eachMessage: async ({ message }) => {
            const payload = parseDlqPayload(message.value);
            if (payload?.job.requestId !== erpRequestId) {
              return;
            }
            clearTimeout(timeout);
            resolve(payload);
          }
        }).catch(reject);
      });
      expect(await dlq.publishDlq({
        jobMessage,
        errorMessage: "Mock ERP apply failed",
        retryCount: decision.retryCount,
        maxRetryCount: decision.maxRetryCount,
        source: "recovery"
      })).toBe(true);
      const dlqPayload = await received;
      expect(dlqPayload.job).toEqual(jobMessage);
      expect(dlqPayload.job.jobType).toBe("ERP_APPLY");
      expect(dlqPayload.job.payload).toEqual(erpPayload);
    } finally {
      await erpConsumer.disconnect();
    }
  });
});
