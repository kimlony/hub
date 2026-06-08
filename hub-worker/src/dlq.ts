import "dotenv/config";
import { Kafka, type Producer } from "kafkajs";
import type { JobHandlerMessage } from "./handlers/IJobHandler.js";
import { logger } from "./logger.js";
import { getKafkaClientId } from "./workerIdentity.js";

type DlqInput = {
  jobMessage: JobHandlerMessage;
  errorMessage: string;
  retryCount: number;
  maxRetryCount: number;
  source: "consumer" | "recovery";
};

const dlqTopic = process.env.KAFKA_DLQ_TOPIC ?? "hub.jobs.dlq";
const kafka = new Kafka({
  clientId: `${getKafkaClientId()}-dlq`,
  brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean)
});

let producer: Producer | null = null;

export async function publishDlq(input: DlqInput): Promise<boolean> {
  // DLQ keeps the original job message together with retry metadata so failed
  // work can be inspected or replayed without searching application logs first.
  const payload = {
    failedAt: new Date().toISOString(),
    source: input.source,
    errorMessage: input.errorMessage,
    retryCount: input.retryCount,
    maxRetryCount: input.maxRetryCount,
    job: input.jobMessage
  };

  try {
    const dlqProducer = await getProducer();
    await dlqProducer.send({
      topic: dlqTopic,
      messages: [{
        key: input.jobMessage.requestId,
        value: JSON.stringify(payload)
      }]
    });

    logger.error({
      event: "JOB_DLQ_PUBLISHED",
      requestId: input.jobMessage.requestId,
      jobType: input.jobMessage.jobType,
      requestKey: input.jobMessage.requestKey,
      topic: dlqTopic,
      retryCount: input.retryCount,
      maxRetryCount: input.maxRetryCount
    }, "Job published to DLQ");
    return true;
  } catch (error) {
    logger.error({
      event: "JOB_DLQ_PUBLISH_FAILED",
      err: error,
      requestId: input.jobMessage.requestId,
      jobType: input.jobMessage.jobType,
      requestKey: input.jobMessage.requestKey,
      topic: dlqTopic
    }, "Job DLQ publish failed");
    return false;
  }
}

export async function closeDlqProducer(): Promise<void> {
  if (!producer) {
    return;
  }

  await producer.disconnect();
  producer = null;
}

async function getProducer(): Promise<Producer> {
  if (producer) {
    return producer;
  }

  producer = kafka.producer();
  await producer.connect();
  return producer;
}
