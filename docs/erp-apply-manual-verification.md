# ERP_APPLY 조회 API 수동 검증 가이드

## 목적

`GET /api/hub/erp/apply-results`, `GET /api/hub/erp/apply-results/{id}`, `GET /api/hub/jobs/{requestId}/pipeline` 세 API를 로컬 환경에서 curl로 직접 호출해 확인하는 방법을 정리한다. 자동화된 검증은 `hub-api-erp/src/test/java/hub/erp/controller/ErpApplyResultControllerTest.java`와 `hub-api-erp/src/test/java/hub/job/controller/JobPipelineControllerTest.java`(컨트롤러 레벨), `hub-api-erp/src/test/java/hub/erp/ErpApplyResultServiceImplTest.java`, `hub-api-erp/src/test/java/hub/job/JobPipelineServiceImplTest.java`(서비스 레벨)에서 수행하며, 이 문서는 실제 DB 데이터를 기준으로 한 수동 확인용이다.

로컬 API 서버는 기본적으로 `http://localhost:3000`에서 실행된다 ([hub-api-erp/README.md](../hub-api-erp/README.md) 참고).

## 1. ERP 반영 결과 목록 조회

```bash
curl -s "http://localhost:3000/api/hub/erp/apply-results?corpId=1&status=FAILED&page=1&size=20"
```

주요 조건을 조합할 수도 있다.

```bash
curl -s "http://localhost:3000/api/hub/erp/apply-results?corpId=1&correlationId=corr-1&erpConnectionId=MOCK-1&operation=CREATE&fromDate=2026-07-01T00:00:00&toDate=2026-07-02T00:00:00"
```

`corpId`는 필수 파라미터다. 생략하면 400이 반환된다.

```bash
curl -s -i "http://localhost:3000/api/hub/erp/apply-results"
```

```json
{ "status": 400, "error": "Bad Request", "message": "Required request parameter 'corpId' (Long) is missing", "parameterName": "corpId", "requiredType": "Long" }
```

## 2. ERP 반영 결과 단건 조회

```bash
curl -s "http://localhost:3000/api/hub/erp/apply-results/12?corpId=1"
```

응답에는 목록 필드 외에 `requestPayload`, `responsePayload` 원문과 `payloadSummary`(byte 크기)가 포함된다.

존재하지 않는 id를 조회하면:

```bash
curl -s -i "http://localhost:3000/api/hub/erp/apply-results/999999?corpId=1"
```

```json
{ "status": 404, "error": "Not Found", "message": "ERP apply result not found for id: 999999" }
```

## 3. Job pipeline 조회

```bash
curl -s "http://localhost:3000/api/hub/jobs/{requestId}/pipeline?corpId=1"
```

`requestId`는 `ORDER_COLLECT`, `ORDER_NORMALIZE`, `ERP_APPLY` 중 어느 단계의 request_id를 넣어도 같은 correlationId 체인 전체가 조회된다.

### 실패한 ERP_APPLY를 확인하는 예시 응답

```json
{
  "correlationId": "corr-1",
  "rootJobId": "collect-1",
  "currentStage": "ERP_APPLY",
  "failedStage": "ERP_APPLY",
  "retryable": true,
  "retryFromJobType": "ERP_APPLY",
  "jobs": [
    { "requestId": "collect-1", "jobType": "ORDER_COLLECT", "status": "SUCCESS", "parentJobId": null, "causationId": null, "retryCount": 0, "createdAt": "2026-07-01T09:00:00", "updatedAt": "2026-07-01T09:01:00" },
    { "requestId": "normalize-1", "jobType": "ORDER_NORMALIZE", "status": "SUCCESS", "parentJobId": "collect-1", "causationId": "collect-1", "retryCount": 0, "createdAt": "2026-07-01T09:02:00", "updatedAt": "2026-07-01T09:03:00" },
    { "requestId": "erp-apply-1", "jobType": "ERP_APPLY", "status": "FAILED", "parentJobId": "normalize-1", "causationId": "normalize-1", "retryCount": 3, "createdAt": "2026-07-01T09:04:00", "updatedAt": "2026-07-01T09:10:00" }
  ],
  "erpApplyResults": [
    { "requestId": "erp-apply-1", "normalizedOrderId": 501, "status": "FAILED", "erpDocumentNo": null, "errorCode": "ERP_500", "errorMessage": "Mock ERP apply failed" }
  ]
}
```

