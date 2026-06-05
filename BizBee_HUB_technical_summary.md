# BizBee HUB 기술 구성 및 설계 의도 정리

작성일: 2026-05-29  
출처: Notion `BizBee HUB - 주문수집 자동화 플랫폼 기획서`

## 1. 프로젝트 개요

BizBee HUB는 여러 쇼핑몰의 주문을 수동으로 수집하던 업무를 자동화하기 위한 주문수집 플랫폼이다. 기존에는 담당자가 채널별 관리자 화면 또는 API를 직접 확인하고 주문을 가져와야 했고, 이 과정에서 누락, 중복, 담당자 부재에 따른 수집 중단 문제가 발생했다.

이 프로젝트의 핵심 목표는 다음과 같다.

- 여러 쇼핑몰 주문수집을 하나의 Hub UI/API에서 실행한다.
- 수집 요청을 Job 단위로 관리하고 실패 시 자동 재시도한다.
- Kafka와 Worker를 이용해 주문수집 처리를 비동기화한다.
- Job 상태, 로그, 결과를 PostgreSQL에 저장해 추적 가능하게 만든다.
- 향후 정산, 운송장 송신 같은 기능을 Worker 플러그인처럼 확장할 수 있게 한다.

## 2. 전체 아키텍처

현재 구조는 Hub API가 메인 서버 역할을 하고, Hub Worker가 실제 쇼핑몰 API 호출을 담당하는 구조다.

```text
사용자 / Hub UI
    |
    v
Hub API (Spring Boot)
    |
    | 1. hub_job 생성
    | 2. Kafka 메시지 발행
    v
Kafka topic: hub.jobs
    |
    v
Hub Worker (Node.js / TypeScript)
    |
    | 1. Kafka 메시지 consume
    | 2. 채널별 handler 라우팅
    | 3. 쇼핑몰 API 호출
    | 4. 결과 저장
    v
PostgreSQL
```

초기 문서에는 Oracle ERP 저장 구조가 포함되어 있었지만, 현재 결정은 Oracle 저장을 제거하고 PostgreSQL 하나로 통일하는 방향이다. Worker는 수집 결과를 `hub_job_result.result_payload` JSONB에 저장하고, Job 상태와 로그도 PostgreSQL에서 관리한다.

## 3. 사용 기술과 선택 의도

### Hub API

| 항목 | 기술 | 사용 의도 |
| --- | --- | --- |
| Backend | Java 17, Spring Boot 3.x | 인증, 채널 관리, Job 생성, Kafka 발행 같은 서버 핵심 로직을 안정적으로 구성하기 위함 |
| Persistence | MyBatis | SQL을 직접 제어하면서 PostgreSQL 테이블 구조와 상태 전이 로직을 명확히 관리하기 위함 |
| Auth | JWT, BCrypt | 사용자 로그인, 토큰 기반 인증, 비밀번호 해시 저장을 위한 기본 인증 체계 |
| Config | Spring profile, environment variables | 로컬/운영 설정과 민감정보를 코드에서 분리하기 위함 |
| Frontend | React, Vite, TypeScript | Hub UI, Job 목록, 로그 보기, 채널 관리 화면을 빠르게 개발하기 위함 |

Hub API는 단순 API 서버가 아니라 프로젝트의 메인 진입점이다. 사용자는 이 화면에서 채널을 등록하고, 주문수집을 요청하고, 처리 결과와 로그를 확인한다.

### Hub Worker

| 항목 | 기술 | 사용 의도 |
| --- | --- | --- |
| Runtime | Node.js | 외부 쇼핑몰 API 호출과 비동기 I/O 처리에 적합 |
| Language | TypeScript | 채널별 payload, API 응답, handler 구조를 타입으로 관리하기 위함 |
| HTTP Client | Axios | 쇼핑몰 API 호출 구현 |
| XML Parser | fast-xml-parser | 11번가, GODO 등 XML 응답을 파싱하기 위함 |
| Logging | pino | JSON 구조화 로그를 남겨 PM2/Docker 환경에서 추적하기 쉽게 하기 위함 |
| Process Manager | PM2 | 로컬 Windows 환경에서 consumer 4개, recovery 1개, http 1개를 쉽게 실행하기 위함 |

