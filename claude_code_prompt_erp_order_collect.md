# ERP 주문수집 ServiceImpl 구현 — Claude Code 프롬프트

## 작업 개요

기존 Node.js hub-worker에서 채널별로 쇼핑몰 API를 호출하던 주문수집 비즈니스 로직을
메인 ERP(Java 8, Spring Boot 2.3.x, MyBatis, Oracle)의 ServiceImpl에 직접 구현한다.

---

## 기술 스택 및 구조 규칙

- Java 8, Spring Boot 2.3.x
- MyBatis (Mapper 인터페이스 + Mapper.xml)
- Oracle DB
- HTTP 호출: `RestTemplate` 사용 (WebClient 사용 금지)
- JSON 파싱: `ObjectMapper` (Jackson, Spring Boot 기본 포함)
- XML 파싱: `DocumentBuilder` (javax.xml, JDK 기본 포함)
- BCrypt: `BCryptPasswordEncoder` (spring-security-crypto, Spring Boot 기본 포함)
- HMAC-SHA256: `javax.crypto.Mac` (JDK 기본 포함)
- 파일 생성 구조: Controller → Service → ServiceImpl → Mapper → Mapper.xml

---

## 인증 정보 조회 (공통)

채널 계정 인증 정보는 Oracle DB `BHUB_CHANNEL_ACCOUNT` 테이블에서 조회한다.
아래 컬럼을 사용한다:

| 컬럼명 | 용도 |
|--------|------|
| CHANNEL_CD | 채널코드 (11ST / GCHAN / COUPANG / NSS) |
| CHANNEL_ACCOUNT_ID | 채널 계정 ID |
| CORP_CD | 회사코드 |
| AUTH_KEY | 주 인증키 (API Key, clientId 등) |
| AUTH_KEY2 | 보조 인증키 (secretKey, clientSecret 등) |
| SHOP_ID | 로그인 ID (GCHAN: sellerId) |
| SHOP_PW | 로그인 PW (GCHAN: password) |
| SHOP_ID2 | 추가 ID (COUPANG: vendorId) |

Mapper 메서드명 예시: `selectChannelAccount(corpCd, channelCd, channelAccountId)`

---

## 구현할 ServiceImpl 메서드

```
collectOrders(String corpCd, String channelCd, String channelAccountId, String frDt, String toDt)
```

- `frDt`, `toDt` 형식: `YYYYMMDD` (예: `20260520`)
- 채널코드(`channelCd`)를 분기하여 채널별 로직 호출
- 수집된 주문을 `BHUB_ORDER_RAW`에 저장 (중복 스킵)
- 11번가(11ST)는 추가로 `BHUB_ORDER`, `BHUB_ORDER_ITEM`에도 저장

---

## 채널별 구현 명세

---

### ① 11번가 (channelCd = "11ST")

**인증:** `AUTH_KEY` = openapikey 헤더값

**API 호출:**
```
GET https://api.11st.co.kr/rest/ordservices/complete/{frDt}0000/{toDt}2359
Header: openapikey: {apiKey}
        Accept: application/xml
응답: XML
```

**XML 파싱 로직:**
- `orders > order` 엘리먼트를 반복
- 같은 `ordNo`의 row가 여러 개 올 수 있음 (ordNo 기준으로 묶어 1주문 N상품 구조로 파싱)
- 주문 필드 매핑:

| XML 필드 | 매핑 |
|----------|------|
| ordNo | channelOrderId |
| ordDt | orderDt |
| ordStlEndDt | payDt |
| ordNm | buyerNm |
| ordPrtblTel (없으면 ordTlphnNo) | buyerTel |
| rcvrNm | receiverNm |
| rcvrPrtblNo (없으면 rcvrTlphn) | receiverTel |
| rcvrBaseAddr | receiverAddr1 |
| rcvrDtlsAddr | receiverAddr2 |
| ordDlvReqCont | delvMsg |
| ordAmt | orderAmt |
| ordPayAmt | payAmt |

- 상품 필드 매핑 (items):

| XML 필드 | 매핑 |
|----------|------|
| ordPrdSeq | channelOrderSeq |
| prdNo | productCd |
| prdNm | productNm |
| slctPrdOptNm | optionNm |
| ordQty | orderQty |
| selPrc | orderPrc |
| ordAmt | orderAmt |
| dlvCst | delvCost |

