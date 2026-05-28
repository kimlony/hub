# hub-worker

Kafka에서 작업 메시지를 받아 **실제 비즈니스 로직(주문수집 등)을 실행하고 결과를 DB에 저장**하는 서버입니다.
hub-api-erp가 접수·전달을 담당한다면, hub-worker는 실제 일을 하는 역할입니다.

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| Language | Node.js + TypeScript |
| Message Queue | Kafka (kafkajs) |
| DB (HUB) | PostgreSQL (pg) |
| DB (회사) | Oracle (oracledb) |
| HTTP | axios |
| 기타 | dotenv, pino |

---

## 아키텍처

```
Kafka hub.jobs topic
  │
  ▼
consumer.ts (메시지 수신)
  │
  ├── tryMarkProcessing()       QUEUED → PROCESSING (중복 방지)
  │
  ├── HandlerRegistry           jobType으로 handler 라우팅
  │     └── ElevenStOrderHandler
  │           ├── ElevenStApiClient     11번가 API 호출
  │           └── saveJobResult()       PostgreSQL 저장
  │
  ├── succeedJob()              status → SUCCESS
  └── retryOrFailJob()          실패 시 retry 또는 FAILED

recovery.ts (5분마다 DB 스캔)
  └── QUEUED 상태 10분 이상 경과 건 재처리
```

---

## 프로젝트 구조

```
src/
├── index.ts                    진입점 (시작 순서 및 종료 처리)
├── consumer.ts                 Kafka consumer + 공통 처리 흐름
├── recovery.ts                 DB 스캔 복구 로직 (5분 interval)
├── db/
│   ├── postgres.ts             PostgreSQL 연결 및 쿼리
│   └── oracle.ts               Oracle 연결 (환경변수 기반)
├── handlers/
│   ├── IJobHandler.ts          handler 인터페이스
│   └── HandlerRegistry.ts      jobType → handler 라우팅
└── channels/
    └── elevenst/
        ├── types.ts                11번가 타입 정의
        ├── ElevenStApiClient.ts    11번가 Open API 호출
        ├── ElevenStOracleSaver.ts  Oracle INSERT (주석처리 - 연결 준비 후 활성화)
        └── ElevenStOrderHandler.ts IJobHandler 구현체
```

**폴더 설계 원칙**
- `handlers/` : 인터페이스와 Registry만 위치 (비즈니스 로직 없음)
- `channels/` : 쇼핑몰별 비즈니스 로직 전체 (API 호출 + 저장 + 타입)
- 신규 쇼핑몰 추가 시 `channels/` 하위에 폴더만 추가

---

## 시작 순서

서버가 켜지면 아래 순서로 실행됩니다.

```
1. ensurePostgresSchema()
   hub_job_result 테이블이 없으면 자동 생성

2. startRecovery()
   5분마다 DB 스캔 백그라운드 시작

3. startConsumer()
   Kafka 연결 후 메시지 대기
```

---

## 처리 흐름 상세

### 메시지 수신 경로 (두 가지)

| 경로 | 트리거 | 설명 |
|------|--------|------|
| Kafka consumer | 메시지 수신 즉시 | 정상 처리 경로 |
| Recovery 스캔 | 5분마다 자동 실행 | Kafka 발행 실패 등으로 누락된 건 복구 |

두 경로 모두 `processJobMessage()` 하나로 합쳐져 동일한 로직을 수행합니다.

### processJobMessage 처리 흐름

```
1. 로그 출력
   [requestId] PROCESSING start

2. 중복 처리 방지
   UPDATE hub_job SET status='PROCESSING'
   WHERE request_id=? AND status='QUEUED'
   → 0행: 이미 처리중 → skip
   → 1행: 내가 처리 → 계속 진행

3. jobType으로 handler 라우팅
   HandlerRegistry.get(jobType)
   → 등록된 handler 없으면 에러 throw

4. handler.handle(message) 실행

5. 성공 시
   succeedJob() → status = SUCCESS

6. 실패 시
   retryOrFailJob()
   retry_count < 3  → status = QUEUED, retry_count+1 (재시도 대기)
   retry_count >= 3 → status = FAILED (최종 실패)
```

### Retry 흐름

```
1회 실패 → QUEUED (retry_count=1) → recovery 5분 후 재시도
2회 실패 → QUEUED (retry_count=2) → recovery 5분 후 재시도
3회 실패 → FAILED (retry_count=3) → 종료, error_message 저장
```

로그 예시:
```
[abc-123] RETRY (1/3) - Connection timeout
[abc-123] RETRY (2/3) - Connection timeout
[abc-123] FAILED (max retry exceeded) - Connection timeout
```

### Recovery 스캔

```
5분마다 실행:
SELECT * FROM hub_job
WHERE status = 'QUEUED'
  AND created_at < NOW() - INTERVAL '10 minutes'
ORDER BY created_at ASC
LIMIT 50

→ 발견 시: [recovery] stuck job N found
→ processJobMessage()로 재처리 (기존 로직 그대로 재사용)
```

