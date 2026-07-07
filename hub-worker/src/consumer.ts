import "dotenv/config";
import { Kafka, type Consumer, type EachMessagePayload } from "kafkajs";
import {
  captureOrderCollectResult,
  completeOrderCollectWithNormalize,
  completeOrderNormalizeWithErpApply,
  deferJobForLockConflict,
  findActiveChannelAccountIdentity,
  findActiveChannelCredentials,
  releaseJobLock,
  retryOrFailJob,
  saveJobLog,
  succeedJob,
  tryAcquireJobLock,
  tryMarkProcessing
} from "./db/postgres.js";
import { CoupangOrderHandler } from "./channels/coupang/CoupangOrderHandler.js";
import { GchanOrderHandler } from "./channels/gchan/GchanOrderHandler.js";
import { WchanOrderHandler } from "./channels/wchan/WchanOrderHandler.js";
import { OnryOrderHandler } from "./channels/onry/OnryOrderHandler.js";
import { GodoOrderHandler } from "./channels/godo/GodoOrderHandler.js";
import { DartCrawlHandler } from "./channels/dart/DartCrawlHandler.js";
import { ElevenStOrderHandler } from "./channels/elevenst/ElevenStOrderHandler.js";
import { NaverRssCrawlHandler } from "./channels/naverRss/NaverRssCrawlHandler.js";
import { NfaOrderHandler } from "./channels/nfa/NfaOrderHandler.js";
import { MockMallOrderHandler } from "./channels/mockMall/MockMallOrderHandler.js";
import { OrderStatusSyncHandler } from "./channels/orderStatusSync/OrderStatusSyncHandler.js";
import { OrderNormalizeHandler } from "./channels/orderNormalize/OrderNormalizeHandler.js";
import { TestSleepHandler } from "./channels/test/TestSleepHandler.js";
import { ErpApplyHandler } from "./channels/erp/ErpApplyHandler.js";
import { HandlerRegistry } from "./handlers/HandlerRegistry.js";
import type { JobHandlerMessage } from "./handlers/IJobHandler.js";
import { publishDlq } from "./dlq.js";
import { classifyRetry } from "./errors/retryPolicy.js";
import { logger } from "./logger.js";
import { resolveJobLockKey } from "./jobKeys.js";
import { HubJobMessageSchema } from "./schemas.js";
import { getKafkaClientId, getWorkerId } from "./workerIdentity.js";

export type HubJobMessage = JobHandlerMessage;

const topic = process.env.KAFKA_TOPIC ?? "hub.jobs";
const consumerGroup = process.env.KAFKA_GROUP_ID ?? "hub-worker-group";
const workerInstanceId = getWorkerId();
const kafkaClientId = getKafkaClientId();
const kafka = new Kafka({
  clientId: kafkaClientId,
  brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean)
});

const consumer: Consumer = kafka.consumer({ groupId: consumerGroup });
const activeJobs = new Set<Promise<void>>();
let consumerStarted = false;

const registry = new HandlerRegistry();
registry.register("ORDER_COLLECT", new ElevenStOrderHandler(), "11ST");
registry.register("ORDER_COLLECT", new GchanOrderHandler(), "GCHAN");
registry.register("ORDER_COLLECT", new WchanOrderHandler(), "WCHAN");
registry.register("ORDER_COLLECT", new OnryOrderHandler(), "ONRY");
registry.register("ORDER_COLLECT", new GodoOrderHandler(), "GODO");
registry.register("ORDER_COLLECT", new CoupangOrderHandler(), "COUPANG");
registry.register("ORDER_COLLECT", new NfaOrderHandler(), "NSS");
registry.register("ORDER_COLLECT", new MockMallOrderHandler(), "MOCK_MALL");
registry.register("ORDER_STATUS_SYNC", new OrderStatusSyncHandler());
registry.register("CRAWL", new DartCrawlHandler(), "DART");
registry.register("CRAWL", new NaverRssCrawlHandler(), "NAVER_RSS");
registry.register("ORDER_NORMALIZE", new OrderNormalizeHandler());
registry.register("ERP_APPLY", new ErpApplyHandler());
registry.register("TEST_SLEEP", new TestSleepHandler(), "TEST");