**DB 저장:**
- `BHUB_ORDER_RAW`: 중복체크 없이 INSERT (주문 전체 JSON을 RAW_DATA_JSON에 저장)
- `BHUB_ORDER`: `CHANNEL_ORDER_ID + CORP_CD` 기준 중복체크 후 INSERT
- `BHUB_ORDER_ITEM`: `BHUB_ORDER` INSERT 성공 시 상품 수만큼 INSERT

**BHUB_ORDER_RAW INSERT 값 (11ST):**
```
RAW_ORDER_ID  = 'ORD' + System.currentTimeMillis() + 랜덤5자
CORP_CD       = corpCd
CHANNEL_CD    = '11ST'
CHANNEL_ACCOUNT_ID = channelAccountId
CHANNEL_ORDER_ID   = ordNo
ORDER_STATUS  = '결제완료'
ORDER_STATUS_CD    = ''
BUYER_NM      = buyerNm
RECEIVE_NAME  = receiverNm
RAW_DATA_JSON = 주문 전체 JSON (CLOB)
ERP_IF_YN     = '0'
PROC_ERR_YN   = '0'
CONFIRM_YN    = '0'
INSERT_DATETIME = SYSDATE
INSERT_USER_ID  = 'HUB_WORKER'
```

**BHUB_ORDER INSERT 값:**
```
ORDER_ID      = 'ORD' + System.currentTimeMillis() + 랜덤5자
CORP_CD       = corpCd
CHANNEL_CD    = '11ST'
CHANNEL_ACCOUNT_ID = channelAccountId
CHANNEL_ORDER_ID   = ordNo
ORDER_DT      = ordDt
PAY_DT        = payDt
ORDER_STATUS_CD    = ''
ORDER_AMT     = orderAmt
PAY_AMT       = payAmt
BUYER_NM      = buyerNm
BUYER_TEL     = buyerTel
RECEIVER_NM   = receiverNm
RECEIVER_TEL  = receiverTel
RECEIVER_ADDR1 = rcvrBaseAddr
RECEIVER_ADDR2 = rcvrDtlsAddr
DELV_MSG      = ordDlvReqCont
ERP_IF_YN     = '0'
USE_YN        = '1'
INSERT_DATETIME = SYSDATE
INSERT_USER_ID  = 'HUB_WORKER'
```

**BHUB_ORDER_ITEM INSERT 값:**
```
ORDER_PRODUCT_ID = 'ORD' + System.currentTimeMillis() + 랜덤5자
CORP_CD          = corpCd
ORDER_ID         = 위에서 INSERT된 BHUB_ORDER의 ORDER_ID
ORDER_LINE_NO    = 1부터 순번
CHANNEL_ORDER_ID = ordNo
CHANNEL_ORDER_SEQ = ordPrdSeq
PRODUCT_CD       = prdNo
PRODUCT_NM       = prdNm
OPTION_NM        = slctPrdOptNm
ORDER_QTY        = ordQty
ORDER_PRC        = selPrc
ORDER_AMT        = ordAmt
DELV_COST        = dlvCst
STATUS_CD        = '결제완료'
ITEM_MAP_YN      = '0'
PROC_ERR_YN      = '0'
INSERT_DATETIME  = SYSDATE
INSERT_USER_ID   = 'HUB_WORKER'
```

---

### ② 선물찬스 (channelCd = "GCHAN")

**인증:** `SHOP_ID` = sellerId, `SHOP_PW` = password (로그인 후 accessToken + sellerSeq 취득)

**Step 1 — 로그인:**
```
POST https://sellerapidev.schancedev.co.kr/api/seller/auth/login
Body (JSON): { "sellerId": "...", "password": "..." }
응답: { "data": { "accessToken": "...", "sellerSeq": 123 } }
```

