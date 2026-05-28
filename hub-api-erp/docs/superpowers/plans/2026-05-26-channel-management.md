# 채널 관리 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 쇼핑몰 자격증명을 등록/수정/삭제/활성화하고, use_yn='Y'인 채널만 수집에 사용되도록 한다.

**Architecture:** `user_malls` 테이블에 자격증명 컬럼(AES-256 암호화)과 `use_yn` 컬럼을 추가한다. 신규 `/api/channels` REST API(GET/POST/PUT/DELETE/PATCH)와 `ChannelManagementModal` React 컴포넌트를 추가한다.

**Tech Stack:** Java 17, Spring Boot 3.3.5, MyBatis, PostgreSQL, javax.crypto(AES-256 빌트인), React 18, TypeScript, Tailwind CSS

---

## 파일 구조

**신규 생성:**
- `src/main/resources/db/alter-user-malls.sql` — ALTER TABLE 스크립트
- `src/main/java/com/bizbee/hub/config/AesProperties.java` — AES 키 설정 바인딩
- `src/main/java/com/bizbee/hub/config/AesEncryptor.java` — 암호화/복호화 Bean
- `src/main/java/com/bizbee/hub/channel/SupportedMall.java` — 지원 채널 Enum
- `src/main/java/com/bizbee/hub/channel/ChannelRow.java` — DB 매핑 엔티티 (암호화 원문)
- `src/main/java/com/bizbee/hub/channel/ChannelMapper.java` — MyBatis 인터페이스
- `src/main/resources/mapper/ChannelMapper.xml` — MyBatis XML
- `src/main/java/com/bizbee/hub/channel/dto/ChannelRequest.java` — POST/PUT 요청 DTO
- `src/main/java/com/bizbee/hub/channel/dto/ChannelResponse.java` — GET 응답 DTO
- `src/main/java/com/bizbee/hub/channel/ChannelService.java` — 서비스 인터페이스
- `src/main/java/com/bizbee/hub/channel/ChannelServiceImpl.java` — 서비스 구현
- `src/main/java/com/bizbee/hub/channel/ChannelController.java` — REST 컨트롤러
- `src/main/java/com/bizbee/hub/channel/ChannelNotFoundException.java` — 404 예외
- `src/main/java/com/bizbee/hub/channel/ChannelConflictException.java` — 409 예외
- `src/main/frontend/src/components/ChannelManagementModal.tsx` — 채널 관리 모달
- `src/test/java/com/bizbee/hub/config/AesEncryptorTest.java` — AES 단위 테스트

**수정:**
- `src/main/resources/application.yml` — `hub.aes.secret` 추가
- `src/main/java/com/bizbee/hub/config/SecurityConfig.java` — `/api/channels/**` authenticated 추가, PATCH 메서드 허용
- `src/main/java/com/bizbee/hub/exception/GlobalExceptionHandler.java` — 채널 예외 핸들러 추가
- `src/main/resources/mapper/UserMapper.xml` — `findMallKeysByUserId` use_yn='Y' 필터 추가
- `src/main/frontend/src/components/Layout.tsx` — "채널 관리" 버튼 + 모달 상태 추가

---

## Task 1: DB 스키마 변경

**Files:**
- Create: `src/main/resources/db/alter-user-malls.sql`
- Modify: `src/main/resources/db/init-auth.sql`

- [ ] **Step 1: ALTER TABLE 스크립트 파일 생성**

`src/main/resources/db/alter-user-malls.sql` 파일을 생성한다:

```sql
ALTER TABLE user_malls
    ADD COLUMN IF NOT EXISTS key      VARCHAR(500),
    ADD COLUMN IF NOT EXISTS key2     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS auth_key VARCHAR(500),
    ADD COLUMN IF NOT EXISTS mall_id  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS mall_pw  VARCHAR(500),
    ADD COLUMN IF NOT EXISTS use_yn   CHAR(1) NOT NULL DEFAULT 'Y';
```

- [ ] **Step 2: 실제 DB에 ALTER 실행**

PowerShell 히어스트링으로 실행한다:

```powershell
@'
ALTER TABLE user_malls
    ADD COLUMN IF NOT EXISTS key      VARCHAR(500),
    ADD COLUMN IF NOT EXISTS key2     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS auth_key VARCHAR(500),
    ADD COLUMN IF NOT EXISTS mall_id  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS mall_pw  VARCHAR(500),
    ADD COLUMN IF NOT EXISTS use_yn   CHAR(1) NOT NULL DEFAULT 'Y';
'@ | docker exec -i hub-postgres psql -U hub -d hub_db
```

