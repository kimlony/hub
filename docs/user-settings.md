# 사용자 환경설정과 주문 Pipeline 분기

## 개요

초기에는 전체 파이프라인 검증을 위해 ORDER_NORMALIZE 성공 후 ERP_APPLY를 자동 생성했습니다. 이번 변경으로 자동 ERP 반영 여부를 사용자 설정으로 분리했으며, 기본값은 운영 안정성을 위해 `false`입니다. `false`일 경우 정규화까지만 수행하고 ERP_APPLY Job은 생성하지 않습니다.

환경설정은 `hub_user_setting`에 사용자별 한 행으로 저장한다.

| 설정 | 기본값 | 의미 |
|---|---:|---|
| `autoErpApply` | `false` | 정규화 성공 후 ERP_APPLY Job과 Outbox 자동 생성 여부 |
| `autoNewsCollect` | `false` | 금융속보 스케줄 자동수집 여부 |

API는 `GET /api/hub/settings`, `PUT /api/hub/settings`이며 로그인 사용자의 userId를 사용한다.

## autoErpApply 흐름

### true

```text
ORDER_COLLECT → ORDER_NORMALIZE → ERP_APPLY → ERP 결과 저장
```

ORDER_NORMALIZE 완료 트랜잭션 안에서 ERP_APPLY child Job과 Outbox PENDING을 기존 방식대로 생성한다.

### false 또는 설정 없음

```text
ORDER_COLLECT → ORDER_NORMALIZE → ERP 반영 대기
```

- ORDER_NORMALIZE는 SUCCESS다.
- ERP_APPLY Job과 Outbox는 생성하지 않는다.
- `ERP_AUTO_APPLY_DISABLED` 정보 로그를 남긴다.
- Pipeline은 ORDER_COLLECT와 ORDER_NORMALIZE까지만 정상 반환한다.
- 수동 ERP 전송 API와 화면은 다음 작업에서 구현한다.

## 환경설정 UI

Sidebar 왼쪽 아래 로그인 사용자 영역을 누르면 환경설정 모달이 열린다. 토글 변경은 즉시 PUT으로 저장한다. ERP 자동 반영을 켤 때는 별도 확인창을 표시한다. 기존 상단 로그아웃 버튼은 모달의 계정 섹션으로 이동했다.

금융속보 화면의 기존 메모리 토글은 제거했다. `autoNewsCollect` 변경 시 기존 CrawlScheduleControlService에 즉시 동기화한다. 뉴스 데이터와 스케줄러가 전역이므로 사용자 중 한 명이라도 ON이면 스케줄러를 활성화하며, 애플리케이션 재시작 시 DB 설정에서 이 상태를 복원한다. 고객사별 뉴스 수집 분리는 후속 과제다.

## 수동 검증

### autoErpApply=false

1. 로그인 후 Sidebar 프로필에서 환경설정을 연다.
2. ERP 자동 반영이 OFF인지 확인하고 주문수집을 실행한다.
3. hub_job에 ORDER_COLLECT와 ORDER_NORMALIZE만 있고 ERP_APPLY가 없는지 확인한다.
4. Pipeline이 ORDER_NORMALIZE를 currentStage로 반환하고 화면에 ERP 반영 대기가 표시되는지 확인한다.

### autoErpApply=true

1. ERP 자동 반영을 ON으로 바꾸고 확인창을 승인한다.
2. 주문수집 후 ERP_APPLY Job과 Outbox가 생성되는지 확인한다.
3. Mock ERP 결과와 3단계 Pipeline이 표시되는지 확인한다.

### 뉴스와 로그아웃

1. 뉴스 자동수집 값을 변경하고 모달을 다시 열어 값이 유지되는지 확인한다.
2. 금융속보 조회와 수동 새로고침이 정상인지 확인한다.
3. 모달 하단 로그아웃으로 로그인 화면에 이동하는지 확인한다.

## TODO

- 수동 ERP 전송 API와 주문 선택 UI
- 고객사별 뉴스 자동수집 분리 정책
- 설정 변경 감사 로그