**Step 2 — 주문 목록 페이징 조회 (전체 수집):**
```
GET /api/seller/sales/order/giftchance/recipients
Header: Authorization: Bearer {accessToken}
        Cookie: sellerSeq={sellerSeq}
Params:
  startAt = frDt를 YYYY-MM-DD로 변환 (YYYYMMDD → YYYY-MM-DD)
  endAt   = toDt를 YYYY-MM-DD로 변환
  page    = 1부터 시작, 전체 페이지 반복
  size    = 100
  receivedStatus = RECEIVED
응답: { "data": { "list": [...], "totalPages": N } }
```

※ `paymentStatus=PAID` 파라미터는 절대 사용하지 말 것 (서버 버그로 DB 오류 발생)

**응답 필드 매핑:**

| 응답 필드 | 의미 |
|-----------|------|
| recipientId | RAW_KEY (중복 체크 키) |
| orderCode | CHANNEL_ORDER_ID |
| senderFullName | BUYER_NM |
| recipientName | RECEIVE_NAME |
| itemId | PRODUCT_ID |
| productName | ITEM_NAME |
| quantity | SALE_CNT |
| receivedStatus | ORDER_STATUS |

**BHUB_ORDER_RAW 중복 체크:**
```sql
SELECT COUNT(*) FROM BHUB_ORDER_RAW
WHERE CORP_CD = #{corpCd}
  AND CHANNEL_ORDER_ID = #{orderCode}
  AND RAW_KEY = #{recipientId}
```
중복이면 스킵, 없으면 INSERT.

**BHUB_ORDER_RAW INSERT 값 (GCHAN):**
```
CORP_CD          = corpCd
RAW_ORDER_ID     = 'ORD' + System.currentTimeMillis() + 랜덤5자
RAW_KEY          = String.valueOf(recipientId)   ← 필수! NULL이면 ORA-01400
ORDER_SEQ        = 1
CHANNEL_CD       = 'GCHAN'
CHANNEL_ACCOUNT_ID = channelAccountId
CHANNEL_ORDER_ID = orderCode
CHANNEL_ORDER_SEQ = String.valueOf(recipientId)
ORDER_STATUS     = receivedStatus
BUYER_NM         = senderFullName
RECEIVE_NAME     = recipientName
PRODUCT_ID       = String.valueOf(itemId)
ITEM_NAME        = productName
SALE_CNT         = quantity
RAW_DATA_JSON    = 주문 행 전체 JSON (CLOB)
ERP_IF_YN        = '0'
PROC_ERR_YN      = '0'
CONFIRM_YN       = '0'
INSERT_DATETIME  = SYSDATE
INSERT_USER_ID   = 'HUB_WORKER'
```

---

### ③ 쿠팡 (channelCd = "COUPANG")

**인증:** `AUTH_KEY` = apiKey, `AUTH_KEY2` = secretKey, `SHOP_ID2` = vendorId

**HMAC-SHA256 서명 생성 로직:**
```java
// 1. datetime 생성 (UTC 기준, 형식: YYMMDDTHHmmssZ)
// 예: "260520T143022Z"
String datetime = new SimpleDateFormat("yyMMdd'T'HHmmss'Z'")
    {{ setTimeZone(TimeZone.getTimeZone("UTC")); }}
    .format(new Date());

// 2. path
String path = "/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/ordersheets";

// 3. query string 조합
// createdAtFrom={frDt변환}T00:00
// createdAtTo={toDt변환}T23:59
// status=ACCEPT
// searchType=timeFrame
// perPage=100
// (nextToken이 있으면 token={nextToken} 추가)
// URL 인코딩 필요

// 4. 서명 메시지
String message = datetime + "GET" + path + queryString;

// 5. HMAC-SHA256
Mac mac = Mac.getInstance("HmacSHA256");
mac.init(new SecretKeySpec(secretKey.getBytes("UTF-8"), "HmacSHA256"));
String signature = bytesToHex(mac.doFinal(message.getBytes("UTF-8")));

// 6. Authorization 헤더
String authorization = "CEA algorithm=HmacSHA256, access-key=" + apiKey
    + ", signed-date=" + datetime + ", signature=" + signature;
```

**API 호출 (nextToken 페이징):**
```
GET https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/ordersheets?{queryString}
Header: Authorization: {authorization}
        Content-Type: application/json;charset=UTF-8
응답: { "data": [...], "nextToken": "..." or null }
```
`nextToken`이 null 또는 빈 문자열이 될 때까지 반복 호출.