Expected: `ALTER TABLE`

- [ ] **Step 3: 스키마 확인**

```powershell
@'
SELECT column_name, data_type, character_maximum_length, column_default
FROM information_schema.columns
WHERE table_name = 'user_malls'
ORDER BY ordinal_position;
'@ | docker exec -i hub-postgres psql -U hub -d hub_db
```

Expected: `key`, `key2`, `auth_key`, `mall_id`, `mall_pw`, `use_yn` 컬럼이 보여야 함.

- [ ] **Step 4: init-auth.sql 업데이트**

`src/main/resources/db/init-auth.sql`의 `user_malls` INSERT 문을 아래와 같이 수정한다:

```sql
CREATE TABLE IF NOT EXISTS users (
    id         BIGSERIAL PRIMARY KEY,
    username   VARCHAR(50)  UNIQUE NOT NULL,
    password   VARCHAR(60)  NOT NULL,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_malls (
    user_id  BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mall_key VARCHAR(20) NOT NULL,
    key      VARCHAR(500),
    key2     VARCHAR(500),
    auth_key VARCHAR(500),
    mall_id  VARCHAR(255),
    mall_pw  VARCHAR(500),
    use_yn   CHAR(1)     NOT NULL DEFAULT 'Y',
    PRIMARY KEY (user_id, mall_key)
);

-- 시드 데이터
INSERT INTO users (username, password)
VALUES ('admin', '$2a$10$Sztjtnpoc2U0Owgasj/7g.0cbJm7aQM4/201FVx9tvihFL3S87mvS')
ON CONFLICT (username) DO NOTHING;

INSERT INTO user_malls (user_id, mall_key)
SELECT id, m.mall_key
FROM users,
     (VALUES ('11ST'), ('COUPANG'), ('GCHAN'), ('NSS')) AS m(mall_key)
WHERE username = 'admin'
ON CONFLICT (user_id, mall_key) DO NOTHING;
```

- [ ] **Step 5: 커밋**

```powershell
git add src/main/resources/db/
git commit -m "feat: add credential columns and use_yn to user_malls"
```

---

## Task 2: AES 암호화 유틸리티

**Files:**
- Modify: `src/main/resources/application.yml`
- Create: `src/main/java/com/bizbee/hub/config/AesProperties.java`
- Create: `src/main/java/com/bizbee/hub/config/AesEncryptor.java`
- Modify: `src/main/java/com/bizbee/hub/config/SecurityConfig.java`
- Create: `src/test/java/com/bizbee/hub/config/AesEncryptorTest.java`

- [ ] **Step 1: application.yml에 AES 키 추가**

`src/main/resources/application.yml`의 `hub:` 블록에 아래를 추가한다:

```yaml
hub:
  aes:
    secret: ${HUB_AES_SECRET}  # 반드시 32바이트
  kafka:
    # ... (기존 내용 유지)
```

`HUB_AES_SECRET` 값은 정확히 32바이트여야 함. 변경 시에도 반드시 32바이트를 유지해야 함.

- [ ] **Step 2: AesProperties 작성**

`src/main/java/com/bizbee/hub/config/AesProperties.java`:

```java
package com.bizbee.hub.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "hub.aes")
public class AesProperties {
    private String secret;
}
```

- [ ] **Step 3: AesEncryptor 작성**

`src/main/java/com/bizbee/hub/config/AesEncryptor.java`:

```java
package com.bizbee.hub.config;

import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

@Component
public class AesEncryptor {

    private final SecretKeySpec secretKey;

    public AesEncryptor(AesProperties props) {
        byte[] keyBytes = props.getSecret().getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length != 32) {
            throw new IllegalArgumentException("hub.aes.secret must be exactly 32 bytes");
        }
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
    }

    public String encrypt(String plainText) {
        if (plainText == null || plainText.isBlank()) return null;
        try {
            byte[] iv = new byte[16];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new IvParameterSpec(iv));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[16 + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, 16);
            System.arraycopy(encrypted, 0, combined, 16, encrypted.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new RuntimeException("Encryption failed", e);
        }
    }

    public String decrypt(String cipherText) {
        if (cipherText == null) return null;
        try {
            byte[] combined = Base64.getDecoder().decode(cipherText);
            byte[] iv = Arrays.copyOfRange(combined, 0, 16);
            byte[] encrypted = Arrays.copyOfRange(combined, 16, combined.length);
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new IvParameterSpec(iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Decryption failed", e);
        }
    }
}
```