존재하지 않는 requestId를 조회하면 `GET /api/hub/erp/apply-results/{id}`와 동일한 형태로 404가 반환된다.

```json
{ "status": 404, "error": "Not Found", "message": "Hub job not found for requestId: missing-1" }
```

`corpId`를 생략하면 목록/단건 조회와 동일하게 400이 반환된다.

```bash
curl -s -i "http://localhost:3000/api/hub/jobs/erp-apply-1/pipeline"
```

```json
{ "status": 400, "error": "Bad Request", "message": "Required request parameter 'corpId' (long) is missing", "parameterName": "corpId", "requiredType": "long" }
```

## 4. currentStage / failedStage / retryable / retryFromJobType 의미

`ORDER_COLLECT(10) -> ORDER_NORMALIZE(20) -> ERP_APPLY(30)` 순서를 기준으로 계산한다 (`hub.job.service.JobPipelineServiceImpl#stageOrder`).

| 필드 | 의미 |
|---|---|
| `currentStage` | 파이프라인이 현재 머물러 있는 단계. `FAILED`가 있으면 그 단계, 없으면 아직 `SUCCESS`가 아닌 단계 중 가장 뒤쪽 단계(모두 SUCCESS면 마지막 단계) |
| `failedStage` | 상태가 `FAILED`인 Job 중 가장 뒤쪽 단계의 jobType. 실패가 없으면 `null` |
| `retryable` | `failedStage`가 존재하면 `true`인 단순 정책. 에러 종류(4xx/5xx, 영구 실패 여부 등)는 아직 반영하지 않는다 |
| `retryFromJobType` | 재시도를 걸어야 할 Job의 jobType. 현재는 `failedStage`와 항상 동일 |

## 5. 주의사항 — corpId 임시 구조

인증/인가(로그인 세션, JWT 기반 tenant 식별)가 이 세 API에는 아직 붙어 있지 않다. 그래서 `corpId`를 요청 쿼리 파라미터로 그대로 받아서 조회 조건에만 사용하고 있으며, **호출자가 다른 corpId 값을 넣으면 다른 회사 데이터도 조회할 수 있는 상태**다. 이는 향후 고객사별 데이터 분리를 위한 최소한의 필터링 장치일 뿐, 접근 제어 수단이 아니다. 인증/인가가 도입되면 `corpId`는 로그인 사용자의 토큰에서 추출하도록 바꿔야 한다.

## 6. 필수 파라미터 누락 처리 (해결됨)

`GlobalExceptionHandler`에 `MissingServletRequestParameterException` 전용 핸들러가 추가되어, `corpId` 등 필수 `@RequestParam`이 누락되면 이제 500이 아니라 **400**이 반환된다. 응답 body에는 기존 `status`/`error`/`message` 구조를 유지한 채 `parameterName`, `requiredType`을 추가로 포함한다. `ErpApplyResultControllerTest#missingRequiredCorpIdReturnsBadRequest`, `JobPipelineControllerTest#missingRequiredCorpIdReturnsBadRequest` 테스트로 고정해 두었다.

## 7. 파라미터 타입 불일치 처리 (해결됨)

`corpId`, `normalizedOrderId`처럼 숫자를 받는 파라미터에 문자열을 넣거나(`page`, `size`도 동일) 타입이 맞지 않으면 `MethodArgumentTypeMismatchException`이 발생한다. `GlobalExceptionHandler`에 전용 핸들러가 추가되어 이제 500이 아니라 **400**이 반환되며, `parameterName`/`rejectedValue`/`requiredType`을 응답에 포함한다.

```bash
curl -s -i "http://localhost:3000/api/hub/erp/apply-results?corpId=abc"
```

```json
{ "status": 400, "error": "Bad Request", "message": "Invalid request parameter 'corpId': value 'abc' cannot be converted to Long", "parameterName": "corpId", "rejectedValue": "abc", "requiredType": "Long" }
```

