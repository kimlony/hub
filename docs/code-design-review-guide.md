# Code Design Review Guide

This guide maps Easy Hub's operational design decisions to implementation and tests. It is a code-reading aid and does not redefine the runtime contract described in the pipeline, Outbox, fencing, security, and test guides.

## 1. Job ownership and stale attempts

`hub-worker/src/db/postgres.ts` claims a Job only when its status is `QUEUED`, then creates a `hub_job_attempt` record in the same SQL statement. The returned `JobExecutionToken` contains the attempt ID, worker ID, fencing token, and lease deadline.

Later status/result writes require that same token. Recovery only reclaims `PROCESSING` Jobs whose `lease_until` has passed and increments the fencing token. An older Worker can finish its external work, but it cannot overwrite the database state of a newer attempt.

Review these tests first:

- `hub-worker/src/db/postgres.fencing.integration.test.ts`
- `hub-worker/src/db/postgres.jobEnvelope.integration.test.ts`

Fencing protects database write authority. It does not cancel an external API call that already reached a mall or ERP; ERP idempotency remains a separate control.

## 2. Job and Outbox delivery boundary

The API creates `hub_job` and `hub_job_outbox(PENDING)` through the same service transaction. A Worker creates child Jobs and child Outbox rows in its parent-completion transaction. `JobOutboxPublisher` later claims delivery rows with `FOR UPDATE SKIP LOCKED`, changes them to `PUBLISHING`, sends Kafka, and marks successful delivery `SENT`.

The `PUBLISHING` claim limits concurrent publishers from sending one pending row simultaneously. A stale publishing claim is eligible for reclaim, so delivery is at-least-once rather than exactly-once.

Review these files:

- `hub-api-erp/src/main/java/hub/outbox/service/JobOutboxServiceImpl.java`
- `hub-api-erp/src/main/java/hub/outbox/JobOutboxPublisher.java`
- `hub-api-erp/src/main/resources/mapper/JobOutBoxMapper.xml`
- `hub-api-erp/src/test/java/hub/outbox/JobOutboxPublisherTest.java`

## 3. Pipeline progression and idempotency

`ORDER_COLLECT` stores its raw result, creates an `ORDER_NORMALIZE` child and its Outbox row, then marks the parent successful in one transaction. `ORDER_NORMALIZE` writes normalized orders and optionally creates `ERP_APPLY` plus Outbox before its own success transition. Child request keys prevent duplicate child creation for the same parent.

Normalization upserts use channel-account and channel-order identity. Status synchronization updates only status-related fields so a partial status response does not erase richer collected-order fields.

Start at:

- `hub-worker/src/consumer.ts`
- `hub-worker/src/channels/orderNormalize/OrderNormalizeHandler.ts`
- `hub-worker/src/db/postgres.ts`

## 4. Retry, recovery, and DLQ

The retry policy distinguishes retryable technical failures from non-retryable request/business failures. A retry retains the Job's original type, payload, relationship fields, and stored partition key. Recovery processes delayed queued Jobs and expired processing leases. A terminal failure is published to Kafka DLQ; replay validates the stored Job identity and recreates normal delivery through Outbox.

Relevant verification:

- `hub-worker/src/errors/retryPolicy.test.ts`
- `hub-worker/src/dlq.integration.test.ts`
- `hub-api-erp/src/test/java/hub/kafka/KafkaMonitorServiceReplayTest.java`

## 5. Tenant and secret boundaries

Hub API tenant scope comes from the authenticated UI principal, not a client-selected `corpId`. Cross-tenant Job and ERP result access is scoped by the principal's corporation.

ERP payloads contain `erpConnectionId`, not credentials. The Worker retrieves the active connection at execution time. The mock token provider reuses an unexpired token, refreshes on expiry, and permits only one in-attempt refresh after an authentication failure.

Review:

- `docs/security-and-tenant-isolation.md`
- `hub-api-erp/src/main/java/hub/config/SecurityConfig.java`
- `hub-worker/src/channels/erp/ErpApplyHandler.ts`
- `hub-worker/src/channels/erp/MockErpTokenProvider.ts`
- `hub-worker/src/channels/erp/ErpApplyHandler.test.ts`

Production secret encryption, rotation, TLS, and external ERP idempotency support remain operational requirements beyond the mock adapter.

## 6. Validation commands

Run the existing project scripts from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-fast.ps1
powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1
```

The integration command requires Docker because it uses PostgreSQL and Kafka Testcontainers. See [Testing Guide](./testing.md) for the exact coverage and prerequisites.