export async function startConsumer(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });
  consumerStarted = true;

  logger.info({
    event: "KAFKA_CONSUMER_STARTED",
    topic,
    consumerGroup,
    kafkaClientId,
    workerInstanceId
  }, "Kafka consumer started");

  await consumer.run({
    eachMessage: handleKafkaMessage
  });
}

export async function stopConsumer(): Promise<void> {
  if (!consumerStarted) {
    return;
  }

  logger.info({
    event: "KAFKA_CONSUMER_STOPPING",
    activeJobCount: activeJobs.size
  }, "Kafka consumer stopping");

  await consumer.stop();
  await waitForActiveJobs();
  await consumer.disconnect();
  consumerStarted = false;

  logger.info({
    event: "KAFKA_CONSUMER_STOPPED"
  }, "Kafka consumer stopped");
}

async function handleKafkaMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
  const rawMessage = message.value?.toString("utf8") ?? "";
  const kafkaMessageId = `${topic}-${partition}-${message.offset}`;
  const messageKey = message.key?.toString("utf8") ?? null;
  let jobMessage: HubJobMessage;

  try {
    jobMessage = parseHubJobMessage(rawMessage);
  } catch (error) {
    logger.error({
      event: "JOB_MESSAGE_PARSE_FAILED",
      err: error,
      kafkaMessageId
    }, "Kafka message parse failed");
    return;
  }

  const jobPromise = processJobMessage(jobMessage, "consumer", {
    kafka: {
      topic,
      partition,
      offset: message.offset,
      messageKey,
      kafkaMessageId
    }
  });

  activeJobs.add(jobPromise);
  try {
    await jobPromise;
  } finally {
    activeJobs.delete(jobPromise);
  }
}

async function waitForActiveJobs(): Promise<void> {
  if (activeJobs.size === 0) {
    return;
  }

  logger.info({
    event: "KAFKA_CONSUMER_ACTIVE_JOBS_WAIT",
    activeJobCount: activeJobs.size
  }, "Waiting for active jobs to finish");

  await Promise.allSettled([...activeJobs]);
}

