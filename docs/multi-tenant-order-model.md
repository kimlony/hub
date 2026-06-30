# Multi-tenant Order Model

## 목적

Easy Hub는 B2B 서비스이므로 사용자 개인이 아니라 회사가 주문 데이터의 소유자가 됩니다. 같은 회사 사용자는 회사의 채널 계정을 공유하고, 다른 회사의 주문은 조회와 저장 단계에서 분리합니다.

## 데이터 관계

```text
hub_corp
  ├─ users
  └─ user_malls (channel account)
       └─ hub_collected_order
            ├─ hub_collected_order_item
            └─ hub_collected_order_delivery
```

| 식별자 | 역할 |
| --- | --- |
| `corp_id` | 회사 단위 데이터 소유권과 조회 범위 |
| `channel_account_id` | 외부 쇼핑몰 판매자 계정 식별자 (`user_malls.id`) |
| `user_id` | 수집을 요청하거나 계정을 등록한 사용자 추적 |
| `channel_order_id` | 외부 쇼핑몰이 발급한 주문번호 |

## 주문 유일성

주문 Upsert 기준은 다음과 같습니다.

```text
channel_account_id + channel_order_id
```

같은 판매자 계정에서 같은 주문번호가 다시 수집되면 기존 주문의 상태와 금액을 갱신합니다. 같은 채널의 동일한 주문번호라도 판매자 계정이 다르면 별도 주문으로 저장합니다.

```sql
CREATE UNIQUE INDEX uidx_hub_collected_order_account_order
ON hub_collected_order(channel_account_id, channel_order_id);
```

## 수집 요청 흐름

1. 로그인 사용자로 `corp_id`를 결정합니다.
2. 사용자가 선택한 `channelAccountId`가 로그인 사용자의 회사에 속하는지 검증합니다.
3. Job payload에 `userId`, `corpId`, `channelAccountId`, `mallKey`를 저장합니다.
4. Outbox와 Kafka 파티션 키는 `channelAccountId`를 기준으로 생성합니다.
5. Worker는 `corpId + channelAccountId`로 자격증명을 조회합니다.
6. Normalizer는 공통 주문 모델에 회사와 채널 계정 식별자를 포함해 Upsert합니다.

기존 클라이언트가 `mallKeys`만 보내는 방식도 호환됩니다. 이 경우 해당 회사에서 활성화된 동일 채널의 모든 판매자 계정에 대해 Job을 생성합니다. 새 화면은 `channelAccountIds`를 직접 전송합니다.

## 채널 계정 삭제

수집된 주문은 `channel_account_id`를 참조하므로 채널 계정을 물리 삭제하지 않습니다. 화면의 삭제 동작은 `use_yn = 'N'`으로 변경하는 소프트 삭제입니다. 기존 주문과 감사 추적 정보는 보존됩니다.

## 기존 데이터 마이그레이션

애플리케이션 시작 시 다음 작업을 수행합니다.

1. `hub_corp`를 생성합니다.
2. 회사 정보가 없는 기존 사용자마다 `LEGACY-{userId}` 회사를 생성합니다.
3. `user_malls`에 `id`, `corp_id`, `account_name`을 추가합니다.
4. 기존 주문의 `user_id + mall_key`를 이용해 `corp_id`와 `channel_account_id`를 역채움합니다.
5. 기존 `(channel_cd, channel_order_id)` 유일 인덱스를 새 계정 단위 인덱스로 교체합니다.

기존 사용자들이 실제로 같은 회사 소속인지 시스템이 자동 판단할 수 없으므로 최초 마이그레이션에서는 사용자별 회사로 분리합니다. 같은 회사 사용자를 합칠 때는 사용자, 채널 계정, 기존 주문의 `corp_id`를 하나의 트랜잭션에서 함께 변경해야 합니다.

## 보안 원칙

- 요청 body의 `corpId`를 회사 권한 판단에 사용하지 않습니다.
- 로그인 사용자에서 조회한 `corp_id`와 채널 계정의 `corp_id`가 일치해야 합니다.
- 주문 조회는 요청 사용자의 `user_id`가 아니라 소속 `corp_id`를 기준으로 수행합니다.
- 채널 자격증명은 `corp_id + channel_account_id`로 제한해 다른 회사 계정 접근을 막습니다.

