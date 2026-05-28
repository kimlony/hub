# hub-worker notes

The worker consumes Kafka jobs, calls channel APIs, and stores collection results in PostgreSQL.

## Current Architecture

```text
hub-api-erp -> Kafka hub.jobs -> hub-worker -> PostgreSQL
```

Oracle storage has been removed. Do not add Oracle client dependencies or channel Oracle saver files.

## Channel Pattern

Each channel should contain:

- `types.ts`
- `{Channel}ApiClient.ts`
- `{Channel}OrderHandler.ts`

Handlers should:

1. Validate payload.
2. Call the channel API.
3. Save a job log with `saveJobLog`.
4. Save the result JSON with `saveJobResult`.

## Runtime

Use `WORKER_ROLE`:

- `consumer`
- `recovery`
- `http`
- `all`

PM2 starts 4 consumers, 1 recovery process, and 1 HTTP process through `ecosystem.config.cjs`.
