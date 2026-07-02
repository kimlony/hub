import { KafkaContainer, type StartedKafkaContainer } from "@testcontainers/kafka";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";

const { Pool } = pg;

let postgresContainer: StartedPostgreSqlContainer | null = null;
let kafkaContainer: StartedKafkaContainer | null = null;
let postgresSchemaInitialized = false;

export async function setupPostgresTestContainer(): Promise<void> {
  if (!postgresContainer) {
    postgresContainer = await new PostgreSqlContainer("postgres:16")
      .withDatabase("hub_db")
      .withUsername("hub")
      .withPassword("hub-test")
      .start();
  }

  process.env.POSTGRES_HOST = postgresContainer.getHost();
  process.env.POSTGRES_PORT = String(postgresContainer.getPort());
  process.env.POSTGRES_DATABASE = postgresContainer.getDatabase();
  process.env.POSTGRES_USER = postgresContainer.getUsername();
  process.env.POSTGRES_PASSWORD = postgresContainer.getPassword();
  process.env.HUB_AES_SECRET ??= "change-me-32-byte-secret-local!!";

  await initializePostgresBaseSchema();
}

export async function setupKafkaTestContainer(): Promise<void> {
  if (!kafkaContainer) {
    kafkaContainer = await new KafkaContainer("confluentinc/cp-kafka:7.6.1")
      .withKraft()
      .start();
  }

  process.env.KAFKA_BROKERS = `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9093)}`;
  process.env.KAFKA_DLQ_TOPIC ??= "hub.jobs.dlq";
  process.env.KAFKAJS_NO_PARTITIONER_WARNING ??= "1";
}

export async function setupWorkerIntegrationContainers(options: { kafka?: boolean } = {}): Promise<void> {
  await setupPostgresTestContainer();
  if (options.kafka) {
    await setupKafkaTestContainer();
  }
}

export function createIntegrationPgPool(): pg.Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DATABASE ?? "hub_db",
    user: process.env.POSTGRES_USER ?? "hub",
    password: process.env.POSTGRES_PASSWORD,
    options: "-c timezone=Asia/Seoul"
  });
}

async function initializePostgresBaseSchema(): Promise<void> {
  if (postgresSchemaInitialized) {
    return;
  }

  const pool = createIntegrationPgPool();
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(60) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

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
        parent_job_id VARCHAR(100),
        correlation_id VARCHAR(100) NOT NULL DEFAULT gen_random_uuid()::text,
        causation_id VARCHAR(100),
        schema_version VARCHAR(20) NOT NULL DEFAULT '1.0',
        payload_version VARCHAR(20) NOT NULL DEFAULT '1.0',
        next_retry_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_job_request_key
      ON hub_job(request_key)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_job_log (
        id BIGSERIAL PRIMARY KEY,
        request_id VARCHAR(100) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        level VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        job_type VARCHAR(100),
        source_erp VARCHAR(100),
        request_key VARCHAR(200),
        channel_cd VARCHAR(30),
        mall_key VARCHAR(50),
        retry_count INT,
        max_retry_count INT,
        error_message TEXT,
        detail JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_job_lock (
        lock_key VARCHAR(200) PRIMARY KEY,
        request_id VARCHAR(100) NOT NULL,
        locked_by VARCHAR(120) NOT NULL,
        locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);

    postgresSchemaInitialized = true;
  } finally {
    await pool.end();
  }
}

export async function stopWorkerIntegrationContainers(): Promise<void> {
  if (kafkaContainer) {
    await kafkaContainer.stop();
    kafkaContainer = null;
  }

  if (postgresContainer) {
    await postgresContainer.stop();
    postgresContainer = null;
    postgresSchemaInitialized = false;
  }
}
