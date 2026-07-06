# 사용자 환경설정과 Pipeline 분기

## 1. 목적

사용자 환경설정은 주문 정규화 이후 ERP 반영 여부와 금융속보 자동수집 여부를 운영자가 직접 제어하기 위한 기능이다. 기본값은 안전한 방향으로 모두 `false`이며, 설정이 없거나 조회되지 않는 경우에도 OFF로 처리한다.

환경설정은 Job payload에 복제하지 않는다. Worker가 실제 처리 시점에 DB의 최신 설정을 조회한다.

## 2. 저장 구조

테이블: `hub_user_setting`

| 컬럼 | 의미 |
|---|---|
| `user_id` | 사용자 ID. 사용자별 한 행이며 PK/FK이다. |
| `auto_erp_apply` | ORDER_NORMALIZE 성공 후 ERP_APPLY 자동 생성 여부 |
| `auto_news_collect` | 금융속보 자동수집 활성 여부 |
| `created_at` | 최초 생성 시각 |
| `updated_at` | 마지막 변경 시각 |

기본값:

| API 필드 | DB 컬럼 | 기본값 |
|---|---|---:|
| `autoErpApply` | `auto_erp_apply` | `false` |
| `autoNewsCollect` | `auto_news_collect` | `false` |

설정 행이 없는 기존 사용자가 GET을 호출하면 기본 행을 생성한다. Worker 조회에서는 행이 없더라도 `false`로 판단한다.

## 3. API 계약

### GET `/api/hub/settings`

로그인 사용자의 설정을 조회한다. userId를 요청 파라미터로 받지 않고 인증 principal의 username으로 사용자를 찾는다.

응답 예시:

```json
{
  "autoErpApply": false,
  "autoNewsCollect": false
}
```

### PUT `/api/hub/settings`

두 설정을 한 번에 저장한다.

```json
{
  "autoErpApply": true,
  "autoNewsCollect": false
}
```

필드가 누락되면 400으로 처리한다. 향후 설정 항목이 늘어나면 전체 PUT 대신 PATCH 또는 설정별 command API를 검토한다.

## 4. 자동 ERP 반영 분기

### ON

```text
ORDER_COLLECT
  → ORDER_NORMALIZE
  → ERP_APPLY child Job + hub_job_outbox PENDING
  → Outbox Publisher
  → Kafka
  → ERP_APPLY Worker
  → hub_erp_apply_result
```

ORDER_NORMALIZE 완료 트랜잭션 안에서 다음 작업을 함께 처리한다.

1. 정규화 주문 upsert
2. ORDER_NORMALIZE SUCCESS
3. ERP_APPLY child Job 생성
4. ERP_APPLY Outbox PENDING 생성

### OFF 또는 설정 없음

```text
ORDER_COLLECT
  → ORDER_NORMALIZE
  → 정규화 완료 / ERP 전송 대기
```

- ORDER_NORMALIZE는 SUCCESS다.
- ERP_APPLY Job과 Outbox는 생성하지 않는다.
- `ERP_AUTO_APPLY_DISABLED` INFO 로그를 남긴다.
- Pipeline의 `currentStage`는 ORDER_NORMALIZE가 된다.
- 정규화 데이터는 유지되므로 향후 수동 ERP 전송은 수집 API를 다시 호출하지 않고 ERP_APPLY부터 시작할 수 있다.

### 적용 시점

설정값은 ORDER_NORMALIZE 처리 시점에 조회한다. 이미 ERP_APPLY Job과 Outbox가 생성된 이후 토글을 OFF로 바꿔도 기존 Job은 취소되지 않는다. 토글 변경 이후 처리되는 새로운 Normalize부터 적용된다.

## 5. 금융속보 자동수집

- `autoNewsCollect=true`인 사용자가 한 명이라도 있으면 전역 Crawl 스케줄을 활성화한다.
- 모든 사용자가 OFF이면 전역 스케줄을 비활성화한다.
- 애플리케이션 시작 시 DB 설정을 읽어 스케줄 상태를 복원한다.
- 뉴스 데이터와 스케줄러가 현재 전역 자원이므로 고객사별 독립 스케줄은 지원하지 않는다.

향후 고객사별 뉴스 수집이 필요하면 전역 boolean이 아니라 tenant별 schedule row와 resource lock으로 분리해야 한다.

## 6. UI 동작