```bash
curl -s -i "http://localhost:3000/api/hub/erp/apply-results?corpId=1&normalizedOrderId=abc"
curl -s -i "http://localhost:3000/api/hub/erp/apply-results?corpId=1&page=abc"
curl -s -i "http://localhost:3000/api/hub/jobs/erp-apply-1/pipeline?corpId=abc"
```

모두 동일한 형태로 400을 반환하며, `requiredType`은 해당 파라미터의 실제 타입(`Long`, `int`, `long` 등)을 그대로 보여준다. `ErpApplyResultControllerTest#invalidCorpIdTypeReturnsBadRequest`/`invalidNormalizedOrderIdTypeReturnsBadRequest`/`invalidPageTypeReturnsBadRequest`, `JobPipelineControllerTest#invalidCorpIdTypeReturnsBadRequest` 테스트로 고정해 두었다.

## 남은 위험

- `MissingServletRequestParameterException`, `MethodArgumentTypeMismatchException` 두 가지만 처리했다. `@Valid` 바인딩 실패(`BindException`), `ConstraintViolationException` 등 다른 요청 바인딩 예외는 여전히 catch-all `Exception` 핸들러로 떨어져 500이 반환될 수 있다.
- `retryable`이 여전히 "실패 단계 존재 여부"만 보는 단순 정책.
- corpId를 그대로 신뢰하는 임시 구조 — 인증/인가 도입 전까지는 접근 제어 수단이 아님.

## 8. 운영자 UI에서 ERP_APPLY 재처리

1. 운영자 화면의 **ERP 반영 결과** 메뉴로 이동한다.
2. `corpId`를 입력하고 `status=FAILED`로 조회한다.
3. 대상 결과의 **Pipeline** 버튼을 누른다.
4. 상단 요약과 Job 흐름에서 다음 조건을 확인한다.
   - `failedStage = ERP_APPLY`
   - `retryable = YES`
   - `retryFromJobType = ERP_APPLY`
   - ERP_APPLY Job의 `status = FAILED`
5. 조건이 모두 맞으면 **ERP_APPLY 재처리** 버튼이 활성화된다. 버튼을 누르고 확인 창에서 승인한다.
6. UI는 실패한 ERP_APPLY Job의 `requestId`로 `POST /api/hub/jobs/{requestId}/retry`를 호출한다. 이 API는 Kafka에 직접 발행하지 않고 기존 Job을 `QUEUED`로 변경하며 `hub_job_outbox`에 `PENDING` 이벤트를 저장한다.
7. 성공 메시지가 표시된 뒤 ERP 결과 목록과 열린 Pipeline을 다시 조회한다. Pipeline의 ERP_APPLY Job은 `QUEUED`로 보이고 재처리 버튼은 비활성화되어야 한다. Outbox Publisher가 발행하고 Worker가 처리하면 이후 `PROCESSING` 및 `SUCCESS` 또는 다시 `FAILED`로 전환된다.

버튼은 ORDER_COLLECT나 ORDER_NORMALIZE 실패에는 활성화되지 않는다. `retryable=false`, `retryFromJobType`이 ERP_APPLY가 아닌 경우, `failedStage`가 ERP_APPLY가 아닌 경우, ERP_APPLY Job이 FAILED가 아닌 경우에도 비활성화된다.

### 오류 확인

재처리 API가 실패하면 Pipeline 모달 상단에 백엔드 응답의 `message`가 표시된다. 다른 운영자가 먼저 재처리해 상태가 바뀐 경우처럼 FAILED 조건이 더 이상 유효하지 않으면 요청이 거부될 수 있으므로 Pipeline을 다시 열어 최신 상태를 확인한다.

API만 직접 검증하려면 다음 요청을 사용한다.

```bash
curl -s -i -X POST "http://localhost:3000/api/hub/jobs/{erpApplyRequestId}/retry"
```

정상 응답은 HTTP 200이며 body는 없다. 이후 `hub_job.status=QUEUED`와 해당 requestId의 최신 `hub_job_outbox.status=PENDING`을 확인한다.
