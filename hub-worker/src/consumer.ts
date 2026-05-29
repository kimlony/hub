import "dotenv/config";
import { Kafka, type Consumer, type EachMessagePayload } from "kafkajs";
import {
  deferJobForLockConflict,
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
import { GodoOrderHandler } from "./channels/godo/GodoOrderHandler.js";
import { ElevenStOrderHandler } from "./channels/elevenst/ElevenStOrderHandler.js";
import { NfaOrderHandler } from "./channels/nfa/NfaOrderHandler.js";
import { HandlerRegistry } from "./handlers/HandlerRegistry.js";
import type { JobHandlerMessage } from "./handlers/IJobHandler.js";
import { getErrorMessage, logger } from "./logger.js";

export type HubJobMessage = JobHandlerMessage;

const topic = process.env.KAFKA_TOPIC ?? "hub.jobs";
const consumerGroup = process.env.KAFKA_GROUP_ID ?? "hub-worker-group";
const workerInstanceId = `${process.env.WORKER_ROLE ?? "worker"}:${process.pid}`;
const kafkaClientId = `${process.env.KAFKA_CLIENT_ID ?? "hub-worker"}-${process.env.WORKER_ROLE ?? "worker"}-${process.pid}`;
const kafka = new Kafka({
  clientId: kafkaClientId,
  brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean)
});

const consumer: Consumer = kafka.consumer({ groupId: consumerGroup });

const registry = new HandlerRegistry();
registry.register("ORDER_COLLECT", new ElevenStOrderHandler(), "11ST");
registry.register("ORDER_COLLECT", new GchanOrderHandler(), "GCHAN");
registry.register("ORDER_COLLECT", new GodoOrderHandler(), "GODO");
registry.register("ORDER_COLLECT", new CoupangOrderHandler(), "COUPANG");
registry.register("ORDER_COLLECT", new NfaOrderHandler(), "NSS");

export async function startConsumer(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

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
  await consumer.disconnect();
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

  await processJobMessage(jobMessage, "consumer", {
    kafka: {
      topic,
      partition,
      offset: message.offset,
      messageKey,
      kafkaMessageId
    }
  });
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

    const enrichedMessage = await enrichWithChannelCredentials(jobMessage);
    const lockKey = buildJobLockKey(enrichedMessage);
    const lockAcquired = await tryAcquireJobLock(lockKey, requestId);

    if (!lockAcquired) {
      await deferJobForLockConflict(requestId, lockKey);
      return;
    }

    let succeeded = false;
    try {
      const handler = registry.get(jobType, getChannelCd(enrichedMessage));
      await handler.handle(enrichedMessage);
      succeeded = await succeedJob(requestId);
    } finally {
      await releaseJobLock(lockKey, requestId);
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
        sourceErp: enrichedMessage.sourceErp,
        requestKey: enrichedMessage.requestKey,
        channelCd: getChannelCd(enrichedMessage),
        mallKey: getMallKey(enrichedMessage),
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
      channelCd: getChannelCd(enrichedMessage),
      mallKey: getMallKey(enrichedMessage)
    }, "Job completed successfully");
    await saveJobLog({
      requestId,
      eventType: "JOB_COMPLETED",
      level: "INFO",
      message: "Job completed successfully",
      jobType,
      sourceErp: enrichedMessage.sourceErp,
      requestKey: enrichedMessage.requestKey,
      channelCd: getChannelCd(enrichedMessage),
      mallKey: getMallKey(enrichedMessage),
      detail: {
        source
      }
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const decision = await retryOrFailJob(requestId, errorMessage);

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
          source
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
          source
        }
      });
      return;
    }

    logger.error({
      event: "JOB_STATUS_FAILED",
      err: error,
      requestId,
      jobType,
      source,
      retryCount: decision.retryCount,
      maxRetryCount: decision.maxRetryCount,
      errorMessage
    }, "Job failed permanently");
    await saveJobLog({
      requestId,
      eventType: "JOB_FAILED_PERMANENTLY",
      level: "ERROR",
      message: "Job failed permanently",
      jobType,
      sourceErp: jobMessage.sourceErp,
      requestKey: jobMessage.requestKey,
      channelCd: getChannelCd(jobMessage),
      mallKey: getMallKey(jobMessage),
      retryCount: decision.retryCount,
      maxRetryCount: decision.maxRetryCount,
      errorMessage,
      detail: {
        source
      }
    });
  }
}

function getChannelCd(jobMessage: HubJobMessage): string | undefined {
  const channelCd = jobMessage.payload.channelCd;
  return typeof channelCd === "string" ? channelCd : undefined;
}

function getMallKey(jobMessage: HubJobMessage): string | undefined {
  const mallKey = jobMessage.payload.mallKey;
  return typeof mallKey === "string" ? mallKey : undefined;
}

function buildJobLockKey(jobMessage: HubJobMessage): string {
  const userId = getUserId(jobMessage.payload.userId);
  const mallKey = getRequiredString(jobMessage.payload.mallKey, "mallKey");

  if (userId === null) {
    throw new Error("userId is required for job lock");
  }

  return `${jobMessage.jobType}:${userId}:${mallKey}`;
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

  logger.info({
    event: "CHANNEL_CREDENTIAL_LOOKUP_STARTED",
    requestId: jobMessage.requestId,
    userId,
    mallKey,
    channelCd: getChannelCd(jobMessage)
  }, "Channel credential lookup started");

  const credentials = await findActiveChannelCredentials(userId, mallKey);
  logger.info({
    event: "CHANNEL_CREDENTIAL_LOOKUP_SUCCESS",
    requestId: jobMessage.requestId,
    userId,
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
      ...credentials
    }
  };
}

function getUserId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function getRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function parseHubJobMessage(rawMessage: string): HubJobMessage {
  const parsed = JSON.parse(rawMessage) as Partial<HubJobMessage>;

  if (
    typeof parsed.requestId !== "string" ||
    typeof parsed.sourceErp !== "string" ||
    typeof parsed.jobType !== "string" ||
    typeof parsed.requestKey !== "string" ||
    parsed.payload === null ||
    typeof parsed.payload !== "object" ||
    Array.isArray(parsed.payload)
  ) {
    throw new Error("Invalid hub job message format");
  }

  return {
    requestId: parsed.requestId,
    sourceErp: parsed.sourceErp,
    jobType: parsed.jobType,
    requestKey: parsed.requestKey,
    payload: parsed.payload as Record<string, unknown>
  };
}
