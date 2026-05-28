# 채널 관리 기능 설계

**Goal:** 사용자가 쇼핑몰 자격증명을 직접 등록/수정/삭제하고, 활성화된 채널만 주문수집에 사용되도록 한다.

**Architecture:** `user_malls` 테이블에 자격증명 컬럼과 `use_yn`을 추가하고, AES-256으로 암호화 저장한다. 신규 `/api/channels` REST API와 `ChannelManagementModal` 프론트엔드 컴포넌트를 추가한다.

**Tech Stack:** Spring Boot 3.3.5, MyBatis, PostgreSQL, AES-256(javax.crypto), React 18, TypeScript, Tailwind CSS

---

## DB 스키마 변경

```sql
ALTER TABLE user_malls
  ADD COLUMN key      VARCHAR(500),
  ADD COLUMN key2     VARCHAR(500),
  ADD COLUMN auth_key VARCHAR(500),
  ADD COLUMN mall_id  VARCHAR(255),
  ADD COLUMN mall_pw  VARCHAR(500),
  ADD COLUMN use_yn   CHAR(1) NOT NULL DEFAULT 'Y';
```

- `key`, `key2`, `auth_key`, `mall_id`, `mall_pw` — AES-256 암호화 저장
- `use_yn` — `'Y'`(활성) / `'N'`(비활성), DEFAULT `'Y'`
- 기존 시드 데이터(admin 4개 채널)는 자격증명 컬럼 NULL 허용

---

## 지원 채널 목록

코드 Enum으로 관리 (나중에 DB 테이블 승격 가능):

```java
public enum SupportedMall {
    MALL_11ST("11ST", "11번가"),
    COUPANG("COUPANG", "쿠팡"),
    GCHAN("GCHAN", "G마켓/옥션"),
    NSS("NSS", "네이버 스마트스토어");
}
```

---

## AES 암호화

- `application.yml`에 `hub.aes.secret` (32바이트 키) 추가
- `AesEncryptor` Bean: `encrypt(String plainText)` / `decrypt(String cipherText)`
- AES/CBC/PKCS5Padding, IV는 암호문 앞에 prefix로 저장
- DB 저장 시 암호화, 조회 시 복호화 (NULL 컬럼은 그대로 반환)

---

## 백엔드 API

### 신규 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/channels` | 내 채널 전체 목록 (등록/미등록 포함, 자격증명 마스킹) |
| `POST` | `/api/channels/{mallKey}` | 채널 자격증명 등록 |
| `PUT` | `/api/channels/{mallKey}` | 채널 자격증명 수정 |
| `DELETE` | `/api/channels/{mallKey}` | 채널 삭제 |
| `PATCH` | `/api/channels/{mallKey}/active` | use_yn Y↔N 토글 |

### GET /api/channels 응답 형태

지원 채널 전체를 반환하되, 등록 여부와 use_yn 포함:

```json
[
  {
    "mallKey": "11ST",
    "mallName": "11번가",
    "registered": true,
    "useYn": "Y",
    "mallId": "user123",
    "key": "****",
    "key2": null,
    "authKey": "****",
    "mallPw": "****"
  },
  {
    "mallKey": "COUPANG",
    "mallName": "쿠팡",
    "registered": false,
    "useYn": null
  }
]
```

자격증명은 마스킹(`****`)으로 반환 (수정 시 빈칸이면 기존값 유지).

### 기존 API 변경

- `GET /api/auth/me/malls` → `use_yn = 'Y'` 인 채널만 반환 (CollectRequestModal 연동)

### 예외 처리

| 상황 | HTTP |
|------|------|
| 이미 등록된 채널에 POST | 409 Conflict |
| 미등록 채널에 PUT/DELETE/PATCH | 404 Not Found |
| 지원하지 않는 mallKey | 400 Bad Request |
| 복호화 실패 | 500 Internal Server Error |

---

## 백엔드 파일 구조

```
com/bizbee/hub/
├── config/
│   └── AesEncryptor.java          # AES 암호화/복호화 Bean
├── channel/
│   ├── ChannelController.java     # /api/channels
│   ├── ChannelService.java        # interface
│   ├── ChannelServiceImpl.java    # 비즈니스 로직
│   ├── ChannelMapper.java         # MyBatis interface
│   └── dto/
│       ├── ChannelResponse.java   # GET 응답
│       └── ChannelRequest.java    # POST/PUT 요청
resources/
├── mapper/
│   └── ChannelMapper.xml
└── db/
    └── alter-user-malls.sql       # ALTER TABLE 스크립트
```

---

## 프론트엔드

### ChannelManagementModal 컴포넌트

- CollectRequestModal과 동일한 스타일 (createPortal 사용)
- `GET /api/channels` 호출 후 지원 채널 전체 렌더링

**미등록 채널:**
- "등록" 버튼 클릭 시 자격증명 입력 폼 펼쳐짐
- 저장 클릭 시 `POST /api/channels/{mallKey}`

**등록된 채널:**
- `use_yn` 토글 스위치 (Y/N)
- "수정" 버튼 클릭 시 입력 폼 펼쳐짐 (기존값 마스킹)
  - 빈칸으로 저장 시 기존값 유지
- "삭제" 버튼 클릭 시 확인 후 `DELETE /api/channels/{mallKey}`

**입력 폼 필드:**
- `key`, `key2`, `auth_key`, `mall_id` — text 타입
- `mall_pw` — password 타입 (입력값 가림)

### 모달 진입점

Layout 헤더에 "채널 관리" 버튼 추가 → 어느 페이지에서든 접근 가능.

### 파일

```
frontend/src/
├── components/
│   └── ChannelManagementModal.tsx
└── pages/
    (기존 DashboardPage, JobsPage 변경 없음)
```

---

## 데이터 흐름

```
[채널 등록]
사용자 입력 → POST /api/channels/{mallKey}
  → ChannelServiceImpl.register()
  → AesEncryptor.encrypt() 각 자격증명
  → user_malls INSERT (use_yn='Y')

[수집 요청 시]
CollectRequestModal → GET /api/auth/me/malls
  → use_yn='Y' 인 채널만 반환
  → 수집 실행 시 AesEncryptor.decrypt() 후 사용
```
