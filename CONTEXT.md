# 비즈비 HUB 프로젝트 컨텍스트 (Cowork용)

## 프로젝트 개요

사방넷을 모티브로 한 쇼핑몰 주문수집 허브 시스템.
메인 ERP에서 요청한 주문수집 작업을 채널별로 분배하고 실제 수집·저장을 담당하는 비동기 처리 플랫폼.

담당자: 기원 (kshkjk8390@bizbee.co.kr) — 주문수집 파트 담당

---

## 기술 스택

### hub-worker (주 작업 프로젝트) — 수집 전담, DB 모름
- Node.js + TypeScript
- Express (HTTP 서버)
- bcryptjs (NSS 인증용)
- fast-xml-parser (11번가 XML 파싱)
- axios
- ※ kafkajs, pg, oracledb 제거 예정
- axios

### 메인 ERP (기존 시스템, 참고용)
- Java 8, Spring Boot 2.3.x
- MyBatis (mapper, mapper.xml 구조)
- AngularJS 1.x (프론트)
- Oracle DB

### 인프라
- PostgreSQL 16 (hub 전용 DB)
- Apache Kafka 3.7.2 (hub.jobs topic, partition 3)
- Oracle RDS (bizbee-oracle-dev, 회사 DB)

---

## 아키텍처 (최종 확정)

### 최종 구조
```
메인 ERP → Bizbee-DBHub → Worker (REST) → Bizbee-DBHub → Oracle
```

### 구성요소 역할
- **Bizbee-DBHub (Java)**: API 수신, PostgreSQL 폴링, Worker REST 호출, Oracle 저장, retry 관리
- **hub-worker (Node.js)**: HTTP 서버, 몰 API 호출, 수집 결과 반환 (DB 모름)
- **Kafka**: 제거
- **hub-api-erp**: 제거 (DBHub로 대체)

### Worker REST API
```
POST /collect
Request:  { requestId, channelCd, authInfo, frDt, toDt }
Response: { requestId, success, orders: [...], totalCount }
```

---

## 전체 흐름

```
① 사용자: ERP에서 채널 선택 + 날짜 설정 → 주문수집 버튼 클릭
② Bizbee-DBHub: API Key 인증 → 중복 확인 → hub_job 저장(QUEUED) → Kafka 발행
③ Kafka: hub.jobs topic으로 전달
④ Worker: 메시지 수신 → channelCd 기반 라우팅 → 쇼핑몰 API 호출 → Oracle 저장
⑤ ERP 화면: BHUB_ORDER_RAW 조회 → 확정 → BHUB_ORDER 저장 → ERP 전송
```

---

## Worker 파일 구조

```
hub-worker/src/
  index.ts                   진입점, SIGINT/SIGTERM 처리
  consumer.ts                Kafka consumer + processJobMessage (공통 흐름)
  recovery.ts                5분마다 DB 스캔, stuck job 복구
  db/
    postgres.ts              PostgreSQL 연결 및 쿼리
    oracle.ts                Oracle 연결 (node-oracledb)
  handlers/
    IJobHandler.ts           handler 인터페이스
    HandlerRegistry.ts       jobType:channelCd → handler 라우팅
  channels/
    elevenst/                11번가
    gchan/                   선물찬스
    coupang/                 쿠팡
    nfa/                     네이버 스마트스토어 (channelCd: NSS)
```

---

## 채널별 인증 방식

| 채널 | channelCd | authType | 인증 방법 | DB 컬럼 |
|------|-----------|----------|-----------|---------|
| 11번가 | 11ST | API_KEY | openapikey 헤더 | AUTH_KEY |
| 선물찬스 | GCHAN | ID_PW | 로그인→accessToken+sellerSeq | SHOP_ID, SHOP_PW |
| 쿠팡 | COUPANG | API_KEY | HMAC-SHA256 서명 | AUTH_KEY, AUTH_KEY2, SHOP_ID2 |
| 네이버 NSS | NSS | ID_PW | BCrypt 서명→Bearer 토큰 | AUTH_KEY, AUTH_KEY2 |