- [ ] **Step 4: SecurityConfig에 @EnableConfigurationProperties 추가**

`src/main/java/com/bizbee/hub/config/SecurityConfig.java`의 `@EnableConfigurationProperties`를 수정한다:

```java
@EnableConfigurationProperties({JwtProperties.class, AesProperties.class})
```

- [ ] **Step 5: 테스트 작성**

`src/test/java/com/bizbee/hub/config/AesEncryptorTest.java`:

```java
package com.bizbee.hub.config;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class AesEncryptorTest {

    private AesEncryptor encryptor() {
        AesProperties props = new AesProperties();
        props.setSecret("test-aes-secret-32-byte-value!!!");
        return new AesEncryptor(props);
    }

    @Test
    void encryptAndDecryptRoundTrip() {
        AesEncryptor enc = encryptor();
        String original = "test-api-key-12345";

        String encrypted = enc.encrypt(original);
        String decrypted = enc.decrypt(encrypted);

        assertThat(decrypted).isEqualTo(original);
        assertThat(encrypted).isNotEqualTo(original);
    }

    @Test
    void encryptProducesDifferentCiphertextEachTime() {
        AesEncryptor enc = encryptor();
        String a = enc.encrypt("same-value");
        String b = enc.encrypt("same-value");
        assertThat(a).isNotEqualTo(b); // IV가 다르므로 매번 다른 암호문
    }

    @Test
    void encryptNullReturnsNull() {
        assertThat(encryptor().encrypt(null)).isNull();
    }

    @Test
    void decryptNullReturnsNull() {
        assertThat(encryptor().decrypt(null)).isNull();
    }
}
```

- [ ] **Step 6: 테스트 실행**

```powershell
./gradlew test --tests "com.bizbee.hub.config.AesEncryptorTest"
```

Expected: 4개 테스트 PASS

- [ ] **Step 7: 커밋**

```powershell
git add src/main/java/com/bizbee/hub/config/AesProperties.java
git add src/main/java/com/bizbee/hub/config/AesEncryptor.java
git add src/main/java/com/bizbee/hub/config/SecurityConfig.java
git add src/main/resources/application.yml
git add src/test/java/com/bizbee/hub/config/AesEncryptorTest.java
git commit -m "feat: add AES-256 encryptor for channel credentials"
```

---

## Task 3: 채널 도메인 모델 & MyBatis

**Files:**
- Create: `src/main/java/com/bizbee/hub/channel/SupportedMall.java`
- Create: `src/main/java/com/bizbee/hub/channel/ChannelRow.java`
- Create: `src/main/java/com/bizbee/hub/channel/ChannelMapper.java`
- Create: `src/main/resources/mapper/ChannelMapper.xml`

- [ ] **Step 1: SupportedMall Enum 작성**

`src/main/java/com/bizbee/hub/channel/SupportedMall.java`:

```java
package com.bizbee.hub.channel;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;
import java.util.Optional;

@Getter
@RequiredArgsConstructor
public enum SupportedMall {
    MALL_11ST("11ST",    "11번가"),
    COUPANG(  "COUPANG", "쿠팡"),
    GCHAN(    "GCHAN",   "G마켓/옥션"),
    NSS(      "NSS",     "네이버 스마트스토어");

    private final String key;
    private final String name;

    public static Optional<SupportedMall> findByKey(String key) {
        return Arrays.stream(values()).filter(m -> m.key.equals(key)).findFirst();
    }
}
```

- [ ] **Step 2: ChannelRow 작성 (DB 매핑용 내부 엔티티)**

`src/main/java/com/bizbee/hub/channel/ChannelRow.java`:

```java
package com.bizbee.hub.channel;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChannelRow {
    private Long   userId;
    private String mallKey;
    private String key;
    private String key2;
    private String authKey;
    private String mallId;
    private String mallPw;
    private String useYn;
}
```

- [ ] **Step 3: ChannelMapper 인터페이스 작성**

`src/main/java/com/bizbee/hub/channel/ChannelMapper.java`:

```java
package com.bizbee.hub.channel;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface ChannelMapper {
    List<ChannelRow>     findAllByUserId(@Param("userId") Long userId);
    Optional<ChannelRow> findByUserIdAndMallKey(@Param("userId") Long userId,
                                                @Param("mallKey") String mallKey);
    void insert(ChannelRow row);
    void update(ChannelRow row);
    void delete(@Param("userId") Long userId, @Param("mallKey") String mallKey);
    void updateUseYn(@Param("userId") Long userId,
                     @Param("mallKey") String mallKey,
                     @Param("useYn") String useYn);
}
```