`running` 플래그로 이전 스캔이 완료되지 않으면 다음 interval skip 처리됩니다.

---

## 쇼핑몰 Handler 구조

### IJobHandler 인터페이스

```typescript
interface IJobHandler {
  handle(message: JobHandlerMessage): Promise<void>;
}

type JobHandlerMessage = {
  requestId: string;
  sourceErp: string;
  jobType: string;
  requestKey: string;
  payload: Record<string, unknown>;
}
```

### 현재 등록된 Handler

| jobType | Handler | 설명 |
|---------|---------|------|
| ORDER_COLLECT | ElevenStOrderHandler | 11번가 주문수집 |

### 신규 쇼핑몰 추가 방법

```typescript
// 1. channels/coupang/ 폴더 생성 후 구현
// 2. consumer.ts에 한 줄 추가
registry.register("COUPANG_ORDER", new CoupangOrderHandler());
```

---

## 11번가 주문수집 (ElevenStOrderHandler)

### payload 구조

```json
{
  "corpCd": "회사코드",
  "channelCd": "11ST",
  "channelAccountId": "계정ID",
  "authType": "API_KEY",
  "authInfo": {
    "apiKey": "11번가 Open API KEY"
  },
  "collectDt": "20260512"
}
```

### 처리 흐름

```
1. payload 파싱 및 검증
   필수값 누락 시 에러 throw

2. ElevenStApiClient.fetchOrders(collectDt)
   GET https://api.11st.co.kr/rest/ordservices/orders
   헤더: openapikey: {apiKey}
   파라미터:
     searchStartDtime: 20260512000000
     searchEndDtime:   20260512235959
     searchType: NEW

3. 로그: [requestId] 11ST orders collected: N건

4. Oracle 저장 (현재 주석처리)
   /* await ElevenStOracleSaver.saveAll(orders, payload); */

5. PostgreSQL hub_job_result 저장
   {
     corpCd, channelCd, channelAccountId,
     collectDt, totalCount, orders[]
   }

6. 로그: [requestId] save completed: N건
```

### Oracle 저장 활성화 방법

Oracle 연결 환경변수 설정 후 `ElevenStOrderHandler.ts`에서 주석 해제:

```typescript
// 주석 해제
await ElevenStOracleSaver.saveAll(orders, payload);
```

---

## DB 테이블 구조

### hub_job (PostgreSQL - hub-api-erp와 공유)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| request_id | VARCHAR(36) | UUID |
| status | VARCHAR(30) | QUEUED / PROCESSING / SUCCESS / FAILED |
| retry_count | INT | 재시도 횟수 (Worker가 관리) |
| error_message | VARCHAR(1000) | 실패 시 오류 내용 |

Worker는 이 테이블의 `status`, `retry_count`, `error_message`를 업데이트합니다.

### hub_job_result (PostgreSQL - Worker가 생성)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 자동 증가 |
| request_id | VARCHAR(36) | hub_job 연결 |
| job_type | VARCHAR(100) | 작업 종류 |
| source_erp | VARCHAR(100) | 요청 출처 |
| result_payload | JSONB | 수집된 주문 데이터 전체 |
| saved_at | TIMESTAMP | 저장일시 |

### Oracle (회사 DB - 현재 주석처리)

| 테이블 | 설명 |
|--------|------|
| BHUB_ORDER_RAW | 수집 원본 JSON 그대로 저장 |
| BHUB_ORDER | 파싱된 주문 헤더 |
| BHUB_ORDER_ITEM | 주문 상세 라인 (1주문 N개) |

---

## 트러블슈팅

request_id 하나로 전체 흐름 추적 가능합니다.

| 상태 | 의미 |
|------|------|
| QUEUED, 결과 없음 | Kafka 발행 후 Worker 미수신 → recovery가 재처리 예정 |
| PROCESSING, 결과 없음 | Worker 처리 중 서버 다운 → 재시작 후 recovery가 재처리 |
| FAILED + error_message | 3회 재시도 초과, error_message 확인 |
| SUCCESS, hub_job_result 없음 | PostgreSQL 저장 실패 |
| SUCCESS, Oracle 없음 | Oracle 저장 실패 (활성화 후) |

Worker 로그는 항상 `[requestId]` prefix로 출력되어 특정 요청의 흐름을 필터링할 수 있습니다.

---

## 환경 설정

### .env

```env
# Kafka
KAFKA_CLIENT_ID=hub-worker
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=hub.jobs
KAFKA_GROUP_ID=hub-worker-group

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=hub_db
POSTGRES_USER=hub
POSTGRES_PASSWORD=change-me

# Oracle (활성화 시 설정 필요)
ORACLE_HOST=
ORACLE_PORT=1521
ORACLE_SID=
ORACLE_USER=
ORACLE_PASSWORD=
```

### 실행

```bash
# 개발 (파일 변경 감지 자동 재시작)
npm run dev

# 빌드 후 운영 실행
npm run build
npm start

# 타입 체크
npm run check
```
