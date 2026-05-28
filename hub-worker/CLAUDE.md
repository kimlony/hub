# 비즈비 HUB 프로젝트 - Claude Code 지침

## 최종 아키텍처

```
메인 ERP → Bizbee-DBHub → Worker (REST) → Bizbee-DBHub → Oracle
```

Worker는 HTTP 서버로 동작하며 **수집만** 담당합니다. DB를 직접 다루지 않습니다.

```
DBHub가 POST /collect 호출
Worker: 몰 API 호출 → 결과 반환
DBHub: Oracle 저장 + status 업데이트
```

## 프로젝트 구조

```
bizbee-hub/
  hub-worker/          Node.js + TypeScript (HTTP 서버 + 수집 전담)
  hub-api-erp/         제거 예정 (DBHub로 대체됨)
```

## 기술 스택

### hub-worker (최종)
- Node.js + TypeScript (ESM, .js 확장자로 import)
- Express (HTTP 서버)
- bcryptjs (NSS 인증용)
- fast-xml-parser (11번가 XML 파싱)
- axios
- ※ 제거: kafkajs, pg, oracledb (DBHub가 담당)

### 메인 ERP (참고용)
- Java 8, Spring Boot 2.3.x, MyBatis
- AngularJS 1.x, Oracle DB

---

## 코딩 규칙

### 공통
- 모든 Worker 로그는 반드시 `[requestId]` prefix 포함
  ```typescript
  console.log(`[${message.requestId}] PROCESSING start`);
  ```
- TypeScript 타입 전부 명시 (any 사용 금지)
- import 시 .js 확장자 필수 (ESM)
  ```typescript
  import { saveJobResult } from "../../db/postgres.js";
  ```

### 신규 채널 추가 시 필수 규칙
1. `channels/{channelCd}/` 폴더 생성
2. 파일 4개 생성: `types.ts`, `{Channel}ApiClient.ts`, `{Channel}OracleSaver.ts`, `{Channel}OrderHandler.ts`
3. OracleSaver는 **반드시 파일 전체 주석처리** 상태로 생성
4. consumer.ts에 handler 등록 추가
   ```typescript
   registry.register("ORDER_COLLECT", new {Channel}OrderHandler(), "{CHANNEL_CD}");
   ```
5. **기존 채널 파일(elevenst, gchan, coupang, nfa) 수정 금지**

### Oracle INSERT 규칙
- INSERT 전 반드시 중복 체크
  ```sql
  SELECT COUNT(*) FROM BHUB_ORDER_RAW
  WHERE CORP_CD = :corpCd AND CHANNEL_ORDER_ID = :channelOrderId AND RAW_KEY = :rawKey
  ```
- INSERT_USER_ID = 'HUB_WORKER' 고정
- autoCommit: true
- connection은 finally에서 반드시 close

### PostgreSQL 쿼리 규칙
- tryMarkProcessing: `WHERE status = 'QUEUED'` 조건 필수 (중복 방지)
- retryOrFailJob: retry_count < 3이면 QUEUED 복구, >= 3이면 FAILED

---

## 파일별 역할 (수정 시 주의)

| 파일 | 역할 | 수정 주의사항 |
|------|------|---------------|
| consumer.ts | Kafka 수신 + 공통 처리 흐름 | handler 등록 추가만 |
| recovery.ts | 5분 DB 스캔 복구 | 로직 변경 금지 |
| handlers/HandlerRegistry.ts | jobType:channelCd 라우팅 | 수정 금지 |
| db/postgres.ts | PostgreSQL 쿼리 | 함수 추가는 OK |
| db/oracle.ts | Oracle 연결 | 수정 금지 |

---

## 채널별 authInfo 구조

```typescript
// 11번가 (11ST)
authInfo: { apiKey: string }

// 선물찬스 (GCHAN)
authInfo: { sellerId: string, password: string }

// 쿠팡 (COUPANG)
authInfo: { apiKey: string, secretKey: string, vendorId: string }

// 네이버 스마트스토어 (NSS)
authInfo: { clientId: string, clientSecret: string }
```

---

## 금지사항

- `any` 타입 사용 금지
- `console.log` 에 requestId prefix 없이 사용 금지
- 기존 채널 파일(elevenst/, gchan/, coupang/, nfa/) 내용 수정 금지
- OracleSaver 주석 해제 금지 (Oracle 연결 준비 완료 후 별도 지시)
- `handlers/` 폴더에 handler 로직 직접 작성 금지 (인터페이스/Registry만)
- import 시 .js 확장자 누락 금지

---

## Oracle 테이블 매핑 기준

### BHUB_ORDER_RAW 필수 컬럼 (NOT NULL)
- CORP_CD, RAW_ORDER_ID, RAW_KEY, CHANNEL_ORDER_ID, ORDER_SEQ (default 1)

### RAW_KEY 기준
- GCHAN: String(recipientId)
- 11ST: ordNo (주문번호)
- 기타 채널: 채널의 고유 주문 식별자

---

## 자주 쓰는 패턴

### handler 기본 구조
```typescript
export class {Channel}OrderHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const payload = parsePayload(message.payload);
    const client = new {Channel}ApiClient();
    const orders = await client.fetchOrders(/* ... */);

    console.log(`[${message.requestId}] {CHANNEL} orders collected: ${orders.length}`);

    // await {Channel}OracleSaver.saveAll(orders, payload); // 주석처리 유지

    await saveJobResult(message, {
      corpCd: payload.corpCd,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      frDt: payload.frDt,
      toDt: payload.toDt,
      totalCount: orders.length,
      orders
    });

    console.log(`[${message.requestId}] {CHANNEL} save completed: ${orders.length}`);
  }
}
```

### consumer.ts 등록 위치
```typescript
// 기존 등록 코드 아래에 추가
registry.register("ORDER_COLLECT", new {Channel}OrderHandler(), "{CHANNEL_CD}");
```