Worker는 `ORDER_COLLECT + channelCd` 조합으로 handler를 찾아 실행한다. 현재 구현된 채널은 11번가, 쿠팡, 선물찬스, 네이버 스마트스토어, GODO다.

### Messaging

| 항목 | 기술 | 사용 의도 |
| --- | --- | --- |
| Queue | Apache Kafka | 주문수집 요청을 API 응답 흐름과 분리하고 Worker가 비동기로 처리하게 하기 위함 |
| Topic | `hub.jobs` | Job 메시지 단일 진입점 |
| Partition | 4 partitions | Worker consumer 4개와 맞춰 병렬 처리 기반을 만들기 위함 |
| Message key | `ORDER_COLLECT:{userId}:{mallKey}` | 같은 사용자/같은 쇼핑몰 계정의 요청이 같은 partition으로 들어가 순차 처리될 가능성을 높이기 위함 |

Kafka는 주문수집을 즉시 처리하지 못하더라도 Job을 큐에 쌓고 Worker가 처리할 수 있게 해준다. 다만 Kafka 발행 실패 즉시성은 아직 완전하지 않아, 추후 outbox 또는 publish 결과 대기 방식 검토가 필요하다.

### Database

| 항목 | 기술 | 사용 의도 |
| --- | --- | --- |
| Main DB | PostgreSQL | Job 상태, 채널 인증정보, 수집 결과, 로그를 하나의 DB에서 관리 |
| Result storage | JSONB | 채널마다 다른 주문 응답 구조를 원본에 가깝게 저장하기 위함 |
| Lock | `hub_job_lock` table | 같은 쇼핑몰 계정의 동시 수집을 DB 레벨에서 방지하기 위함 |
| Logs | `hub_job_log` table | PM2 로그와 별개로 화면에서 Job별 이벤트를 추적하기 위함 |

PostgreSQL을 선택한 현재 방향은 개발과 운영 복잡도를 줄이는 쪽에 초점이 있다. Oracle 저장 로직을 제거하면서 Worker의 의존성과 환경변수도 줄어들었다.

### Infrastructure

| 항목 | 기술 | 사용 의도 |
| --- | --- | --- |
| Local infra | Docker Desktop, Docker Compose | PostgreSQL, Kafka 같은 인프라를 로컬에서 쉽게 띄우기 위함 |
| Worker process | PM2 | 현재 로컬 개발 단계에서 Worker 병렬 실행을 빠르게 검증하기 위함 |
| Future direction | Docker scale-out | 집/회사/서버 환경을 더 일관되게 만들기 위해 Worker도 Docker 기반 scale-out으로 전환 검토 |

현재 PM2는 로컬 개발과 실험에 유용하지만, Windows에서 `wmic` 관련 로그 잡음이 있고 환경 일관성이 떨어질 수 있다. 장기적으로는 Docker Compose에서 `hub-worker-consumer`를 scale하는 방식이 더 적합하다.

## 4. 핵심 기능 흐름

### 주문수집 요청 흐름

1. 사용자가 Hub UI에서 쇼핑몰 채널과 날짜 범위를 선택한다.
2. Hub API가 사용자별 활성 채널인지 확인한다.
3. `hub_job`에 `QUEUED` 상태로 Job을 저장한다.
4. Kafka `hub.jobs` topic에 Job 메시지를 발행한다.
5. Worker consumer가 메시지를 수신한다.
6. Worker가 `userId + mallKey` 기준으로 최신 채널 인증정보를 조회하고 복호화한다.
7. Worker가 DB lock을 획득한다.
8. 채널별 handler가 쇼핑몰 API를 호출한다.
9. 결과를 `hub_job_result`에 저장한다.
10. Job 상태를 `SUCCESS`로 변경한다.

### 실패 / 재시도 / 복구 흐름