**응답 필드 매핑:**

| 응답 필드 | 의미 |
|-----------|------|
| orderId | CHANNEL_ORDER_ID |
| orderStatus | ORDER_STATUS |
| orderedAt | ORDER_DT |
| receiver.name | RECEIVE_NAME |
| receiver.safeNumber (없으면 receiver.phone) | RECEIVER_TEL |
| receiver.addr1 + addr2 | RECEIVER_ADDR |
| receiver.postCode | ZIP_CODE |
| receiver.deliveryMemo | DELV_MSG |
| totalPrice | ORDER_AMT |
| orderItems[].orderItemId | CHANNEL_ORDER_SEQ |
| orderItems[].productId | PRODUCT_CD |
| orderItems[].sellerProductName | PRODUCT_NM |
| orderItems[].sellerProductItemName | OPTION_NM |
| orderItems[].shippingCount | ORDER_QTY |
| orderItems[].orderPrice | ORDER_PRC |

**BHUB_ORDER_RAW INSERT 값 (COUPANG):**
```
CORP_CD          = corpCd
RAW_ORDER_ID     = 'ORD' + System.currentTimeMillis() + 랜덤5자
RAW_KEY          = String.valueOf(orderId)
ORDER_SEQ        = 1
CHANNEL_CD       = 'COUPANG'
CHANNEL_ACCOUNT_ID = channelAccountId
CHANNEL_ORDER_ID = orderId
ORDER_STATUS     = orderStatus
RECEIVE_NAME     = receiver.name
RAW_DATA_JSON    = 주문 행 전체 JSON (CLOB)
ERP_IF_YN        = '0'
PROC_ERR_YN      = '0'
CONFIRM_YN       = '0'
INSERT_DATETIME  = SYSDATE
INSERT_USER_ID   = 'HUB_WORKER'
```

중복 체크: `CORP_CD + CHANNEL_ORDER_ID + RAW_KEY` 기준.

---

### ④ 네이버 스마트스토어 (channelCd = "NSS")

**인증:** `AUTH_KEY` = clientId, `AUTH_KEY2` = clientSecret

**BCrypt 서명 생성 로직:**
```java
// 1. timestamp (밀리초 문자열)
String timestamp = String.valueOf(System.currentTimeMillis());

// 2. password = clientId + "_" + timestamp
String password = clientId + "_" + timestamp;

// 3. BCrypt: clientSecret을 salt로 사용하여 해싱
//    주의: BCryptPasswordEncoder가 아닌 BCrypt.hashpw() 직접 사용
//    spring-security-crypto의 BCrypt 클래스 사용
String hashedPassword = org.springframework.security.crypto.bcrypt.BCrypt.hashpw(password, clientSecret);

// 4. Base64URL 인코딩 (패딩 없음)
String signature = Base64.getUrlEncoder().withoutPadding()
    .encodeToString(hashedPassword.getBytes("UTF-8"));
```

**Step 1 — 토큰 발급:**
```
POST https://api.commerce.naver.com/external/v1/oauth2/token
Content-Type: application/x-www-form-urlencoded
Body:
  client_id={clientId}
  &timestamp={timestamp}
  &client_secret_sign={signature}
  &grant_type=client_credentials
  &type=SELF
응답: { "access_token": "..." }
```

**Step 2 — 주문 조회 (날짜 범위를 1일씩 분할):**

네이버 API는 최대 24시간 조회 제한이 있으므로 frDt ~ toDt를 **1일씩 반복** 호출한다.

```
GET https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders
Header: Authorization: Bearer {access_token}
Params:
  from   = {yyyy-MM-dd}T00:00:00.000+09:00
  to     = {yyyy-MM-dd}T23:59:59.999+09:00
  rangeType = ORDERED_DATETIME
  fulfillment = true
  productOrderStatuses = PAY_DONE
응답: { "data": { "contents": [...] } }
```

날짜 순회 예시: frDt=20260518, toDt=20260520 → 18일, 19일, 20일 3번 호출, 결과 합산.

