# Eazy Hub

Eazy Hub는 여러 쇼핑몰 채널의 주문을 자동으로 수집하고, Kafka Worker로 비동기 처리한 뒤, 채널마다 다른 응답 데이터를 공통 주문 모델로 정규화해 외부 API로 제공하는 주문수집 자동화 플랫폼입니다.

이 프로젝트의 핵심 목표는 **안정화**와 **자동화**입니다. 단순히 쇼핑몰 API를 호출하는 데서 끝내지 않고, 실패 복구, 재시도 제어, DLQ, 모니터링, 정규화, 외부 연동 API까지 하나의 흐름으로 설계했습니다.

## 개발 배경

ERP 업무에서 쇼핑몰 주문수집은 보통 담당자가 각 쇼핑몰 관리자 페이지나 API를 통해 반복적으로 처리합니다. 이 방식에는 몇 가지 문제가 있습니다.

- 쇼핑몰마다 반복되는 수동 수집 작업
- 주문 누락 또는 중복 수집 가능성
- 외부몰 API 장애 발생 시 원인 추적 어려움
- Queue, Worker, 실패 Job 상태를 한눈에 보기 어려움
- 쇼핑몰마다 다른 주문 응답 구조

Eazy Hub는 이 문제를 Job 기반 자동화 파이프라인으로 해결하는 것을 목표로 합니다.

## 전체 처리 흐름

```text
User / Schedule
    |
    v
Hub API (Spring Boot)
    |
    | create hub_job
    | publish Kafka message
    v
Kafka topic: hub.jobs
    |
    v
Hub Worker (Node.js / TypeScript)
    |
    | collect orders from each mall
    | save raw result
    | publish ORDER_NORMALIZE job
    v
Order Normalizer
    |
    | channel-specific mapping
    | upsert normalized order tables
    v
PostgreSQL
    |
    v
External API
```

## 주요 기능

- 멀티 채널 주문수집
  - NAVER SmartStore, GODO, 11ST, COUPANG, GCHAN
- Kafka 기반 비동기 Job 처리
- Docker 기반 Worker scale-out
- Retry backoff 및 DLQ 처리
- Worker heartbeat 및 graceful shutdown
- PostgreSQL 기반 Job event log 저장
- Kafka partition, lag, DLQ, worker 모니터링 UI
- 배치 스케줄 실행 및 실행 이력 관리
- 외부 API client 발급
- HMAC 기반 외부 API token 발급
- 정규화된 주문 데이터 export API

## 설계 포인트

### 1. API와 Worker 분리

Spring Boot API는 인증, 채널 관리, 스케줄 생성, 대시보드, Job 생성처럼 사용자 요청과 화면에 가까운 기능을 담당합니다.

Node.js Worker는 쇼핑몰 API 호출, 주문수집, 뉴스 크롤링, 재시도 처리, 주문 정규화처럼 I/O가 많고 비동기 처리가 필요한 작업을 담당합니다.

이렇게 분리하면 API 서버는 응답성을 유지하고, Worker는 처리량에 맞춰 독립적으로 확장할 수 있습니다.

### 2. Kafka 기반 비동기 처리

주문수집 요청은 `hub_job`에 저장된 뒤 Kafka `hub.jobs` topic으로 발행됩니다. Worker는 Kafka 메시지를 consume하여 실제 쇼핑몰 API 호출을 수행합니다.

동일 사용자/동일 쇼핑몰 계정의 Job은 같은 partition으로 들어가도록 message key를 설계해, 같은 계정에 대한 동시 수집 위험을 줄였습니다.

### 3. 장애를 전제로 한 Job 처리

Worker에는 다음 방어 로직을 적용했습니다.

- 상태 전이 시 `PROCESSING` 조건 확인
- 동일 계정 수집 방지를 위한 DB lock
- `next_retry_at` 기반 retry backoff
- 최대 retry 초과 시 DLQ 발행
- 오래된 `QUEUED`, `PROCESSING` Job을 복구하는 recovery scanner
- 처리 중 Job을 기다리는 graceful shutdown

### 4. 채널별 주문 정규화

쇼핑몰마다 주문 응답 구조가 다르기 때문에, 수집 원본은 먼저 `hub_job_result`에 보존하고 이후 `ORDER_NORMALIZE` Job을 통해 공통 주문 모델로 변환합니다.

정규화 계층은 strategy registry 형태로 구성했습니다.

- `SmartstoreOrderNormalizer` for NAVER / NSS
- `CoupangOrderNormalizer` for COUPANG
- `GiftOrderNormalizer` for GCHAN
- `FlatCommerceOrderNormalizer` for 11ST / GODO
- `GenericOrderNormalizer` as fallback

자세한 내용은 [Order Normalization Pipeline](docs/order-normalization-pipeline.md)을 참고하세요.

## Technology Stack

| Area | Stack |
| --- | --- |
| API | Java 17, Spring Boot 3, MyBatis |
| Frontend | React, Vite, TypeScript |
| Worker | Node.js, TypeScript, KafkaJS |
| Validation | Zod |
| Database | PostgreSQL |
| Messaging | Apache Kafka |
| Logging | pino, PostgreSQL job event log |
| Test | Jest, ts-jest |
| Runtime | Docker Compose |

## 포트폴리오 포인트

이 프로젝트는 대규모 트래픽을 처리한 실서비스라고 표현하기보다는, 실제 업무 문제를 바탕으로 실무형 구조를 적용한 사이드 프로젝트로 설명하는 것이 적절합니다.

- Job queue 설계
- Kafka 기반 비동기 Worker 처리
- 주문번호 기반 idempotent 저장 구조
- Retry / Backoff / DLQ 설계
- 운영 모니터링 대시보드
- 외부 API 인증 구조
- 채널별 Normalizer 전략 패턴
- 장애 상황을 전제로 한 방어적 설계

## 관련 문서

- [Order Normalization Pipeline](docs/order-normalization-pipeline.md)
- [Normalized Order Schema](docs/order-export-normalized-schema.sql)
- [Normalized Mock Data](docs/order-export-normalized-mock-data.sql)
- [External API Client Schema](docs/external-api-client-schema.sql)