- [ ] **Step 4: ChannelMapper.xml 작성**

`src/main/resources/mapper/ChannelMapper.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">

<mapper namespace="com.bizbee.hub.channel.ChannelMapper">

    <select id="findAllByUserId" resultType="com.bizbee.hub.channel.ChannelRow">
        SELECT user_id, mall_key, key, key2, auth_key, mall_id, mall_pw, use_yn
        FROM user_malls
        WHERE user_id = #{userId}
        ORDER BY mall_key
    </select>

    <select id="findByUserIdAndMallKey" resultType="com.bizbee.hub.channel.ChannelRow">
        SELECT user_id, mall_key, key, key2, auth_key, mall_id, mall_pw, use_yn
        FROM user_malls
        WHERE user_id = #{userId}
          AND mall_key = #{mallKey}
    </select>

    <insert id="insert" parameterType="com.bizbee.hub.channel.ChannelRow">
        INSERT INTO user_malls (user_id, mall_key, key, key2, auth_key, mall_id, mall_pw, use_yn)
        VALUES (#{userId}, #{mallKey}, #{key}, #{key2}, #{authKey}, #{mallId}, #{mallPw}, #{useYn})
    </insert>

    <update id="update" parameterType="com.bizbee.hub.channel.ChannelRow">
        UPDATE user_malls
        SET key      = #{key},
            key2     = #{key2},
            auth_key = #{authKey},
            mall_id  = #{mallId},
            mall_pw  = #{mallPw}
        WHERE user_id = #{userId}
          AND mall_key = #{mallKey}
    </update>

    <delete id="delete">
        DELETE FROM user_malls
        WHERE user_id = #{userId}
          AND mall_key = #{mallKey}
    </delete>

    <update id="updateUseYn">
        UPDATE user_malls
        SET use_yn = #{useYn}
        WHERE user_id = #{userId}
          AND mall_key = #{mallKey}
    </update>

</mapper>
```

- [ ] **Step 5: 커밋**

```powershell
git add src/main/java/com/bizbee/hub/channel/
git add src/main/resources/mapper/ChannelMapper.xml
git commit -m "feat: add channel domain model and MyBatis mapper"
```

---

## Task 4: DTO & 예외 클래스 & GlobalExceptionHandler

**Files:**
- Create: `src/main/java/com/bizbee/hub/channel/dto/ChannelRequest.java`
- Create: `src/main/java/com/bizbee/hub/channel/dto/ChannelResponse.java`
- Create: `src/main/java/com/bizbee/hub/channel/ChannelNotFoundException.java`
- Create: `src/main/java/com/bizbee/hub/channel/ChannelConflictException.java`
- Modify: `src/main/java/com/bizbee/hub/exception/GlobalExceptionHandler.java`

- [ ] **Step 1: ChannelRequest 작성**

`src/main/java/com/bizbee/hub/channel/dto/ChannelRequest.java`:

```java
package com.bizbee.hub.channel.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class ChannelRequest {
    private String key;
    private String key2;
    private String authKey;
    private String mallId;
    private String mallPw;
}
```

- [ ] **Step 2: ChannelResponse 작성**

`src/main/java/com/bizbee/hub/channel/dto/ChannelResponse.java`:

```java
package com.bizbee.hub.channel.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ChannelResponse {
    private String  mallKey;
    private String  mallName;
    private boolean registered;
    private String  useYn;
    private String  mallId;
    private String  key;
    private String  key2;
    private String  authKey;
    private String  mallPw;
}
```

- [ ] **Step 3: 예외 클래스 작성**

`src/main/java/com/bizbee/hub/channel/ChannelNotFoundException.java`:

```java
package com.bizbee.hub.channel;

public class ChannelNotFoundException extends RuntimeException {
    public ChannelNotFoundException(String message) {
        super(message);
    }
}
```

`src/main/java/com/bizbee/hub/channel/ChannelConflictException.java`:

```java
package com.bizbee.hub.channel;

public class ChannelConflictException extends RuntimeException {
    public ChannelConflictException(String message) {
        super(message);
    }
}
```

- [ ] **Step 4: GlobalExceptionHandler에 핸들러 추가**

`src/main/java/com/bizbee/hub/exception/GlobalExceptionHandler.java`에 아래 두 메서드를 추가한다 (`handleException` 메서드 바로 위에):

