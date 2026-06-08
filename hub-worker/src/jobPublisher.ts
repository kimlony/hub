import "dotenv/config";
import { Kafka, type Producer } from "kafkajs";
import type { NormalizeJobInput } from "./db/postgres.js";
import { logger } from "./logger.js";
import { getKafkaClientId } from "./workerIdentity.js";

const topic = process.env.KAFKA_TOPIC ?? "hub.jobs";
const kafka = new Kafka({
  clientId: `${getKafkaClientId()}-publisher`,
  brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean)
});

let producer: Producer | null = null;

export async function publishNormalizeJob(job: NormalizeJobInput): Promise<void> {
  const producer = await getProducer();
  // Use the source collection request as the key so repeated normalize attempts
  // for the same raw result stay ordered on the same Kafka partition.
  const key = String(job.payload.sourceRequestId ?? job.requestId);
  await producer.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(job)
      }
    ]
  });

  logger.info({
    event: "ORDER_NORMALIZE_JOB_PUBLISHED",
    requestId: job.requestId,
    requestKey: job.requestKey,
    sourceRequestId: job.payload.sourceRequestId,
    topic,
    key
  }, "Order normalize job published");
}

export async function closeJobPublisher(): Promise<void> {
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
