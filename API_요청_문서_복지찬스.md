# 복지찬스 주문수집 API 요청 명세서

## 1. 배경

비즈비 HUB 시스템에서 복지찬스 주문 데이터를 수집하여 ERP에 연동하기 위한 API가 필요합니다.
자회사 간 내부 연동이므로 **API Key (Secret Key) 방식**으로 간단하게 인증하는 것을 요청합니다.
(결제나 민감한 데이터 처리가 없는 주문 조회 전용 API이므로 단순 키 방식으로 충분합니다)

---

## 2. 인증 방식 요청

### Secret Key 방식 (권장)

로그인 → 토큰 발급 과정 없이, 발급된 **Secret Key 하나**를 요청 헤더에 포함하는 방식입니다.

```
GET /api/orders
X-Secret-Key: {발급된 Secret Key}
```

또는

```
GET /api/orders
Authorization: {발급된 Secret Key}
```

**장점**
- 구현이 단순하고 관리가 쉬움
- 토큰 만료/갱신 로직 불필요
- 자회사 내부 연동에 적합

**관리 방법**
- Secret Key는 복지찬스에서 발급하여 HUB 시스템 DB에 암호화 저장
- 필요 시 키 재발급으로 교체 가능

---

## 3. 필요한 API

### 주문 목록 조회 (일자별)

```
GET /api/orders  (또는 동등한 엔드포인트)
```

**요청 헤더**

```
X-Secret-Key: {Secret Key}
Content-Type: application/json
```

**요청 파라미터**

| 파라미터 | 타입   | 필수 | 설명 |
|---------|--------|------|------|
| startAt | String | Y    | 조회 시작일 (YYYY-MM-DD) |
| endAt   | String | Y    | 조회 종료일 (YYYY-MM-DD) |
| page    | int    | N    | 페이지 번호 (기본값: 1) |
| size    | int    | N    | 페이지당 건수 (기본값: 20, 최대 100) |

**응답 형식 (권장)**

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "orderCode":       "주문번호 (고유값, 필수)",
        "orderedAt":       "주문일시 (yyyy-MM-dd HH:mm:ss)",
        "orderStatus":     "주문상태 코드",
        "buyerName":       "구매자명",
        "buyerPhone":      "구매자 연락처",
        "receiverName":    "수령자명",
        "receiverPhone":   "수령자 연락처",
        "receiverAddress": "수령자 주소",
        "zipCode":         "우편번호",
        "deliveryMemo":    "배송메모",
        "productId":       "상품ID",
        "productName":     "상품명",
        "optionName":      "옵션명 (없으면 빈 문자열)",
        "quantity":        1,
        "orderPrice":      10000,
        "totalPrice":      10000
      }
    ],
    "page":       1,
    "size":       20,
    "total":      100,
    "totalPages": 5
  }
}
```

---

## 4. 요청 사항

### 4-1. 주문 고유 식별자

- 각 주문을 **유일하게 식별**할 수 있는 `orderCode` (또는 동등한 필드)가 반드시 필요합니다
- 동일 주문을 여러 번 수집해도 중복 저장이 되지 않도록 이 값을 기준으로 처리합니다

### 4-2. 날짜 조회 기준

- 어떤 날짜 기준으로 조회할지 확정 필요
  - 주문일시 기준 / 결제일시 기준 / 상태변경일 기준 중 선택
- 하루 단위 조회 시 데이터 누락이 없어야 합니다

### 4-3. 주문 상태값

- 수집 대상 주문 상태 코드 목록 제공 부탁드립니다
  - 예: `PAID`(결제완료), `PREPARING`(준비중), `SHIPPED`(배송중) 등
- 현재 다른 채널은 **결제 완료 이후** 주문을 수집하는 방식으로 운영 중

### 4-4. 페이징

- 대량 데이터 처리를 위해 페이징 지원이 필요합니다
- `totalPages` 또는 `nextToken` 방식 모두 가능

---

## 5. 연동 흐름

```
메인 ERP (주문수집 버튼 클릭)
    ↓
HUB API - 작업 등록
    ↓
HUB Worker - 실제 API 호출
    1. Secret Key를 헤더에 포함하여 주문 목록 조회
    2. 페이징 처리하여 전체 데이터 수집
    3. Oracle DB 저장 (BHUB_ORDER_RAW)
    ↓
메인 ERP - Oracle DB 조회하여 화면 표시
```

---

## 6. 협의 필요 사항 체크리스트

- [ ] Base URL 확정 (개발서버 / 운영서버 분리 여부)
- [ ] Secret Key 발급 (테스트용 1개 요청)
- [ ] Secret Key 헤더명 확정 (`X-Secret-Key`, `Authorization` 등)
- [ ] 주문 조회 기준 날짜 필드 확정
- [ ] 수집 대상 주문 상태값 코드 목록 제공
- [ ] 페이지당 최대 조회 건수 확정
- [ ] IP 화이트리스트 등록 필요 여부
- [ ] API 응답 샘플 데이터 제공

---

## 7. 문의

기원 (kshkjk8390@bizbee.co.kr)
