# Order Normalization Pipeline

이 문서는 Easy Hub의 주문 정규화 파이프라인을 정리한 문서입니다. 핵심은 쇼핑몰마다 다른 주문 응답을 그대로 사용하지 않고, 원본은 보존하면서 Worker에서 채널별 Normalizer를 통해 공통 주문 모델로 변환하는 것입니다.

정규화 파이프라인은 단순 데이터 매핑 기능이 아니라, 수집된 주문 데이터를 외부 API와 운영 화면에서 일관되게 사용할 수 있도록 만드는 운영 자동화 계층입니다. raw 데이터 보존, 별도 정규화 Job, retry/recovery 흐름을 함께 설계해 정규화 실패도 추적 가능한 Job으로 관리하도록 했습니다.

## 문제

프로젝트에서 다루는 쇼핑몰 채널은 서로 다른 주문 응답 구조를 가지고 있습니다.

- NAVER / NSS
- GODO
- 11ST
- COUPANG
- GCHAN

예를 들어 어떤 채널은 주문번호를 `orderId`로 주고, 다른 채널은 `ordNo`, `orderCode`처럼 다른 이름으로 줍니다. 상품 목록 위치도 다르고, 배송 정보가 주문에 붙어 있거나 shipment 안에 들어 있는 경우도 있습니다.

모든 raw 필드를 DB 컬럼으로 만들면 스키마가 과도하게 커지고, 채널 응답이 바뀔 때마다 DB 변경이 반복됩니다. 반대로 raw JSON만 저장하면 외부 API나 운영 화면에서 주문 데이터를 일관되게 제공하기 어렵습니다.

## 설계 방향

Easy Hub는 이 문제를 다음 방식으로 분리했습니다.

1. 쇼핑몰 응답 원본은 `hub_job_result.result_payload`에 JSONB로 저장한다.
2. 수집 성공 후 `ORDER_NORMALIZE` Job을 별도로 생성한다.
3. Worker가 채널별 Normalizer를 선택해 공통 주문 모델로 변환한다.
4. 정규화 결과를 `hub_collected_order*` 테이블에 upsert한다.
5. 외부 API와 운영 화면은 정규화된 주문 모델을 조회한다.

이 구조는 원본 보존과 공통 데이터 제공을 동시에 만족시키기 위한 선택입니다. 채널별 응답이 달라도 외부 API는 동일한 주문 모델을 사용할 수 있고, 정규화 실패가 발생해도 raw payload를 기준으로 원인을 추적하거나 재처리할 수 있습니다.

## 처리 흐름