export async function processJobMessage(
  jobMessage: HubJobMessage,
  source: "consumer" | "recovery" = "consumer",
  options: {
    alreadyClaimed?: boolean;
    kafka?: {
      topic: string;
      partition: number;
      offset: string;
      messageKey: string | null;
      kafkaMessageId: string;
    };
  } = {}
): Promise<void> {
  const { requestId, jobType } = jobMessage;

  try {
    logger.info({
      event: source === "recovery" ? "JOB_RECEIVED_FROM_RECOVERY" : "JOB_RECEIVED_FROM_KAFKA",
      requestId,
      jobType,
      source,
      workerInstanceId,
      kafkaClientId,
      kafka: options.kafka,
      channelCd: getChannelCd(jobMessage),
      mallKey: getMallKey(jobMessage)
    }, "Job processing started");
    await saveJobLog({
      requestId,
      eventType: source === "recovery" ? "JOB_RECEIVED_FROM_RECOVERY" : "JOB_RECEIVED_FROM_KAFKA",
      level: "INFO",
      message: "Job processing started",
      jobType,
      sourceErp: jobMessage.sourceErp,
      requestKey: jobMessage.requestKey,
      channelCd: getChannelCd(jobMessage),
      mallKey: getMallKey(jobMessage),
      detail: {
        source,
        workerInstanceId,
        kafkaClientId,
        kafka: options.kafka
      }
    });

    const processing = options.alreadyClaimed ? true : await tryMarkProcessing(requestId);
    if (!processing) {
      logger.info({
        event: "JOB_PROCESSING_SKIPPED",
        requestId,
        jobType,
        source,
        reason: "status_not_queued"
      }, "Job processing skipped");
      await saveJobLog({
        requestId,
        eventType: "JOB_PROCESSING_SKIPPED",
        level: "INFO",
        message: "Job processing skipped",
        jobType,
        sourceErp: jobMessage.sourceErp,
        requestKey: jobMessage.requestKey,
        channelCd: getChannelCd(jobMessage),
        mallKey: getMallKey(jobMessage),
        detail: {
          source,
          reason: "status_not_queued",
          workerInstanceId,
          kafkaClientId,
          kafka: options.kafka
        }
      });
      return;
    }

    const handledMessage = await prepareJobMessage(jobMessage);
    const succeeded = await runRegisteredHandler(handledMessage, requestId);

    if (succeeded === null) {
      return;
    }

    if (!succeeded) {
      logger.warn({
        event: "JOB_COMPLETION_SKIPPED",
        requestId,
        jobType,
        source,
        reason: "success_status_update_skipped"
      }, "Job completion skipped");
      await saveJobLog({
        requestId,
        eventType: "JOB_COMPLETION_SKIPPED",
        level: "WARN",
        message: "Job completion skipped",
        jobType,
        sourceErp: handledMessage.sourceErp,
        requestKey: handledMessage.requestKey,
        channelCd: getChannelCd(handledMessage),
        mallKey: getMallKey(handledMessage),
        detail: {
          source,
          reason: "success_status_update_skipped"
        }
      });
      return;
    }

    logger.info({
      event: "JOB_STATUS_SUCCESS",
      requestId,
      jobType,
      source,
      channelCd: getChannelCd(handledMessage),
      mallKey: getMallKey(handledMessage)
    }, "Job completed successfully");
    await saveJobLog({
      requestId,
      eventType: "JOB_COMPLETED",
      level: "INFO",
      message: "Job completed successfully",
      jobType,
      sourceErp: handledMessage.sourceErp,
      requestKey: handledMessage.requestKey,
      channelCd: getChannelCd(handledMessage),
      mallKey: getMallKey(handledMessage),
      detail: {
        source,
        workerInstanceId,
        kafkaClientId
      }
    });
  } catch (error) {
    const retryClassification = classifyRetry(error);
    const errorMessage = retryClassification.errorMessage;
    const decision = await retryOrFailJob(requestId, errorMessage, {
      retryable: retryClassification.retryable
    });

    if (decision.status === "SKIPPED") {
      logger.warn({
        event: "JOB_FAILURE_UPDATE_SKIPPED",
        err: error,
        requestId,
        jobType,
        source,
        errorMessage
      }, "Job failure update skipped");
      await saveJobLog({
        requestId,
        eventType: "JOB_FAILURE_UPDATE_SKIPPED",
        level: "WARN",
        message: "Job failure update skipped",
        jobType,
        sourceErp: jobMessage.sourceErp,
        requestKey: jobMessage.requestKey,
        channelCd: getChannelCd(jobMessage),
        mallKey: getMallKey(jobMessage),
        errorMessage,
        detail: {
          source,
          workerInstanceId,
          kafkaClientId,
          retryClassification
        }
      });
      return;
    }

    if (decision.status === "RETRY") {
      logger.warn({
        event: "JOB_STATUS_RETRY",
        err: error,
        requestId,
        jobType,
        source,
        retryCount: decision.retryCount,
        maxRetryCount: decision.maxRetryCount,
        errorMessage
      }, "Job failed and will be retried");
      await saveJobLog({
        requestId,
        eventType: "JOB_FAILED_WILL_RETRY",
        level: "WARN",
        message: "Job failed and will be retried",
        jobType,
        sourceErp: jobMessage.sourceErp,
        requestKey: jobMessage.requestKey,
        channelCd: getChannelCd(jobMessage),
        mallKey: getMallKey(jobMessage),
        retryCount: decision.retryCount,
        maxRetryCount: decision.maxRetryCount,
        errorMessage,
        detail: {
          source,
          workerInstanceId,
          kafkaClientId,
          retryClassification
        }
      });
      return;
    }

    logger.error({
      event: retryClassification.retryable ? "JOB_STATUS_FAILED" : "JOB_STATUS_FAILED_NON_RETRYABLE",
      err: error,
      requestId,
      jobType,
      source,
      retryCount: decision.retryCount,
      maxRetryCount: decision.maxRetryCount,
      errorMessage,
      retryClassification
    }, "Job failed permanently");
    await saveJobLog({
      requestId,
      eventType: retryClassification.retryable ? "JOB_FAILED_PERMANENTLY" : "JOB_FAILED_NON_RETRYABLE",
      level: "ERROR",
      message: retryClassification.retryable ? "Job failed permanently" : "Job failed without retry",
      jobType,
      sourceErp: jobMessage.sourceErp,
      requestKey: jobMessage.requestKey,
      channelCd: getChannelCd(jobMessage),
      mallKey: getMallKey(jobMessage),
      retryCount: decision.retryCount,
      maxRetryCount: decision.maxRetryCount,
      errorMessage,
      detail: {
        source,
        workerInstanceId,
        kafkaClientId,
        retryClassification
      }
    });

    const dlqPublished = await publishDlq({
      jobMessage,
      errorMessage,
      retryCount: decision.retryCount,
      maxRetryCount: decision.maxRetryCount,
      source
    });

    await saveJobLog({
      requestId,
      eventType: dlqPublished ? "JOB_DLQ_PUBLISHED" : "JOB_DLQ_PUBLISH_FAILED",
      level: dlqPublished ? "INFO" : "ERROR",
      message: dlqPublished ? "Job published to DLQ" : "Job DLQ publish failed",
      jobType,
      sourceErp: jobMessage.sourceErp,
      requestKey: jobMessage.requestKey,
      channelCd: getChannelCd(jobMessage),
      mallKey: getMallKey(jobMessage),
      retryCount: decision.retryCount,
      maxRetryCount: decision.maxRetryCount,
      errorMessage,
      detail: {
        source,
        workerInstanceId,
        kafkaClientId,
        dlqTopic: process.env.KAFKA_DLQ_TOPIC ?? "hub.jobs.dlq"
      }
    });
  }
}

