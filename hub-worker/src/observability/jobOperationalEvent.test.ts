import { buildJobOperationalEventDetail, JOB_OPERATIONAL_EVENT_SCHEMA_VERSION } from "./jobOperationalEvent.js";

describe("job operational event detail", () => {
  it("records the common execution and Kafka context", () => {
    const detail = buildJobOperationalEventDetail({
      requestId: "request-1",
      eventType: "JOB_CLAIMED",
      level: "INFO",
      message: "Job claimed",
      source: "KAFKA",
      workerInstanceId: "worker-a",
      kafkaClientId: "consumer-a",
      executionToken: {
        requestId: "request-1",
        attemptId: "attempt-1",
        workerId: "worker-a",
        fencingToken: 4,
        leaseUntil: new Date("2026-07-15T00:00:00.000Z")
      },
      kafka: {
        topic: "hub.jobs",
        partition: 2,
        offset: "7",
        messageKey: "channel-1",
        kafkaMessageId: "hub.jobs-2-7"
      }
    });

    expect(detail).toMatchObject({
      schemaVersion: JOB_OPERATIONAL_EVENT_SCHEMA_VERSION,
      category: "CLAIM",
      source: "KAFKA",
      workerInstanceId: "worker-a",
      execution: {
        attemptId: "attempt-1",
        workerId: "worker-a",
        fencingToken: 4,
        leaseUntil: "2026-07-15T00:00:00.000Z"
      },
      kafka: { partition: 2 }
    });
  });

  it("redacts sensitive attributes before they are persisted", () => {
    const detail = buildJobOperationalEventDetail({
      requestId: "request-1",
      eventType: "JOB_FAILED",
      level: "ERROR",
      message: "Job failed",
      source: "KAFKA",
      attributes: {
        reason: "upstream_timeout",
        apiKey: "must-not-be-stored",
        nested: { recipientPhone: "010-0000-0000" }
      }
    });

    expect(detail.attributes).toEqual({
      reason: "upstream_timeout",
      apiKey: "[REDACTED]",
      nested: { recipientPhone: "[REDACTED]" }
    });
  });
});