```java
@ExceptionHandler(com.bizbee.hub.channel.ChannelNotFoundException.class)
public ResponseEntity<Map<String, Object>> handleChannelNotFoundException(
        com.bizbee.hub.channel.ChannelNotFoundException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(errorBody(HttpStatus.NOT_FOUND, e.getMessage()));
}

@ExceptionHandler(com.bizbee.hub.channel.ChannelConflictException.class)
public ResponseEntity<Map<String, Object>> handleChannelConflictException(
        com.bizbee.hub.channel.ChannelConflictException e) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(errorBody(HttpStatus.CONFLICT, e.getMessage()));
}
```

- [ ] **Step 5: 커밋**

```powershell
git add src/main/java/com/bizbee/hub/channel/dto/
git add src/main/java/com/bizbee/hub/channel/ChannelNotFoundException.java
git add src/main/java/com/bizbee/hub/channel/ChannelConflictException.java
git add src/main/java/com/bizbee/hub/exception/GlobalExceptionHandler.java
git commit -m "feat: add channel DTOs, exceptions, and exception handlers"
```

---

## Task 5: 채널 서비스 & 컨트롤러 & Security 설정

**Files:**
- Create: `src/main/java/com/bizbee/hub/channel/ChannelService.java`
- Create: `src/main/java/com/bizbee/hub/channel/ChannelServiceImpl.java`
- Create: `src/main/java/com/bizbee/hub/channel/ChannelController.java`
- Modify: `src/main/java/com/bizbee/hub/config/SecurityConfig.java`

- [ ] **Step 1: ChannelService 인터페이스 작성**

`src/main/java/com/bizbee/hub/channel/ChannelService.java`:

```java
package com.bizbee.hub.channel;

import com.bizbee.hub.channel.dto.ChannelRequest;
import com.bizbee.hub.channel.dto.ChannelResponse;

import java.util.List;

public interface ChannelService {
    List<ChannelResponse> getChannels(String username);
    void register(String username, String mallKey, ChannelRequest request);
    void update(String username, String mallKey, ChannelRequest request);
    void delete(String username, String mallKey);
    void toggleUseYn(String username, String mallKey);
}
```

- [ ] **Step 2: ChannelServiceImpl 작성**

`src/main/java/com/bizbee/hub/channel/ChannelServiceImpl.java`:

