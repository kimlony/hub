# ERP 연결 설정과 Mock TokenProvider

## 범위

현재 ERP_APPLY는 실제 ERP 서버를 호출하지 않는다. `hub_erp_connection`에서 연결 설정을 조회하고 Mock TokenProvider로 인증 흐름을 검증한 뒤 MockErpAdapter를 호출한다. 실제 OAuth 또는 ERP 인증 서버 연동은 후속 작업이다.

## ERP 연결 설정

`hub_erp_connection`의 주요 컬럼은 다음과 같다.

| 컬럼 | 용도 |
|---|---|
| `corp_id`, `erp_connection_id` | 고객사 내 ERP 연결 식별자 |
| `erp_type`, `base_url` | ERP 종류와 향후 실제 API 주소 |
| `auth_type` | `NONE` 또는 `TOKEN` |
| `token_url`, `client_id`, `client_secret` | 향후 토큰 발급 설정 |
| `access_token`, `refresh_token`, `token_expires_at` | 현재 토큰과 만료 시각 |
| `is_active` | 비활성 연결의 ERP_APPLY 실행 차단 |

기존 Mock 파이프라인 호환을 위해 고객사마다 `MOCK-{corpId}`, `auth_type=NONE` 연결을 초기화 시 생성한다.

> TODO(security): 운영 환경에서는 `client_secret`, `access_token`, `refresh_token`을 평문으로 저장하면 안 된다. KMS 또는 애플리케이션 암호화와 키 회전 정책을 적용해야 한다.

## TokenProvider 정책

Worker는 ERP_APPLY payload의 `corpId`, `erpConnectionId`로 처리 시점에 연결 설정을 조회한다.

- 연결이 없으면 `ERP_CONNECTION_NOT_FOUND`로 실패한다.
- `is_active=false`이면 `ERP_CONNECTION_INACTIVE`로 실패한다.
- `auth_type=NONE`이면 토큰 없이 Mock Adapter를 호출한다.
- `auth_type=TOKEN`이고 유효한 access token이 있으면 기존 토큰을 재사용한다.
- 토큰이 없거나 `token_expires_at`이 지났으면 `MOCK-TOKEN-{erpConnectionId}-{timestamp}`를 발급한다.
- Mock 토큰 만료 시각은 발급 시각부터 30분이다.
- 새 토큰과 만료 시각은 `hub_erp_connection`에 저장한다.

## 401 재발급과 재시도

`mockAuthFailOnce=true`이면 첫 Adapter 호출이 `ERP_401`로 실패한다. Handler는 토큰을 강제로 재발급하고 같은 ERP_APPLY 처리 안에서 한 번만 다시 호출한다. 두 번째 호출이 성공하면 기존과 동일하게 APPLIED 결과를 저장한다.

`mockAuthFailAlways=true`이면 재발급 후 두 번째 호출도 실패한다. Handler는 더 이상 호출하지 않고 `hub_erp_apply_result`에 `status=FAILED`, `error_code=ERP_401`을 저장한 뒤 예외를 다시 던진다. 이후 처리는 기존 ERP_APPLY retry/DLQ 정책이 담당한다.

## Secret 전달 금지

Kafka ERP_APPLY payload에는 `erpConnectionId`만 전달하며 다음 값은 넣지 않는다.

- `client_secret`
- `access_token`
- `refresh_token`

Worker가 처리 시점에 DB에서 연결 설정을 조회한다. ERP 요청 결과에 저장되는 request payload에도 연결 설정과 토큰을 넣지 않는다.

## 후속 작업

- 실제 ERP별 TokenProvider와 HTTP Adapter 구현
- secret/token 암호화 및 마스킹
- 동시 토큰 갱신 단일화와 fenced update
- refresh token 및 실제 만료 응답 처리
- ERP 연결 설정 관리 API와 권한 정책
