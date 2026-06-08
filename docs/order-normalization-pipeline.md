# Order Normalization Pipeline

이 문서는 BizBee HUB의 주문 정규화 파이프라인을 정리한 포트폴리오용 설계 문서입니다.
핵심은 쇼핑몰마다 다른 주문 응답을 그대로 테이블에 맞추는 것이 아니라, 원본은 보존하고 Worker에서 채널별 Normalizer를 통해 공통 주문 모델로 변환하는 것입니다.

## Summary

BizBee HUB collects order data from several shopping mall channels. Each channel returns a different response shape, field naming convention, date format, and item structure.

The normalization pipeline separates this problem into two steps:

1. **Raw collection**: preserve the original channel response in `hub_job_result`.
2. **Normalization**: convert raw channel data into the common `hub_collected_order*` tables through a worker job.

This allows the system to keep the source data for debugging while providing stable, standardized data to external API clients.

## Problem

The project currently targets 4 to 5 shopping mall channels:

- NAVER / NSS
- GODO
- 11ST
- COUPANG
- GCHAN

These channels do not share one fixed order schema.

Examples:

- One channel may use `orderId`, another may use `ordNo`, and another may use `orderCode`.
- Some channels return item lists under `items`; others nest them under shipment or product-order objects.
- Delivery information may be attached to the order, the shipment, or the recipient.
- Some fields are reliable across channels, but many are channel-specific.

If every raw field were turned into a database column, the schema would become too large and fragile. Every channel change would require schema migration.

## Design Decision

BizBee HUB uses a hybrid model:

- Common business fields are normalized into columns.
- Channel-specific details are preserved in `raw_payload`.
- Each channel has its own normalizer strategy.

This keeps query/export performance acceptable while still retaining the original data for troubleshooting.

## Pipeline

```text
ORDER_COLLECT job
    |
    v
Mall API handler
    |
    v
hub_job_result.result_payload
    |
    v
createNormalizeJobForResult()
    |
    v
Kafka: ORDER_NORMALIZE
    |
    v
OrderNormalizeHandler
    |
    v
NormalizerRegistry
    |
    +-- SmartstoreOrderNormalizer
    +-- CoupangOrderNormalizer
    +-- GiftOrderNormalizer
    +-- FlatCommerceOrderNormalizer
    +-- GenericOrderNormalizer
    |
    v
hub_collected_order*
```

## Tables

### `hub_collected_order`

Stores the normalized order header.

Important fields:

- `user_id`
- `channel_cd`
- `mall_key`
- `channel_order_id`
- `order_status`
- `order_date`
- `paid_at`
- `buyer_name`
- `buyer_tel`
- `buyer_email`
- `payment_method`
- `order_amount`
- `product_amount`
- `delivery_fee`
- `discount_amount`
- `raw_payload`

The key idea is that `channel_cd + channel_order_id` identifies an order from a mall channel.

### `hub_collected_order_item`

Stores item-level data.

Important fields:

- `order_id`
- `channel_order_item_id`
- `product_id`
- `seller_product_code`
- `sku_code`
- `product_name`
- `option_name`
- `item_status`
- `quantity`
- `unit_price`
- `item_amount`
- `discount_amount`
- `expected_settlement_amount`
- `raw_payload`

### `hub_collected_order_delivery`

Stores delivery and receiver information.

Important fields:

- `order_id`
- `receiver_name`
- `receiver_tel`
- `receiver_zip_code`
- `receiver_addr1`
- `receiver_addr2`
- `delivery_memo`
- `delivery_company`
- `tracking_number`
- `delivery_status`
- `raw_payload`

### `hub_order_normalize_checkpoint`

Tracks normalization execution per source collection job.

This helps answer:

- Was the raw collection result normalized?
- How many orders were normalized?
- Did normalization fail?

## Normalizer Strategy

The worker uses `NormalizerRegistry` to choose the right normalizer for each channel.

| Normalizer | Channels | Purpose |
| --- | --- | --- |
| `SmartstoreOrderNormalizer` | `NAVER`, `NSS` | Handles SmartStore-style nested order/product-order/shipping structures |
| `CoupangOrderNormalizer` | `COUPANG` | Handles shipment/order item/receiver style data |
| `GiftOrderNormalizer` | `GCHAN` | Handles gift or recipient-oriented order data |
| `FlatCommerceOrderNormalizer` | `11ST`, `GODO` | Handles flatter commerce response structures |
| `GenericOrderNormalizer` | fallback | Handles unknown but reasonably flat order data |

## Why This Is Useful

This structure makes channel expansion safer.

To add or refine a channel:

1. Add a new normalizer or extend an existing one.
2. Register it in `NormalizerRegistry`.
3. Add representative tests for the channel response shape.
4. Keep the normalized tables stable.

The external API does not need to know how each mall structures its response.

## Failure Handling

Normalization is handled as a separate Kafka job.

Benefits:

- The API server does not perform heavy parsing work.
- Failed normalization can use the same retry/backoff/DLQ flow as other worker jobs.
- Raw collection data remains available even when normalization fails.
- Empty `orders` results are skipped and marked as successful with zero normalized rows.

## Portfolio Interpretation

This feature can be described as:

> Built a Kafka-based asynchronous order normalization pipeline that converts heterogeneous shopping mall order responses into a common internal order model using a channel-specific strategy pattern.

Good interview talking points:

- Why raw data is stored before normalization
- Why normalization is a worker job instead of API-side polling
- How channel-specific formats are isolated
- How idempotent storage protects against repeated collection
- How retry/backoff/DLQ makes failures observable and recoverable

## Verification

The worker normalization layer is covered by unit tests for representative routing and mapping behavior.

Current verification commands:

```powershell
cd hub-worker
node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json
node node_modules\jest\bin\jest.js --runInBand
node node_modules\typescript\bin\tsc -p tsconfig.json
```

Latest verification result:

- TypeScript check: passed
- Jest: 4 suites / 20 tests passed
- Worker build: passed
- API `compileJava`: passed