```text
ORDER_COLLECT Job
      |
      v
채널별 주문수집 Handler
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

## 왜 별도 Job으로 분리했나

**문제**

주문수집 직후 API 서버에서 바로 정규화를 수행하면 API 서버가 채널별 parsing과 mapping 책임까지 갖게 됩니다. 정규화 실패도 일반 수집 실패와 섞여 추적하기 어려워질 수 있습니다.

**설계**

수집 성공과 정규화 성공을 분리해 각각 Job으로 추적하도록 설계했습니다. raw 수집이 성공하면 `ORDER_NORMALIZE` Job을 생성하고, Worker가 정규화를 처리합니다.

**구현**

- `hub_job_result`에 raw payload 저장
- raw result에 주문 배열이 있을 때만 `ORDER_NORMALIZE` Job 생성
- `NormalizerRegistry`가 `channelCd` 기준으로 Normalizer 선택
- 정규화 결과를 공통 주문 테이블에 upsert
- 정규화 실패도 기존 Worker retry/backoff/DLQ 흐름을 사용

**운영 효과**

수집은 성공했지만 정규화가 실패한 상황을 별도로 추적할 수 있습니다. 운영자는 raw 데이터가 있는지, 정규화 Job이 생성되었는지, 어떤 Normalizer에서 실패했는지 단계별로 확인할 수 있습니다.

## 테이블 구조

### `hub_collected_order`

정규화된 주문 header를 저장합니다.

주요 필드:

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

`channel_cd + channel_order_id`를 채널 주문의 고유 기준으로 사용합니다.

### `hub_collected_order_item`

주문 상품 line을 저장합니다.

주요 필드:

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

배송 및 수취인 정보를 저장합니다.

주요 필드:

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

수집 Job별 정규화 수행 여부를 기록합니다.

확인 가능한 정보:

- 해당 raw result가 정규화되었는지
- 몇 건이 정규화되었는지
- 정규화 중 실패했는지

## Normalizer 전략

`NormalizerRegistry`는 `channelCd`를 기준으로 적절한 Normalizer를 선택합니다.

| Normalizer | 채널 | 역할 |
| --- | --- | --- |
| `SmartstoreOrderNormalizer` | `NAVER`, `NSS` | 스마트스토어 계열 주문 / 상품 / 배송 구조 처리 |
| `CoupangOrderNormalizer` | `COUPANG` | 쿠팡 shipment / order item / receiver 구조 처리 |
| `GiftOrderNormalizer` | `GCHAN` | 선물 또는 수령자 중심 주문 구조 처리 |
| `FlatCommerceOrderNormalizer` | `11ST`, `GODO` | 비교적 flat한 커머스 응답 구조 처리 |
| `GenericOrderNormalizer` | fallback | 전용 정책이 없는 채널의 기본 매핑 |

채널별 예외는 각 Normalizer에 모으고, 공통 테이블 구조는 안정적으로 유지하는 방향을 선택했습니다. 채널이 추가될 때는 공통 테이블을 계속 늘리기보다 Normalizer를 추가하거나 보완하는 방식으로 확장할 수 있습니다.

## 실패 처리

정규화 대상이 되는 `orders` 배열이 없거나 비어 있으면 `ORDER_NORMALIZE` Job을 만들지 않습니다. 빈 결과는 실패가 아니라 수집 결과가 없는 정상 상황으로 봤습니다.

정규화 중 실패하면 기존 Worker 처리 흐름과 동일하게 retry/backoff 대상이 되고, 반복 실패하면 DLQ로 분리될 수 있습니다.

이 설계 덕분에 운영자는 “수집 결과가 없어서 정규화를 건너뛴 것인지”, “정규화 중 mapping 오류가 발생한 것인지”, “반복 실패로 DLQ에 들어갔는지”를 Job 흐름에서 구분할 수 있습니다.

## 운영 효과

- 외부 API는 쇼핑몰별 응답 차이를 몰라도 된다.
- 원본 JSON이 남아 있어 디버깅과 재정제가 가능하다.
- 채널 추가 시 Normalizer 중심으로 확장할 수 있다.
- 공통 주문 테이블은 안정적으로 유지할 수 있다.
- 채널별 예외 처리가 한 계층에 모인다.
- 수집 성공과 정규화 성공을 분리해 장애 지점을 좁힐 수 있다.
- 정규화 실패도 retry/recovery/DLQ 흐름으로 관리할 수 있다.

## 한계

- 실제 운영에서는 쇼핑몰별 예외 케이스가 더 많을 수 있다.
- 채널별 샘플 응답을 더 확보해 회귀 테스트를 늘려야 한다.
- 개인정보 필드는 마스킹/접근권한 정책을 더 구체화해야 한다.
- 정규화 실패 Job을 운영자가 화면에서 재처리하는 기능은 추가 보완 대상이다.

## 검증

Worker 정규화 계층에는 대표 routing 및 mapping 테스트를 추가했습니다.

```powershell
cd hub-worker
node node_modules\\typescript\\bin\\tsc --noEmit -p tsconfig.json
node node_modules\\jest\\bin\\jest.js --runInBand
node node_modules\\typescript\\bin\\tsc -p tsconfig.json
```

최종 확인:

- TypeScript check 통과
- Jest 4 suites / 20 tests 통과
- Worker build 통과
- API compileJava 통과