function getChannelCd(jobMessage: HubJobMessage): string | undefined {
  return getRequiredString(jobMessage.payload.channelCd, "channelCd");
}

function getMallKey(jobMessage: HubJobMessage): string | undefined {
  return getOptionalString(jobMessage.payload.mallKey);
}

async function prepareJobMessage(jobMessage: HubJobMessage): Promise<HubJobMessage> {
  if (!requiresChannelCredentials(jobMessage)) {
    return jobMessage;
  }

  return enrichWithChannelCredentials(jobMessage);
}

async function runRegisteredHandler(jobMessage: HubJobMessage, requestId: string): Promise<boolean | null> {
  const lockKey = resolveJobLockKey(jobMessage);
  if (!lockKey || (jobMessage.jobType === "ORDER_COLLECT" && getChannelCd(jobMessage) === "MOCK_MALL")) {
    return executeRegisteredHandler(jobMessage, requestId);
  }
  const lockAcquired = await tryAcquireJobLock(lockKey, requestId);

  if (!lockAcquired) {
    await deferJobForLockConflict(requestId, lockKey);
    return null;
  }

  try {
    return await executeRegisteredHandler(jobMessage, requestId);
  } finally {
    await releaseJobLock(lockKey, requestId);
  }
}

async function executeRegisteredHandler(jobMessage: HubJobMessage, requestId: string): Promise<boolean> {
  const handler = registry.get(jobMessage.jobType, getChannelCd(jobMessage));
  if (jobMessage.jobType === "ORDER_NORMALIZE") {
    await handler.handle(jobMessage);
    const completion = await completeOrderNormalizeWithErpApply(jobMessage);
    if (completion.erpApplyJob) {
      await saveJobLog({
        requestId: jobMessage.requestId,
        eventType: completion.outboxCreated ? "ERP_APPLY_OUTBOX_CREATED" : "ERP_APPLY_OUTBOX_ALREADY_EXISTS",
        level: "INFO",
        message: completion.outboxCreated ? "ERP apply job and outbox created" : "ERP apply job already has an outbox event",
        jobType: jobMessage.jobType,
        sourceErp: jobMessage.sourceErp,
        requestKey: jobMessage.requestKey,
        channelCd: getChannelCd(jobMessage),
        mallKey: getMallKey(jobMessage),
        detail: {
          erpApplyRequestId: completion.erpApplyJob.requestId,
          erpConnectionId: completion.erpApplyJob.payload.erpConnectionId,
          correlationId: completion.erpApplyJob.correlationId
        }
      });
    } else if (completion.erpAutoApplySkipped) {
      await saveJobLog({
        requestId: jobMessage.requestId,
        eventType: "ERP_AUTO_APPLY_DISABLED",
        level: "INFO",
        message: "ERP auto apply disabled. ERP_APPLY job was not created.",
        jobType: jobMessage.jobType,
        sourceErp: jobMessage.sourceErp,
        requestKey: jobMessage.requestKey,
        channelCd: getChannelCd(jobMessage),
        mallKey: getMallKey(jobMessage),
        detail: { autoErpApply: false }
      });
    }
    return completion.succeeded;
  }
  if (jobMessage.jobType !== "ORDER_COLLECT") {
    await handler.handle(jobMessage);
    return succeedJob(requestId);
  }

  const resultPayload = await captureOrderCollectResult(jobMessage, () => handler.handle(jobMessage));
  const completion = await completeOrderCollectWithNormalize(jobMessage, resultPayload);
  if (completion.succeeded) {
    await saveJobLog({
      requestId: jobMessage.requestId,
      eventType: "ORDER_COLLECT_TRANSACTION_COMMITTED",
      level: "INFO",
      message: "Order collection completion transaction committed",
      jobType: jobMessage.jobType,
      sourceErp: jobMessage.sourceErp,
      requestKey: jobMessage.requestKey,
      channelCd: getChannelCd(jobMessage),
      mallKey: getMallKey(jobMessage),
      detail: {
        normalizeCreated: completion.normalizeJob !== null,
        outboxCreated: completion.outboxCreated
      }
    });
  }
  if (completion.normalizeJob) {
    await saveJobLog({
      requestId: jobMessage.requestId,
      eventType: completion.outboxCreated
        ? "ORDER_NORMALIZE_OUTBOX_CREATED"
        : "ORDER_NORMALIZE_OUTBOX_ALREADY_EXISTS",
      level: "INFO",
      message: completion.outboxCreated
        ? "Order normalize job and outbox created"
        : "Order normalize job already has an outbox event",
      jobType: jobMessage.jobType,
      sourceErp: jobMessage.sourceErp,
      requestKey: jobMessage.requestKey,
      channelCd: getChannelCd(jobMessage),
      mallKey: getMallKey(jobMessage),
      detail: {
        normalizeRequestId: completion.normalizeJob.requestId,
        normalizeRequestKey: completion.normalizeJob.requestKey,
        correlationId: completion.normalizeJob.correlationId
      }
    });
  }
  return completion.succeeded;
}

