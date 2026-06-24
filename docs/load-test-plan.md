# 대량 API 수집 부하 테스트 설계

이 문서는 Easy Hub의 대량 주문 수집 성능을 수치로 검증하기 위한 부하 테스트 설계 문서입니다.

테스트의 목적은 단순히 많은 데이터를 넣어보는 것이 아니라, Kafka partition 수와 Worker consumer 수가 늘어났을 때 수집/정규화 처리량이 얼마나 개선되는지 확인하는 것입니다.

## 테스트 목적

- Mock Mall 기반 대량 주문 데이터를 deterministic하게 생성한다.
- API, Outbox, Kafka, Worker, 정규화 저장까지 이어지는 e2e 흐름을 검증한다.
- Kafka partition과 Worker consumer 수 증가가 처리량에 주는 영향을 측정한다.
- 수집 Job과 정규화 Job이 같은 Worker pool을 사용할 때 queue 대기 시간이 어떻게 달라지는지 확인한다.
- 결과를 `hub_load_test_run`에 저장해 1p/1w, 4p/4w 결과를 같은 기준으로 비교한다.

## 테스트 범위

실제 쇼핑몰 API는 호출하지 않습니다. `MOCK_MALL` 채널을 통해 요청 시점에 주문 데이터를 생성하고, 실제 주문수집 파이프라인과 같은 방식으로 Job을 처리합니다.

```text
화면 버튼
  -> Hub API
  -> hub_job 생성
  -> hub_job_outbox 저장
  -> Outbox Publisher
  -> Kafka topic
  -> Node Worker consumer
  -> Mock Mall 주문 생성
  -> hub_job_result 저장
  -> ORDER_NORMALIZE Job 생성
  -> Kafka topic
  -> Node Worker consumer
  -> hub_collected_order 저장
  -> hub_load_test_run 결과 저장
```

## Mock Mall 데이터 생성 기준

Mock Mall은 주문 데이터를 파일이나 DB에 미리 저장하지 않습니다.

요청 파라미터 기준으로 데이터를 즉시 생성합니다.

| 파라미터 | 설명 | 기본값 |
| --- | --- | --- |
| `page` | 조회 페이지 | `1` |
| `size` | 페이지당 주문 수 | `100` |
| `totalCount` | 전체 주문 수 | `100000` |
| `seed` | deterministic 생성 기준 | `mock-load-test-ui-001` |
| `mallKey` | 쇼핑몰 계정 키 | `mock-mall-001` |
| `delayMs` | 외부 API 지연 시뮬레이션 | `0` |
| `errorRate` | 실패 응답 비율 | `0` |
| `timeoutRate` | timeout 비율 | `0` |

같은 `page`, `size`, `totalCount`, `seed`로 호출하면 항상 같은 주문 데이터가 생성됩니다.

주문번호는 전체 데이터 기준 index로 생성합니다.

```text
globalIndex = (page - 1) * size + rowIndex + 1
channelOrderId = MOCK-ORDER-000001
```

## 비교 시나리오

이번 기준 비교는 같은 주문 수와 page size를 고정하고, Kafka partition과 Worker consumer 수만 변경했습니다.

| Scenario | Kafka partitions | Worker consumers | Orders | Page size | 설명 |
| --- | ---: | ---: | ---: | ---: | --- |
| `e2e-1p-1w` | 1 | 1 | 100000 | 100 | 기준 성능 |
| `e2e-4p-4w` | 4 | 4 | 100000 | 100 | 병렬 처리 성능 |

## 측정 지표

| 지표 | 설명 |
| --- | --- |
| `total_requested` | 요청한 전체 주문 수 |
| `normalized_orders` | 정규화 저장 완료 주문 수 |
| `elapsed_ms` | 테스트 시작부터 완료까지 걸린 시간 |
| `orders_per_second` | 초당 주문 처리량 |
| `jobs_per_second` | 초당 Job 처리량 |
| `p95_duration_ms` | 완료 Job의 p95 대기/처리 시간 |
| `failed_jobs` | 실패한 수집/정규화 Job 수 |
| `outbox_sent` | Kafka 발행 완료된 Outbox 이벤트 수 |

`p95_duration_ms`는 순수 함수 실행 시간이 아니라 `hub_job.created_at`부터 완료 시점까지의 시간입니다. 따라서 Worker가 적을수록 queue 대기 시간이 포함되어 크게 증가합니다.

## e2e 테스트 결과

측정일: 2026-06-23  
조건: 주문 100000건, page size 100, errorRate 0, timeoutRate 0

| Scenario | Orders | Normalized | Elapsed | Orders/sec | Jobs/sec | P95 job ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `e2e-1p-1w` | 100000 | 100000 | 20m 14s | 82.4 | 1.6 | 807728.5 | 0 |
| `e2e-4p-4w` | 100000 | 100000 | 6m 28s | 257.7 | 5.2 | 152757.8 | 0 |

## 비교 해석

| 항목 | 1p/1w | 4p/4w | 변화 |
| --- | ---: | ---: | --- |
| 소요 시간 | 1214초 | 388초 | 826초 감소, 약 68.0% 단축 |
| 처리량 | 82.4 orders/sec | 257.7 orders/sec | 약 3.13배 증가 |
| Job 처리량 | 1.6 jobs/sec | 5.2 jobs/sec | 약 3.25배 증가 |
| P95 Job 시간 | 807728.5ms | 152757.8ms | 약 81.1% 감소 |
| 실패 Job | 0 | 0 | 동일 |

4p/4w는 1p/1w 대비 전체 처리 시간이 20분 14초에서 6분 28초로 줄었습니다.

수집 Job 1000개와 정규화 Job 1000개가 1개 consumer에 몰리던 구조에서, 4개 partition과 4개 consumer로 분산되면서 queue 대기 시간이 크게 줄었습니다. 그 결과 처리량은 약 3.13배 증가했고, p95 Job 시간은 약 81.1% 감소했습니다.

4배까지 증가하지 않은 이유는 PostgreSQL 저장, Outbox 발행, Kafka polling/commit, 정규화 upsert 같은 공통 병목이 남아 있기 때문입니다. 그래도 partition/consumer 확장에 따라 병렬 처리 효과가 숫자로 확인되었습니다.

## 포트폴리오 요약 문장

```text
Mock Mall 기반 100000건 e2e 부하 테스트를 구성해 API -> Outbox -> Kafka -> Worker -> 정규화 저장까지 전체 흐름을 검증했다.
1 partition / 1 worker 기준 20분 14초가 걸리던 처리가 4 partitions / 4 workers 구성에서는 6분 28초로 줄었다.
초당 주문 처리량은 82.4건에서 257.7건으로 약 3.13배 증가했고, p95 Job 시간은 약 81.1% 감소했다.
이를 통해 Kafka partition과 Worker consumer 확장이 queue 대기 시간과 처리량에 미치는 영향을 수치로 확인했다.
```

## 다음 개선 후보

- CPU/Memory를 e2e 화면 테스트에서도 자동 저장한다.
- partition별 메시지 분포와 consumer lag를 결과에 포함한다.
- 수집 전용 topic과 정규화 전용 topic을 분리해 단계별 병목을 더 명확히 측정한다.
- page size 100, 250, 500 조건별 DB 저장 성능을 비교한다.
- errorRate, timeoutRate를 부여해 Retry/DLQ 부하 테스트를 분리 실행한다.
