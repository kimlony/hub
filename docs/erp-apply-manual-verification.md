# ERP Apply API Manual Verification

All commands below require a UI JWT. The server derives `corpId` from the authenticated principal; callers must not send a tenant identifier.

```bash
TOKEN='login-response-token'
AUTH="Authorization: Bearer $TOKEN"
```

## ERP result list

```bash
curl -s -H "$AUTH" \
  "http://localhost:3000/api/hub/erp/apply-results?status=FAILED&page=1&size=20"
```

Optional filters are `status`, `operation`, `requestId`, `correlationId`, `erpConnectionId`, `normalizedOrderId`, `fromDate`, and `toDate`.

## ERP result detail

```bash
curl -s -H "$AUTH" \
  "http://localhost:3000/api/hub/erp/apply-results/12"
```

A missing result and a result owned by another company both return `404`.

## Job pipeline and retry

```bash
curl -s -H "$AUTH" \
  "http://localhost:3000/api/hub/jobs/{requestId}/pipeline"

curl -s -i -X POST -H "$AUTH" \
  "http://localhost:3000/api/hub/jobs/{requestId}/retry"
```

Pipeline lookup, each Job in the chain, ERP apply results, logs, and retry updates are limited to the authenticated company. A cross-tenant `requestId` returns `404` and is never reset or published.

## Isolation check

1. Create or identify records for two different companies.
2. Log in as company A and save its UI JWT.
3. Query company B's result id and Job request id using company A's token.
4. Verify list responses contain only company A rows.
5. Verify detail, pipeline, logs, and retry calls for company B return `404`.
6. Verify the company B Job status and outbox rows did not change.

Do not add `corpId` to the URL during this check. An extra `corpId` parameter is ignored as tenant authority; the authenticated principal remains authoritative.