---

## 핵심 설계 결정사항

### requestKey 중복 처리
```
동일 requestKey 요청 시:
  QUEUED/PROCESSING → 진행 중, 기존 job 반환 (중복 차단)
  SUCCESS/FAILED    → 완료됨, 기존 row RESET 후 Kafka 재발행
  없음              → 신규 INSERT + Kafka 발행
```

### 재수집 RESET 방식
- INSERT 아닌 UPDATE (requestKey UNIQUE 제약 때문)
- status=QUEUED, retry_count=0, error_message=NULL로 초기화
- requestId, created_at 등은 유지

### Recovery 로직
- 5분마다 스캔
- QUEUED + 10분 경과 → 누락 job 재처리
- PROCESSING + 30분 경과 → 좀비 job 감지, QUEUED 리셋

### Retry 정책
- 실패 시 retry_count < 3 → QUEUED로 복구
- retry_count >= 3 → 최종 FAILED

### Oracle 저장 원칙
- CHANNEL_ORDER_ID + CORP_CD 기준 중복 체크 후 INSERT
- INSERT_USER_ID = 'HUB_WORKER' 고정

---

## Oracle DB 테이블 구조

```
BHUB_ORDER_RAW   수집 원본 JSON 그대로 보관
BHUB_ORDER       가공된 주문 헤더 (1주문 = 1row)
BHUB_ORDER_ITEM  주문 상세 라인 (1주문 N상품)
BHUB_ORDER_SEND  ERP 전송 이력

※ GCHAN: recipientId 1개 = 상품 1개 (1:1:1 구조)
※ 11ST:  ordNo 1개 + items[] N개 (1:1:N 구조)
```

---

## PostgreSQL 테이블

```
hub_job
  request_id     VARCHAR(36) UNIQUE
  request_key    VARCHAR(150) UNIQUE
  status         QUEUED / PROCESSING / SUCCESS / FAILED
  payload        JSON (채널별 authInfo 포함)
  retry_count    INT
  error_message  VARCHAR(1000)
  completed_at   TIMESTAMP (SUCCESS/FAILED 시 기록)
  created_at / updated_at

hub_job_result
  request_id     (hub_job 연결)
  result_payload JSONB (수집된 주문 데이터 전체)
  oracle_saved_yn CHAR(1) DEFAULT '0'
  saved_at
```

---

## ERP 화면 흐름 (설계 완료)

```
주문수집 화면  BHUB_ORDER_RAW 그리드 → 체크 → 확정 버튼
                → BHUB_ORDER INSERT (ERP_IF_YN='0')

주문관리 화면  BHUB_ORDER 조회 → ERP전송 여부 표시

ERP전송        메인 ERP 주문 테이블 INSERT → ERP_IF_YN='1'
ERP전송관리    BHUB_ORDER_SEND 이력 조회
```

---

## Oracle DB 접속 정보 (개발)

```
HOST: bizbee-oracle-dev.cnwsyiwsqdaa.ap-northeast-2.rds.amazonaws.com
PORT: 1521
SID:  ORCL
USER: vmerp
```

---

## 현재 구현 상태

### 완료
- hub-worker: Kafka consumer, recovery, retry, channelCd 라우팅
- 11번가 handler: XML 파싱, Oracle 저장
- 선물찬스 handler: 로그인→주문조회, BHUB_ORDER_RAW 저장 완료
- 쿠팡 handler: 구현 완료 (Oracle 주석처리)
- 네이버(NSS) handler: BCrypt 인증 + 주문조회 구현
- Oracle 연결 확인 (dev RDS)
- GCHAN end-to-end 검증 완료

### 진행 중
- Bizbee-DBHub 전환 (hub-api-erp 대체)

### 예정
- BHUB_ORDER, BHUB_ORDER_ITEM 저장 로직
- 복지찬스 채널 (API 명세 요청 중)
- requestKey RESET 로직 적용
- 메인 ERP 주문수집 화면 연동