```java
package com.bizbee.hub.channel;

import com.bizbee.hub.auth.AuthException;
import com.bizbee.hub.auth.HubUser;
import com.bizbee.hub.auth.UserMapper;
import com.bizbee.hub.channel.dto.ChannelRequest;
import com.bizbee.hub.channel.dto.ChannelResponse;
import com.bizbee.hub.config.AesEncryptor;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChannelServiceImpl implements ChannelService {

    private final ChannelMapper channelMapper;
    private final UserMapper    userMapper;
    private final AesEncryptor  aesEncryptor;

    @Override
    public List<ChannelResponse> getChannels(String username) {
        HubUser user = findUser(username);
        Map<String, ChannelRow> rowMap = channelMapper.findAllByUserId(user.getId())
                .stream().collect(Collectors.toMap(ChannelRow::getMallKey, r -> r));

        return Arrays.stream(SupportedMall.values())
                .map(mall -> {
                    ChannelRow row = rowMap.get(mall.getKey());
                    if (row == null) {
                        return ChannelResponse.builder()
                                .mallKey(mall.getKey())
                                .mallName(mall.getName())
                                .registered(false)
                                .build();
                    }
                    return ChannelResponse.builder()
                            .mallKey(mall.getKey())
                            .mallName(mall.getName())
                            .registered(true)
                            .useYn(row.getUseYn())
                            .mallId(mask(row.getMallId()))
                            .key(mask(row.getKey()))
                            .key2(mask(row.getKey2()))
                            .authKey(mask(row.getAuthKey()))
                            .mallPw(mask(row.getMallPw()))
                            .build();
                })
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public void register(String username, String mallKey, ChannelRequest request) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        if (channelMapper.findByUserIdAndMallKey(user.getId(), mallKey).isPresent()) {
            throw new ChannelConflictException(mallKey + " 채널이 이미 등록되어 있습니다.");
        }
        channelMapper.insert(ChannelRow.builder()
                .userId(user.getId())
                .mallKey(mallKey)
                .key(aesEncryptor.encrypt(request.getKey()))
                .key2(aesEncryptor.encrypt(request.getKey2()))
                .authKey(aesEncryptor.encrypt(request.getAuthKey()))
                .mallId(aesEncryptor.encrypt(request.getMallId()))
                .mallPw(aesEncryptor.encrypt(request.getMallPw()))
                .useYn("Y")
                .build());
    }

    @Override
    @Transactional
    public void update(String username, String mallKey, ChannelRequest request) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        ChannelRow existing = channelMapper.findByUserIdAndMallKey(user.getId(), mallKey)
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 채널이 등록되지 않았습니다."));
        channelMapper.update(ChannelRow.builder()
                .userId(user.getId())
                .mallKey(mallKey)
                .key(encryptOrKeep(request.getKey(), existing.getKey()))
                .key2(encryptOrKeep(request.getKey2(), existing.getKey2()))
                .authKey(encryptOrKeep(request.getAuthKey(), existing.getAuthKey()))
                .mallId(encryptOrKeep(request.getMallId(), existing.getMallId()))
                .mallPw(encryptOrKeep(request.getMallPw(), existing.getMallPw()))
                .build());
    }

    @Override
    @Transactional
    public void delete(String username, String mallKey) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        channelMapper.findByUserIdAndMallKey(user.getId(), mallKey)
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 채널이 등록되지 않았습니다."));
        channelMapper.delete(user.getId(), mallKey);
    }

    @Override
    @Transactional
    public void toggleUseYn(String username, String mallKey) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        ChannelRow existing = channelMapper.findByUserIdAndMallKey(user.getId(), mallKey)
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 채널이 등록되지 않았습니다."));
        String newUseYn = "Y".equals(existing.getUseYn()) ? "N" : "Y";
        channelMapper.updateUseYn(user.getId(), mallKey, newUseYn);
    }

    private HubUser findUser(String username) {
        return userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("사용자를 찾을 수 없습니다."));
    }

    private void validateMallKey(String mallKey) {
        SupportedMall.findByKey(mallKey)
                .orElseThrow(() -> new ChannelNotFoundException("지원하지 않는 채널입니다: " + mallKey));
    }

    private String mask(String value) {
        return value != null ? "****" : null;
    }

    private String encryptOrKeep(String newValue, String existingEncrypted) {
        return (newValue != null && !newValue.isBlank())
                ? aesEncryptor.encrypt(newValue)
                : existingEncrypted;
    }
}
```

- [ ] **Step 3: ChannelController 작성**

`src/main/java/com/bizbee/hub/channel/ChannelController.java`:

```java
package com.bizbee.hub.channel;

import com.bizbee.hub.channel.dto.ChannelRequest;
import com.bizbee.hub.channel.dto.ChannelResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/channels")
@RequiredArgsConstructor
public class ChannelController {

    private final ChannelService channelService;

    @GetMapping
    public ResponseEntity<List<ChannelResponse>> getChannels(
            @AuthenticationPrincipal String username) {
        return ResponseEntity.ok(channelService.getChannels(username));
    }

    @PostMapping("/{mallKey}")
    public ResponseEntity<Void> register(
            @AuthenticationPrincipal String username,
            @PathVariable String mallKey,
            @RequestBody ChannelRequest request) {
        channelService.register(username, mallKey, request);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{mallKey}")
    public ResponseEntity<Void> update(
            @AuthenticationPrincipal String username,
            @PathVariable String mallKey,
            @RequestBody ChannelRequest request) {
        channelService.update(username, mallKey, request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{mallKey}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal String username,
            @PathVariable String mallKey) {
        channelService.delete(username, mallKey);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{mallKey}/active")
    public ResponseEntity<Void> toggleUseYn(
            @AuthenticationPrincipal String username,
            @PathVariable String mallKey) {
        channelService.toggleUseYn(username, mallKey);
        return ResponseEntity.ok().build();
    }
}
```

- [ ] **Step 4: SecurityConfig 수정**

`src/main/java/com/bizbee/hub/config/SecurityConfig.java`를 아래와 같이 수정한다:

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .csrf(AbstractHttpConfigurer::disable)
        .cors(cors -> cors.configurationSource(corsConfigurationSource()))
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/auth/login").permitAll()
            .requestMatchers("/api/auth/me/**").authenticated()
            .requestMatchers("/api/channels/**").authenticated()
            .anyRequest().permitAll()
        )
        .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
}