- Worker 처리 중 오류가 나면 `retry_count`를 증가시키고 Job을 다시 `QUEUED`로 돌린다.
- 최대 retry 횟수는 3회다.
- `hub-worker-recovery`는 오래된 `QUEUED` Job과 장시간 `PROCESSING` 상태인 Job을 주기적으로 찾아 재처리한다.
- Recovery claim에는 `FOR UPDATE SKIP LOCKED`를 사용해 여러 프로세스가 같은 Job을 동시에 집지 않도록 했다.

## 5. 보안 설계 의도

### 민감정보 저장 방식

쇼핑몰 API key, secret, ID/PW, vendorId 같은 민감정보는 `user_malls`에 AES 암호화해서 저장한다. `hub_job.payload`에는 더 이상 복호화된 인증정보를 저장하지 않는다.

이 구조의 의도는 다음과 같다.

- Job payload에 평문 credential이 남는 위험을 줄인다.
- retry/recovery 시점에 항상 최신 `user_malls` 값을 사용할 수 있다.
- Job 테이블이 유출되더라도 민감정보 노출 가능성을 낮춘다.

### 환경변수 분리

DB password, JWT secret, AES secret, Kafka topic 같은 설정은 `application.yml`에 직접 넣지 않고 환경변수 기반으로 분리했다. 로컬 실행은 `application-local.yml`과 `spring.profiles.active=local` 조합을 사용한다.

## 6. 동시성 / 안정성 설계 의도

### Kafka key

Kafka message key를 `ORDER_COLLECT:{userId}:{mallKey}`로 구성했다. 같은 사용자와 같은 쇼핑몰 계정의 Job은 같은 partition으로 들어갈 가능성이 높아지고, 같은 partition은 하나의 consumer가 순차 처리하므로 동시 호출 위험을 줄일 수 있다.

### DB lock

Kafka key만으로는 모든 상황을 완전히 막을 수 없기 때문에, Worker가 실제 쇼핑몰 API를 호출하기 직전에 `hub_job_lock`을 획득한다.

이 lock의 목적은 다음과 같다.

- 같은 쇼핑몰 계정을 여러 Worker가 동시에 수집하지 못하게 한다.
- 외부 쇼핑몰 API에 과도한 동시 호출이 나가는 것을 방지한다.
- 중복 수집이나 IP 차단 위험을 줄인다.
- Worker가 죽어 lock을 해제하지 못해도 TTL 만료 후 takeover 가능하게 한다.

## 7. 관측성 / 로그 설계 의도

### pino 구조화 로그

Worker는 pino 기반 JSON 로그를 남긴다. 로그에는 `event`, `requestId`, `jobType`, `channelCd`, `mallKey`, `workerInstanceId` 같은 필드를 넣어 어떤 Worker가 어떤 Job을 처리했는지 추적할 수 있게 했다.

민감정보는 logger redaction으로 마스킹한다.

### hub_job_log

PM2 로그는 운영자가 직접 봐야 하는 콘솔 로그에 가깝다. 사용자가 Job 단위로 문제를 확인하려면 DB에 이벤트 로그가 필요하다. 그래서 `hub_job_log` 테이블을 추가했다.

저장하는 대표 이벤트는 다음과 같다.

- Kafka 수신
- Recovery 수신
- Credential 조회 성공
- 상태 전이
- Retry / Failed / Success
- 채널 API 수집 완료
- 결과 저장 완료

Hub UI에서는 Job 목록의 `LOG 보기` 버튼으로 이 로그를 확인한다.

## 8. 채널별 연동 현황

| 채널 | 코드 | 인증/처리 방식 | 상태 |
| --- | --- | --- | --- |
| 11번가 | `11ST` | API Key, XML 응답 파싱 | 구현 |
| 쿠팡 | `COUPANG` | HMAC-SHA256 서명 | 구현 |
| 선물찬스 | `GCHAN` | ID/PW 로그인 후 Access Token 사용 | 구현 |
| 네이버 스마트스토어 | `NSS` | BCrypt 기반 인증 후 Bearer Token 사용 | 구현 |
| GODO | `GODO` | `partner_key`, `key` form-urlencoded POST, XML 응답 파싱 | 1차 구현 |
| 복지찬스 | 미정 | API 명세 협의 중 | 예정 |

