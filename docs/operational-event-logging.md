# Operational Event Logging Policy

## Purpose

`hub_job` records the current job state. `hub_job_log` records the operational events that explain how that state was reached. The log is an investigation aid for the Job list and Kafka status screens; it is not an event-sourcing store and must not become a source of truth for state transitions.

The policy exists because a distributed Job can be received by Kafka, reclaimed by Recovery, rejected as stale, retried, or sent to DLQ. Without a common event contract, an operator must infer that flow from differently shaped messages across Worker logs.

## Event Contract

New Worker lifecycle events write `detail.schemaVersion = job-operational-event/v1`. Common fields are:

| Field | Meaning |
| --- | --- |
| `category` | `INTAKE`, `CLAIM`, `EXECUTION`, `RETRY`, `RECOVERY`, `FENCING`, or `DLQ` |
| `source` | `KAFKA`, `RECOVERY`, `MANUAL`, or `SYSTEM` |
| `execution` | `attemptId`, `workerId`, `fencingToken`, and `leaseUntil` when a Claim exists |
| `correlation` | `correlationId`, `parentJobId`, and `causationId` when available |
| `kafka` | Topic, partition, offset, key, and message id for Kafka intake |
| `attributes` | Small, non-sensitive operational facts only |

`requestId` remains the primary correlation key. It is not assumed to identify a single execution attempt: `attemptId` and `fencingToken` identify the authority for that attempt.

## Standard Lifecycle Events

| Event | Level | When written |
| --- | --- | --- |
| `JOB_RECEIVED` | INFO | A Worker starts handling a Kafka or Recovery delivery |
| `JOB_CLAIMED` | INFO | The Worker owns a current execution token |
| `JOB_CLAIM_SKIPPED` | INFO | A queued Claim could not be obtained |
| `JOB_COMPLETED` | INFO | The current attempt completed successfully |
| `JOB_RETRY_SCHEDULED` | WARN | A retryable failure received its next retry schedule |
| `JOB_FAILED` | ERROR | The attempt reached a terminal failure |
| `JOB_DLQ_PUBLISHED` | ERROR | A terminally failed Job was published to DLQ |
| `JOB_DLQ_PUBLISH_FAILED` | ERROR | DLQ publication itself failed |
| `JOB_RECOVERED` | WARN | Recovery reclaimed an expired processing attempt |
| `STALE_JOB_ATTEMPT_REJECTED` | WARN | A stale token was prevented from persisting a result or state change |

`JOB_COMPLETION_SKIPPED` and `JOB_FAILURE_UPDATE_SKIPPED` are fencing-related WARN events. Legacy event names remain readable for previously stored rows, but new lifecycle writes use the names above.

## Data and Failure Rules

- Never write payloads, credentials, API keys, tokens, cookies, buyer/recipient data, contact data, addresses, or raw ERP responses to `detail`.
- Attributes are redacted by key, bounded in depth and size, and are intended for codes, counts, identifiers, and timings only.
- Log writes are best-effort. A `hub_job_log` insert failure is logged by the Worker but must not roll back a Job state transaction or cause a retry by itself.
- State transitions, attempt history, Outbox creation, and ERP result writes keep their own existing transaction and fencing rules. The operational log describes those actions; it does not authorize them.

## Operator Use

From the Job list, open the Job log and read events in time order. For an expired attempt, expect `JOB_RECOVERED` with a newer execution token, followed by a possible `STALE_JOB_ATTEMPT_REJECTED` for the older token and then the current attempt's terminal event.

Kafka monitoring continues to use `JOB_RECEIVED` records with `source=KAFKA` and the Kafka context. The API query accepts legacy intake records while historical rows remain.

## Rollout and Retention

This first rollout standardizes the Worker lifecycle, Recovery, and stale-attempt paths without adding a new log table. Existing specialized channel, lock, and outbox events remain valid but should adopt this contract when they are changed. Retention, archive, and alert thresholds are operational decisions to set after observing log volume; they are intentionally not enforced by this application change.