@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("http://localhost:5173"));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
    config.setAllowedHeaders(List.of("*"));
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
}
```

- [ ] **Step 5: 빌드 확인**

```powershell
./gradlew compileJava
```

Expected: BUILD SUCCESSFUL (컴파일 에러 없음)

- [ ] **Step 6: 커밋**

```powershell
git add src/main/java/com/bizbee/hub/channel/ChannelService.java
git add src/main/java/com/bizbee/hub/channel/ChannelServiceImpl.java
git add src/main/java/com/bizbee/hub/channel/ChannelController.java
git add src/main/java/com/bizbee/hub/config/SecurityConfig.java
git commit -m "feat: add channel service, controller, and security rules"
```

---

## Task 6: UserMapper use_yn 필터 적용

**Files:**
- Modify: `src/main/resources/mapper/UserMapper.xml`

- [ ] **Step 1: findMallKeysByUserId 쿼리 수정**

`src/main/resources/mapper/UserMapper.xml`의 `findMallKeysByUserId` 쿼리를 아래와 같이 수정한다:

```xml
<select id="findMallKeysByUserId" resultType="string">
    SELECT mall_key
    FROM user_malls
    WHERE user_id = #{userId}
      AND use_yn = 'Y'
    ORDER BY mall_key
</select>
```

- [ ] **Step 2: 커밋**

```powershell
git add src/main/resources/mapper/UserMapper.xml
git commit -m "fix: filter user_malls by use_yn='Y' for collection requests"
```

---

## Task 7: 프론트엔드 ChannelManagementModal

**Files:**
- Create: `src/main/frontend/src/components/ChannelManagementModal.tsx`

- [ ] **Step 1: ChannelManagementModal 작성**

`src/main/frontend/src/components/ChannelManagementModal.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'

interface ChannelInfo {
  mallKey:    string
  mallName:   string
  registered: boolean
  useYn:      string | null
  mallId:     string | null
  key:        string | null
  key2:       string | null
  authKey:    string | null
  mallPw:     string | null
}

interface FormState {
  key:     string
  key2:    string
  authKey: string
  mallId:  string
  mallPw:  string
}

const EMPTY_FORM: FormState = { key: '', key2: '', authKey: '', mallId: '', mallPw: '' }

interface Props {
  onClose: () => void
}

