# Job Execution Attempt Observability

## Why attempt history exists

`hub_job` is the current job state and current execution authority. Its processing
token fields are deliberately replaced on recovery and cleared on terminal state
changes. It cannot answer how many workers attempted a job, how long an expired
attempt ran, or whether a stale worker was rejected later.

`hub_job_attempt` is the durable history for each issued fencing token. It records
the job primary key (`request_id`), attempt UUID, worker, claim source, timing,
terminal outcome, lease expiry, and stale rejection time. The unique
`(request_id, fencing_token)` constraint makes one fencing token map to one attempt.

## State recording

- Kafka claim creates a `PROCESSING` attempt with `claim_source=KAFKA`.
- Recovery claim marks the previous current attempt `EXPIRED` with
  `error_code=LEASE_EXPIRED`, then creates a new `PROCESSING` attempt with
  `claim_source=RECOVERY` in the same SQL statement.
- SUCCESS, RETRY, FAILED, and lock-conflict deferral close the current attempt in
  the same database transaction as the corresponding `hub_job` state change.
- A rejected stale completion does not alter the current job. It sets
  `stale_rejected_at` on the matching historical attempt and retains the existing
  `STALE_JOB_ATTEMPT_REJECTED` job log event. That audit write is best effort and
  cannot make a stale attempt retry or enter the DLQ.

Existing PROCESSING jobs at migration time receive one `MIGRATION`-sourced attempt
so their later terminal result remains traceable. New runtime claims use only
KAFKA or RECOVERY; MANUAL is reserved for a future explicit admin claim command.

## Query APIs

- `GET /api/admin/jobs/{jobId}/attempts`: attempt history for the exact Job primary
  key. In this schema `jobId` is the `hub_job.request_id` value.
- `GET /api/admin/job-execution-metrics?from={ISO-8601}&to={ISO-8601}&jobType={type}`:
  aggregates attempts whose `claimed_at` falls in `[from, to)`. Omitted dates
  default to the most recent 24 hours. Both APIs require `SYSTEM_ADMIN`.

Metrics include total/success/recovery attempts, lease expirations, stale
rejections, average attempts per job, and average/p95/p99 terminal duration by
job type. PostgreSQL `percentile_cont` is appropriate here because these are
operational SQL queries over bounded time windows. If the attempt table becomes
large enough for percentile queries to affect API latency, retain raw attempts and
add a scheduled rollup table or analytics store; do not approximate production
decisions with process-local counters.

## Micrometer ownership

The current API does not include Actuator/Micrometer, so this change keeps the DB
history as the authoritative cross-worker measurement source. A future worker can
publish these local meters:

- `hub.job.attempt.active`: local in-flight attempt gauge.
- `hub.job.recovery.count`, `hub.job.lease.expired.count`, and
  `hub.job.stale.rejected.count`: process-local counters only.
- `hub.job.processing.duration`: local timer/histogram only.

Those counters must not be treated as global totals because every Worker instance
owns a separate meter process and restarts reset counters. Global dashboards and
design decisions should query `hub_job_attempt`; metrics are useful for alerting
and per-instance behavior after a metrics backend is introduced.

## Decision thresholds

Consider heartbeat first when a job type's p99 approaches 70 percent of
`JOB_LEASE_MINUTES`, when lease expirations are recurring, or when valid long jobs
are repeatedly reprocessed. Heartbeat renewal must remain fenced by the complete
execution token and must stop after authority is lost.

Consider retry jitter when retries cluster at the same `next_retry_at`, recovery
attempts rise during an upstream outage, or DB/external API saturation coincides
with retry waves. Keep the existing bounded retry policy and add random delay only
after observing those patterns.

## Remaining limits

Attempt history observes authority transitions; it does not cancel an external
request already sent by a stale worker. ERP idempotency keys remain necessary.
It also does not impose cross-worker concurrency limits or renew leases. These
are deliberate follow-up decisions based on the measured baseline.

## Admin UI

`SYSTEM_ADMIN` users can inspect the same data in the Front application without
changing a Job.

- **Job list -> Job log -> Attempt history**: opens the attempt timeline for the
  selected Job. Attempts are ordered by claim time and retain both `EXPIRED` and
  a later stale-result rejection when both occurred. The timeline also shows the
  claim source, fencing token, worker ID, lease, completion time, duration, and
  error information.
- **Job Execution Metrics** (`/job-execution-metrics`): defaults to the most
  recent 24 hours and lets an operator choose a time range and Job type. It shows
  only the summary values returned by the metrics API; it does not derive an
  overall duration percentile from per-type values. p95 means 95 percent of
  attempts completed within that duration, and p99 means 99 percent did.

When the selected result contains fewer than 100 attempts, p95 and p99 are shown
with a small-sample notice and should be treated as directional values. Both
screens are strictly read-only: they do not expose retry, force-complete, worker
shutdown, or lease-extension commands.