function requiresChannelCredentials(jobMessage: HubJobMessage): boolean {
  return (jobMessage.jobType === "ORDER_COLLECT" || jobMessage.jobType === "ORDER_STATUS_SYNC")
    && getChannelCd(jobMessage) !== "MOCK_MALL";
}

async function enrichWithChannelCredentials(jobMessage: HubJobMessage): Promise<HubJobMessage> {
  const userId = getUserId(jobMessage.payload.userId);
  const mallKey = getRequiredString(jobMessage.payload.mallKey, "mallKey");

  if (userId === null) {
    logger.warn({
      event: "CHANNEL_CREDENTIAL_LOOKUP_SKIPPED",
      requestId: jobMessage.requestId,
      mallKey,
      reason: "payload_user_id_missing"
    }, "Channel credential lookup skipped");
    await saveJobLog({
      requestId: jobMessage.requestId,
      eventType: "CHANNEL_CREDENTIAL_LOOKUP_SKIPPED",
      level: "WARN",
      message: "Channel credential lookup skipped",
      jobType: jobMessage.jobType,
      sourceErp: jobMessage.sourceErp,
      requestKey: jobMessage.requestKey,
      channelCd: getChannelCd(jobMessage),
      mallKey,
      detail: {
        reason: "payload_user_id_missing"
      }
    });
    return jobMessage;
  }

  const payloadCorpId = getUserId(jobMessage.payload.corpId);
  const payloadChannelAccountId = getUserId(jobMessage.payload.channelAccountId);
  const identity = payloadCorpId !== null && payloadChannelAccountId !== null
    ? { corpId: payloadCorpId, channelAccountId: payloadChannelAccountId }
    : await findActiveChannelAccountIdentity(userId, mallKey);

  logger.info({
    event: "CHANNEL_CREDENTIAL_LOOKUP_STARTED",
    requestId: jobMessage.requestId,
    userId,
    corpId: identity.corpId,
    channelAccountId: identity.channelAccountId,
    mallKey,
    channelCd: getChannelCd(jobMessage)
  }, "Channel credential lookup started");

  const credentials = await findActiveChannelCredentials(identity.corpId, identity.channelAccountId);
  logger.info({
    event: "CHANNEL_CREDENTIAL_LOOKUP_SUCCESS",
    requestId: jobMessage.requestId,
    userId,
    corpId: identity.corpId,
    channelAccountId: identity.channelAccountId,
    mallKey,
    channelCd: getChannelCd(jobMessage),
    hasKey: Boolean(credentials.key),
    hasKey2: Boolean(credentials.key2),
    hasAuthKey: Boolean(credentials.authKey),
    hasMallId: Boolean(credentials.mallId),
    hasMallPw: Boolean(credentials.mallPw),
    hasVendorId: Boolean(credentials.vendorId)
  }, "Channel credential lookup succeeded");
  await saveJobLog({
    requestId: jobMessage.requestId,
    eventType: "CHANNEL_CREDENTIAL_LOOKUP_SUCCESS",
    level: "INFO",
    message: "Channel credential lookup succeeded",
    jobType: jobMessage.jobType,
    sourceErp: jobMessage.sourceErp,
    requestKey: jobMessage.requestKey,
    channelCd: getChannelCd(jobMessage),
    mallKey,
    detail: {
      userId,
      corpId: identity.corpId,
      channelAccountId: identity.channelAccountId,
      hasKey: Boolean(credentials.key),
      hasKey2: Boolean(credentials.key2),
      hasAuthKey: Boolean(credentials.authKey),
      hasMallId: Boolean(credentials.mallId),
      hasMallPw: Boolean(credentials.mallPw),
      hasVendorId: Boolean(credentials.vendorId)
    }
  });

  return {
    ...jobMessage,
    payload: {
      ...jobMessage.payload,
      corpId: identity.corpId,
      channelAccountId: identity.channelAccountId,
      ...credentials
    }
  };
}

function getUserId(value: unknown): number | null {
  const userId = typeof value === "number" ? value : Number(value);
  return Number.isInteger(userId) ? userId : null;
}

function getRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

function parseHubJobMessage(rawMessage: string): HubJobMessage {
  return HubJobMessageSchema.parse(JSON.parse(rawMessage));
}