GODO는 현재 원본 XML과 generic object 형태의 결과를 저장하는 1차 구현이다. 실제 주문 데이터가 있는 응답 XML 구조를 확인한 뒤 표준 주문 모델로 정규화하는 작업이 남아 있다.

## 9. 현재까지 완료된 주요 리스크 대응

| 리스크 | 대응 상태 | 내용 |
| --- | --- | --- |
| 비활성 채널 수집 | 완료 | `use_yn = 'Y'`인 채널만 수집 대상 |
| Job payload에 평문 credential 저장 | 완료 | payload에서 민감정보 제거 |
| 오래된 credential 재사용 | 대부분 해결 | Worker가 처리 시점에 최신 credential 조회 |
| 상태 전이 경쟁 조건 | 1차 완료 | `PROCESSING` 조건과 rowCount 확인 추가 |
| 동일 계정 동시 수집 | 1차 완료 | Kafka key + DB lock 적용 |
| 결과 저장 추적성 | 1차 완료 | `hub_job_result`, `hub_job_log` 저장 |
| 장애 추적 | 1차 완료 | pino + DB job log + UI log modal |
| Oracle 의존성 | 완료 | PostgreSQL 단일화 결정 및 Worker Oracle 제거 |

## 10. 남은 작업

### 자동화

- 수동 요청 중심에서 스케줄러 기반 자동 수집으로 확장한다.
- `hub_collect_schedule` 같은 스케줄 테이블 설계가 필요하다.
- 스케줄 실행 시 중복 Job 생성 방지 정책을 확정해야 한다.

### Kafka 발행 안정성

- 현재는 Kafka 발행 실패가 API 응답에 즉시 완전히 반영되는 구조가 아니다.
- 단기적으로는 publish 결과를 기다리고 실패 시 Job log/status에 명확히 남긴다.
- 장기적으로는 outbox 패턴을 검토한다.

### Docker 기반 Worker 운영

- 현재 Worker 병렬 처리는 PM2 기반이다.
- Docker Compose에서 consumer를 scale하는 방식으로 전환하면 집/회사/서버 환경을 더 일관되게 만들 수 있다.

### 결과 저장 트랜잭션

- `saveJobResult`와 `succeedJob`은 같은 PostgreSQL을 사용하지만 helper 단위로 분리되어 있다.
- 완전한 원자성을 위해 하나의 transaction boundary로 묶을지 검토가 필요하다.

### 테스트

- Java 테스트 환경 정비가 필요하다.
- API service, mapper, auth, job 생성, Kafka key 생성, Worker 상태 전이에 대한 회귀 테스트가 필요하다.

### UI/UX

- 인증 만료 메시지 한글화가 필요하다.
- Job 로그 화면과 채널별 성공률/실패율 대시보드 개선이 필요하다.
- 일부 문구 인코딩/깨짐 여부를 실제 브라우저 기준으로 확인해야 한다.

## 11. 설계 방향 요약

BizBee HUB의 현재 설계 방향은 단순히 주문수집 API를 호출하는 도구가 아니라, 주문수집을 Job 단위로 안정적으로 관리하는 작은 플랫폼에 가깝다.

핵심 의도는 다음과 같다.

- Hub API는 사용자 요청, 인증, 채널 관리, Job 생성을 담당한다.
- Kafka는 주문수집 요청을 비동기 Job으로 분리한다.
- Worker는 채널별 API 차이를 handler로 캡슐화한다.
- PostgreSQL은 상태, 결과, 로그, lock을 관리하는 중심 저장소가 된다.
- 보안상 credential은 Job payload에 남기지 않고 처리 시점에 조회한다.
- 같은 계정 동시 수집은 Kafka key와 DB lock으로 이중 방어한다.
- pino와 `hub_job_log`로 운영 중 문제를 추적할 수 있게 한다.

이 구조는 아직 가볍지만, 향후 채널 추가, 자동 스케줄링, 정산, 운송장 송신 기능으로 확장할 수 있는 기반을 갖추는 방향으로 설계되어 있다.
