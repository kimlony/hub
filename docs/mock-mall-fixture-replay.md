# Mock Mall Fixture Replay

## Purpose

Fixture replay sends prepared synthetic orders through the real Easy Hub Job pipeline without calling a real shopping mall. It is restricted to the `MOCK_MALL` adapter:

`ORDER_COLLECT` Job -> Kafka -> Worker -> Raw result -> `ORDER_NORMALIZE` -> `ERP_APPLY`

Real channel handlers do not read fixture files and do not have a fixture branch.

## Fixture File

Place JSON files in the repository-level `mock-fixtures/` directory. In the EC2 dev compose profile this directory is mounted read-only at `/app/mock-fixtures` for every Worker process.

Only a filename such as `demo-orders-10000.json` is accepted. Paths, traversal (`../`), and non-JSON files are rejected by both the API and the Worker.

The fixture can be either an array of orders or an object containing an `orders` array. Each order follows the existing Mock Mall response contract: `orderNo`, `orderedAt`, `orderStatus`, amounts, and one or more order items.

Generate deterministic synthetic data with:

```powershell
cd hub-worker
npm.cmd run mock:fixture -- --output ../mock-fixtures/demo-orders-10000.json --orders 10000 --seed demo-20260715
```

The generated buyer and receiver fields are synthetic only. Do not place real customer exports, credentials, tokens, or personal data in fixture files.

## Running a Replay

1. Start the EC2 dev compose profile with the `mock-fixtures/` directory present.
2. Open the system-admin Load Test page.
3. Set `Orders` to the fixture's exact order count and choose a page size.
4. Enter the fixture filename, for example `demo-orders-10000.json`, and start the run.
5. Use the Job list, Kafka status, Job Attempt history, and ERP result page to trace the run.

When `fixtureFile` is empty, the existing deterministic Mock Mall generator remains in use. A fixture replay records `source=FIXTURE_JSON` and its filename in the raw Job result and collection log so it can be distinguished from generated load data.

## Excel Input

Excel files are intentionally not parsed inside Worker containers. Convert the approved test workbook to this JSON contract before deployment, then mount the resulting JSON read-only. This keeps the Worker image smaller, avoids runtime spreadsheet parsing differences, and makes the exact replay input versionable and reproducible.