- Sidebar 하단 사용자 영역에서 환경설정 모달을 연다.
- 토글 변경은 PUT API로 즉시 저장한다.
- ERP 자동 반영을 OFF에서 ON으로 변경할 때 확인창을 표시한다.
- 저장 중에는 토글을 비활성화하고 실패 시 이전 값으로 되돌린다.
- 로그아웃은 설정 모달에서 제공한다.
- 공통 API 호출이 401 또는 403을 받으면 localStorage 인증정보를 삭제하고 `/login`으로 이동한다.

현재 UI 인증은 쿠키 세션이 아니라 localStorage JWT를 사용한다. `ProtectedRoute`는 토큰 존재 여부를 확인하고, 서버 유효성은 보호 API 응답으로 확인한다. 향후 앱 시작 시 `/api/auth/me` 검증과 명시적 백엔드 401 AuthenticationEntryPoint를 추가하는 것이 권장된다.

## 7. Docker 배포 시 주의사항

설정 분기 코드는 Worker에서 실행된다. 컨테이너만 재생성하고 구버전 이미지를 사용하면 DB 설정이 false여도 이전 코드가 ERP_APPLY를 생성할 수 있다.

최신 Worker 반영이 의심될 때:

```bash
docker compose build --no-cache hub-worker-consumer hub-worker-recovery hub-worker-http
docker compose up -d --force-recreate hub-worker-consumer hub-worker-recovery hub-worker-http
```

컨테이너 내부 확인 예시:

```bash
docker exec <consumer-container> sh -lc \
  "grep -n 'auto_erp_apply\|ERP_AUTO_APPLY_DISABLED' /app/dist/db/postgres.js /app/dist/consumer.js"
```

재빌드 이후 새 수집 건으로 확인해야 한다. 이미 생성된 ERP_APPLY는 과거 실행 이력이므로 자동으로 삭제되지 않는다.

## 8. 수동 검증 체크리스트

### 자동 ERP OFF

1. 환경설정에서 ERP 자동 반영을 OFF로 저장한다.
2. DB에서 `hub_user_setting.auto_erp_apply=false`를 확인한다.
3. 주문이 있는 채널을 새로 수집한다.
4. ORDER_COLLECT와 ORDER_NORMALIZE가 SUCCESS인지 확인한다.
5. 같은 correlationId에 ERP_APPLY가 없는지 확인한다.
6. Normalize 로그에 `ERP_AUTO_APPLY_DISABLED`가 있는지 확인한다.
7. ERP 결과 화면에 “ERP_APPLY Job이 아직 생성되지 않았습니다” 안내가 표시되는지 확인한다.

### 자동 ERP ON

1. ERP 자동 반영을 ON으로 바꾸고 확인창을 승인한다.
2. 주문수집 후 ERP_APPLY child Job과 Outbox PENDING이 생성되는지 확인한다.
3. Outbox SENT 이후 ERP_APPLY Worker가 처리하는지 확인한다.
4. `hub_erp_apply_result`에 APPLIED 또는 FAILED 결과가 저장되는지 확인한다.

### 주문 0건

`hub_job_result`은 수집 메타데이터 때문에 저장될 수 있다. 실제 `orders` 배열이 0건이면 ORDER_NORMALIZE를 만들지 않는 것이 정상이다. Job 로그의 `ORDERS_COLLECTED.orderCount`를 먼저 확인한다.

### 인증 만료

1. localStorage의 `hub_token`을 제거하거나 유효하지 않은 값으로 변경한다.
2. 보호 화면에서 API 호출을 발생시킨다.
3. 401/403 응답 후 로그인 화면으로 이동하는지 확인한다.

## 9. 테스트 기준

- 설정이 없는 사용자 GET 시 기본값 false
- PUT 후 동일 사용자 행이 하나만 유지되는지
- 자동 ERP OFF 시 ERP_APPLY child/Outbox 미생성
- 자동 ERP ON 시 child/Outbox 원자 생성
- Pipeline에 ERP_APPLY가 없어도 정상 응답
- 뉴스 자동수집 aggregate 정책
- 401/403 공통 로그인 이동

## 10. 후속 과제

- 정규화 주문 수동 ERP 전송 API와 주문 선택 UI
- 고객사별 뉴스 스케줄 분리
- 설정 변경 감사 로그
- 앱 시작 시 JWT 검증 API
- 로그아웃 버튼의 Sidebar 직접 노출 여부 검토