**BHUB_ORDER_RAW INSERT 값 (NSS):**
```
CORP_CD          = corpCd
RAW_ORDER_ID     = 'ORD' + System.currentTimeMillis() + 랜덤5자
RAW_KEY          = productOrderId (contents 배열의 고유 주문번호 필드)
ORDER_SEQ        = 1
CHANNEL_CD       = 'NSS'
CHANNEL_ACCOUNT_ID = channelAccountId
CHANNEL_ORDER_ID = productOrderId
ORDER_STATUS     = productOrderStatus (또는 PAY_DONE)
RAW_DATA_JSON    = 주문 행 전체 JSON (CLOB)
ERP_IF_YN        = '0'
PROC_ERR_YN      = '0'
CONFIRM_YN       = '0'
INSERT_DATETIME  = SYSDATE
INSERT_USER_ID   = 'HUB_WORKER'
```

중복 체크: `CORP_CD + CHANNEL_ORDER_ID + RAW_KEY` 기준.

---

## Mapper 메서드 (MyBatis)

아래 Mapper 인터페이스 메서드와 Mapper.xml을 생성한다.

```java
// 채널 계정 조회
BhubChannelAccountDto selectChannelAccount(
    @Param("corpCd") String corpCd,
    @Param("channelCd") String channelCd,
    @Param("channelAccountId") String channelAccountId
);

// BHUB_ORDER_RAW 중복 체크
int countRawOrder(
    @Param("corpCd") String corpCd,
    @Param("channelOrderId") String channelOrderId,
    @Param("rawKey") String rawKey
);

// BHUB_ORDER_RAW INSERT
void insertRawOrder(BhubOrderRawDto dto);

// BHUB_ORDER 중복 체크
int countOrder(
    @Param("corpCd") String corpCd,
    @Param("channelOrderId") String channelOrderId
);

// BHUB_ORDER INSERT
void insertOrder(BhubOrderDto dto);

// BHUB_ORDER_ITEM INSERT
void insertOrderItem(BhubOrderItemDto dto);
```

---

## DTO 클래스

`BhubOrderRawDto`, `BhubOrderDto`, `BhubOrderItemDto`, `BhubChannelAccountDto` 클래스를 생성한다.
각 필드는 위 INSERT 컬럼에 대응하며 `String` 또는 `Integer`/`Long` 타입을 적절히 사용한다.
`RAW_DATA_JSON`은 Oracle CLOB이므로 MyBatis에서 `jdbcType=CLOB`으로 처리한다.

---

## 주의사항

1. `RAW_KEY` 컬럼은 NOT NULL이므로 반드시 값을 세팅할 것 (null이면 ORA-01400)
2. `RAW_DATA_JSON`은 `#{rawDataJson, jdbcType=CLOB}`으로 바인딩
3. ID 생성: `"ORD" + System.currentTimeMillis() + UUID.randomUUID().toString().replace("-","").substring(0,5).toUpperCase()`
4. `INSERT_USER_ID`는 항상 `'HUB_WORKER'` 고정
5. GCHAN은 `receivedStatus=RECEIVED` 필터만 사용, `paymentStatus` 파라미터 절대 사용 금지
6. NSS BCrypt: `BCrypt.hashpw(password, clientSecret)` — clientSecret이 BCrypt salt로 사용됨
7. 11번가는 테스트 API Key 하드코딩이 현재 소스에 있음, ERP 구현 시 DB에서 읽어온 `AUTH_KEY` 사용
8. 모든 HTTP 호출은 try-catch로 감싸고 예외 시 로그 출력 후 `throw new RuntimeException()`

---

## 파일 생성 목록

```
src/main/java/.../
  service/
    BhubOrderCollectService.java          (인터페이스)
  service/impl/
    BhubOrderCollectServiceImpl.java      (핵심 구현체)
  mapper/
    BhubOrderCollectMapper.java           (MyBatis Mapper 인터페이스)
  dto/
    BhubChannelAccountDto.java
    BhubOrderRawDto.java
    BhubOrderDto.java
    BhubOrderItemDto.java

src/main/resources/mapper/
    BhubOrderCollectMapper.xml
```

기존 주문수집 Controller에서 이미 Service를 호출하는 구조가 있다면
`collectOrders(corpCd, channelCd, channelAccountId, frDt, toDt)` 시그니처에 맞게 연결한다.