export default function ChannelManagementModal({ onClose }: Props) {
  const { token } = useAuth()
  const [channels,  setChannels]  = useState<ChannelInfo[]>([])
  const [loading,   setLoading]   = useState(true)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [form,      setForm]      = useState<FormState>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)

  const authHeader = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    fetch('/api/channels', { headers: authHeader })
      .then(r => r.json())
      .then(setChannels)
      .finally(() => setLoading(false))
  }, [token])

  function openForm(mallKey: string) {
    setExpanded(mallKey)
    setForm(EMPTY_FORM)
  }

  function closeForm() {
    setExpanded(null)
    setForm(EMPTY_FORM)
  }

  async function reload() {
    const data = await fetch('/api/channels', { headers: authHeader }).then(r => r.json())
    setChannels(data)
  }

  async function handleSave(ch: ChannelInfo) {
    setSaving(true)
    const method = ch.registered ? 'PUT' : 'POST'
    await fetch(`/api/channels/${ch.mallKey}`, {
      method,
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    await reload()
    closeForm()
    setSaving(false)
  }

  async function handleDelete(mallKey: string) {
    if (!confirm(`${mallKey} 채널을 삭제하시겠습니까?`)) return
    await fetch(`/api/channels/${mallKey}`, { method: 'DELETE', headers: authHeader })
    await reload()
  }

  async function handleToggle(mallKey: string) {
    await fetch(`/api/channels/${mallKey}/active`, { method: 'PATCH', headers: authHeader })
    await reload()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[500px] max-h-[80vh] bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-[16px] font-extrabold text-[#191F28]">채널 관리</h2>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#4E5968] text-[20px] leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="py-10 text-center text-[13px] text-[#8B95A1]">불러오는 중...</div>
          ) : channels.map(ch => (
            <div key={ch.mallKey} className="border border-slate-200 rounded-xl overflow-hidden">
              {/* Channel row */}
              <div className="flex items-center gap-3 px-4 py-3 bg-[#FAFAFA]">
                <div className="flex-1">
                  <span className="text-[13px] font-bold text-[#191F28]">{ch.mallName}</span>
                  <span className="ml-2 text-[11px] font-bold text-[#8B95A1]">{ch.mallKey}</span>
                </div>
                {ch.registered ? (
                  <div className="flex items-center gap-2">
                    {/* use_yn 토글 */}
                    <button
                      onClick={() => handleToggle(ch.mallKey)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                        ch.useYn === 'Y'
                          ? 'bg-[#E8FAF0] text-[#00C073]'
                          : 'bg-[#F2F4F6] text-[#8B95A1]'
                      }`}
                    >
                      {ch.useYn === 'Y' ? '활성' : '비활성'}
                    </button>
                    <button
                      onClick={() => expanded === ch.mallKey ? closeForm() : openForm(ch.mallKey)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(ch.mallKey)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-red-50 text-[#FF6B6B] hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => expanded === ch.mallKey ? closeForm() : openForm(ch.mallKey)}
                    className="px-3 py-1 text-[11px] font-bold rounded-lg bg-[#3182F6] text-white hover:bg-blue-600"
                  >
                    등록
                  </button>
                )}
              </div>

              {/* 폼 (펼쳐질 때) */}
              {expanded === ch.mallKey && (
                <div className="px-4 py-4 border-t border-slate-100 space-y-3">
                  {([
                    { label: 'key',      field: 'key',     type: 'text'     },
                    { label: 'key2',     field: 'key2',    type: 'text'     },
                    { label: 'auth_key', field: 'authKey', type: 'text'     },
                    { label: 'mall_id',  field: 'mallId',  type: 'text'     },
                    { label: 'mall_pw',  field: 'mallPw',  type: 'password' },
                  ] as { label: string; field: keyof FormState; type: string }[]).map(({ label, field, type }) => (
                    <div key={field} className="flex items-center gap-3">
                      <label className="w-20 text-[12px] font-semibold text-[#8B95A1] flex-shrink-0">{label}</label>
                      <input
                        type={type}
                        value={form[field]}
                        placeholder={ch.registered ? '변경 시에만 입력 (빈칸 = 기존값 유지)' : ''}
                        onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
                      />
                    </div>
                  ))}
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={closeForm} className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200">
                      취소
                    </button>
                    <button
                      onClick={() => handleSave(ch)}
                      disabled={saving}
                      className="px-3 py-1.5 text-[12px] font-bold rounded-lg bg-[#3182F6] text-white hover:bg-blue-600 disabled:opacity-40"
                    >
                      {saving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="w-full px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200">
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

- [ ] **Step 2: 커밋**

```powershell
git add src/main/frontend/src/components/ChannelManagementModal.tsx
git commit -m "feat: add ChannelManagementModal component"
```

---

## Task 8: Layout 헤더에 채널 관리 버튼 추가

**Files:**
- Modify: `src/main/frontend/src/components/Layout.tsx`

- [ ] **Step 1: Layout.tsx 수정**

`src/main/frontend/src/components/Layout.tsx` 전체를 아래로 교체한다:

```tsx
import { useState, ReactNode } from 'react'
import Sidebar from './Sidebar'
import ChannelManagementModal from './ChannelManagementModal'

interface Props {
  title: string
  actions?: ReactNode
  children: ReactNode
}

export default function Layout({ title, actions, children }: Props) {
  const [channelModal, setChannelModal] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[#F9FAFB]">
      {channelModal && <ChannelManagementModal onClose={() => setChannelModal(false)} />}
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <header className="h-[60px] flex items-center justify-between px-6 bg-white border-b border-slate-100 flex-shrink-0">
          <h1 className="text-[17px] font-extrabold text-[#191F28]">{title}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChannelModal(true)}
              className="px-3 py-2 text-[12px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors"
            >
              채널 관리
            </button>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>
        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 프론트엔드 빌드 확인**

```powershell
cd src/main/frontend
npm run build
```

Expected: `dist/` 생성, 타입 에러 없음

- [ ] **Step 3: Vite 개발서버 실행 후 동작 확인**

```powershell
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 후 확인:
1. 로그인 (admin / admin123)
2. 헤더에 "채널 관리" 버튼 표시 확인
3. 버튼 클릭 시 모달 열림 확인
4. 지원 채널 4개 (11ST, COUPANG, GCHAN, NSS) 표시 확인
5. 채널 등록 → "등록" 버튼 클릭 → 폼 펼쳐짐 → 저장 → 활성/비활성 토글 동작 확인
6. CollectRequestModal에서 use_yn='Y' 채널만 나오는지 확인

- [ ] **Step 4: 커밋**

```powershell
git add src/main/frontend/src/components/Layout.tsx
git commit -m "feat: add channel management button to layout header"
```
