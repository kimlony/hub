# Auth / Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자별 몰(mall) 설정을 가진 다중 사용자 로그인 시스템을 JWT 기반으로 구현한다.

**Architecture:** Spring Boot에 JJWT 라이브러리와 Spring Security를 추가해 `/api/auth/login`은 무인증, `/api/auth/me/malls`는 JWT 인증으로 보호한다. 기존 HubApiKeyInterceptor(`/api/hub/jobs/**`)는 그대로 유지하고, Security는 그 경로를 permitAll로 열어 둔다. 프론트엔드는 AuthContext에 토큰을 저장하고 ProtectedRoute로 로그인 화면을 강제한다.

**Tech Stack:** Java 17, Spring Boot 3.3.5, Spring Security 6, JJWT 0.12.6, BCrypt, MyBatis, PostgreSQL, React 18 + TypeScript, React Router v6

---

## File Map

### 신규 생성 (Backend)
| 파일 | 역할 |
|------|------|
| `src/main/resources/db/init-auth.sql` | users, user_malls 테이블 DDL + 시드 데이터 |
| `src/main/java/com/bizbee/hub/auth/HubUser.java` | 유저 도메인 객체 |
| `src/main/java/com/bizbee/hub/auth/LoginRequest.java` | 로그인 요청 DTO |
| `src/main/java/com/bizbee/hub/auth/LoginResponse.java` | 로그인 응답 DTO (token) |
| `src/main/java/com/bizbee/hub/auth/UserMapper.java` | MyBatis Mapper 인터페이스 |
| `src/main/java/com/bizbee/hub/auth/AuthService.java` | 서비스 인터페이스 |
| `src/main/java/com/bizbee/hub/auth/AuthServiceImpl.java` | 서비스 구현 |
| `src/main/java/com/bizbee/hub/auth/AuthController.java` | `/api/auth/**` REST 컨트롤러 |
| `src/main/java/com/bizbee/hub/config/JwtProperties.java` | JWT 설정값 바인딩 |
| `src/main/java/com/bizbee/hub/config/JwtProvider.java` | JWT 생성/검증 유틸 |
| `src/main/java/com/bizbee/hub/config/JwtAuthFilter.java` | 요청마다 토큰 검증하는 필터 |
| `src/main/java/com/bizbee/hub/config/SecurityConfig.java` | Spring Security 설정 |
| `src/main/resources/mapper/UserMapper.xml` | MyBatis SQL |

### 수정 (Backend)
| 파일 | 변경 내용 |
|------|-----------|
| `build.gradle` | spring-security, jjwt 의존성 추가 |
| `src/main/resources/application.yml` | `hub.jwt` 설정 추가 |
| `src/main/java/com/bizbee/hub/config/WebConfig.java` | CORS allowCredentials 제거 (Security가 처리) |

### 신규 생성 (Frontend)
| 파일 | 역할 |
|------|------|
| `src/main/frontend/src/context/AuthContext.tsx` | token 상태 + login/logout 함수 제공 |
| `src/main/frontend/src/pages/LoginPage.tsx` | ID/PW 입력 화면 |
| `src/main/frontend/src/components/ProtectedRoute.tsx` | 미로그인 시 /login 리다이렉트 |

### 수정 (Frontend)
| 파일 | 변경 내용 |
|------|-----------|
| `src/main/frontend/src/App.tsx` | /login 라우트 추가, 기존 라우트를 ProtectedRoute로 감싸기 |
| `src/main/frontend/src/components/CollectRequestModal.tsx` | 하드코딩 MALLS 제거, `/api/auth/me/malls` API 호출로 교체 |

---

## Task 1: DB 스키마 생성

**Files:**
- Create: `src/main/resources/db/init-auth.sql`

- [ ] **Step 1: SQL 파일 작성**

```sql
-- src/main/resources/db/init-auth.sql
CREATE TABLE IF NOT EXISTS users (
    id         BIGSERIAL PRIMARY KEY,
    username   VARCHAR(50)  UNIQUE NOT NULL,
    password   VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_malls (
    user_id  BIGINT      REFERENCES users(id) ON DELETE CASCADE,
    mall_key VARCHAR(20) NOT NULL,
    PRIMARY KEY (user_id, mall_key)
);
```

- [ ] **Step 2: DB에 직접 실행**

```bash
psql -U hub -d hub_db -f src/main/resources/db/init-auth.sql
```

Expected: `CREATE TABLE`, `CREATE TABLE` 두 줄 출력.

- [ ] **Step 3: 테스트용 유저 삽입**

아래 SQL을 실행한다. 비밀번호 `admin123`의 BCrypt 해시값이다.

```sql
INSERT INTO users (username, password)
VALUES ('admin', '$2a$10$7EqJtq98hPqEX7fNZaFWoOhAkw2TL0xSCbQGrKsLHjAYknNSt7cHi')
ON CONFLICT (username) DO NOTHING;

INSERT INTO user_malls (user_id, mall_key)
SELECT id, m.mall_key
FROM users,
     (VALUES ('11ST'), ('COUPANG'), ('GCHAN'), ('NSS')) AS m(mall_key)
WHERE username = 'admin'
ON CONFLICT DO NOTHING;
```

Expected: `INSERT 0 1`, `INSERT 0 4`

---

## Task 2: 의존성 추가 및 JWT 설정

**Files:**
- Modify: `build.gradle`
- Modify: `src/main/resources/application.yml`

- [ ] **Step 1: build.gradle에 의존성 추가**

`dependencies { ... }` 블록 안에 아래 4줄 추가:

```groovy
implementation 'org.springframework.boot:spring-boot-starter-security'
implementation 'io.jsonwebtoken:jjwt-api:0.12.6'
runtimeOnly    'io.jsonwebtoken:jjwt-impl:0.12.6'
runtimeOnly    'io.jsonwebtoken:jjwt-jackson:0.12.6'
```

- [ ] **Step 2: application.yml에 JWT 설정 추가**

파일 맨 아래에 추가:

```yaml
hub:
  jwt:
    secret: ${HUB_JWT_SECRET}
    expiry-ms: 86400000   # 24시간
```

- [ ] **Step 3: Gradle 빌드 확인**

```bash
./gradlew dependencies --configuration compileClasspath | grep -E "jjwt|security"
```

Expected: `jjwt-api`, `spring-security-core` 등이 출력됨.

---

## Task 3: JWT 유틸리티

**Files:**
- Create: `src/main/java/com/bizbee/hub/config/JwtProperties.java`
- Create: `src/main/java/com/bizbee/hub/config/JwtProvider.java`

- [ ] **Step 1: JwtProperties 작성**

```java
// src/main/java/com/bizbee/hub/config/JwtProperties.java
package com.bizbee.hub.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter @Setter
@ConfigurationProperties(prefix = "hub.jwt")
public class JwtProperties {
    private String secret;
    private long   expiryMs;
}
```

- [ ] **Step 2: JwtProvider 작성**

```java
// src/main/java/com/bizbee/hub/config/JwtProvider.java
package com.bizbee.hub.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
@RequiredArgsConstructor
public class JwtProvider {

    private final JwtProperties props;

    private SecretKey key() {
        return Keys.hmacShaKeyFor(props.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String generate(String username) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(username)
                .issuedAt(new Date(now))
                .expiration(new Date(now + props.getExpiryMs()))
                .signWith(key())
                .compact();
    }

    public String extractUsername(String token) {
        return claims(token).getSubject();
    }

    public boolean isValid(String token) {
        try {
            claims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Claims claims(String token) {
        return Jwts.parser()
                .verifyWith(key())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
```

---

## Task 4: 유저 도메인 + MyBatis

**Files:**
- Create: `src/main/java/com/bizbee/hub/auth/HubUser.java`
- Create: `src/main/java/com/bizbee/hub/auth/UserMapper.java`
- Create: `src/main/resources/mapper/UserMapper.xml`

- [ ] **Step 1: HubUser 도메인 작성**

```java
// src/main/java/com/bizbee/hub/auth/HubUser.java
package com.bizbee.hub.auth;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter @Setter
public class HubUser {
    private Long         id;
    private String       username;
    private String       password;
    private List<String> mallKeys;
}
```

- [ ] **Step 2: UserMapper 인터페이스 작성**

```java
// src/main/java/com/bizbee/hub/auth/UserMapper.java
package com.bizbee.hub.auth;

import org.apache.ibatis.annotations.Mapper;

import java.util.List;
import java.util.Optional;

@Mapper
public interface UserMapper {
    Optional<HubUser> findByUsername(String username);
    List<String>      findMallKeysByUserId(Long userId);
}
```

- [ ] **Step 3: UserMapper.xml 작성**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">

<mapper namespace="com.bizbee.hub.auth.UserMapper">

    <select id="findByUsername" resultType="com.bizbee.hub.auth.HubUser">
        SELECT id, username, password
        FROM users
        WHERE username = #{username}
    </select>

    <select id="findMallKeysByUserId" resultType="string">
        SELECT mall_key
        FROM user_malls
        WHERE user_id = #{userId}
        ORDER BY mall_key
    </select>

</mapper>
```

---

## Task 5: Auth 비즈니스 로직 + 컨트롤러

**Files:**
- Create: `src/main/java/com/bizbee/hub/auth/LoginRequest.java`
- Create: `src/main/java/com/bizbee/hub/auth/LoginResponse.java`
- Create: `src/main/java/com/bizbee/hub/auth/AuthService.java`
- Create: `src/main/java/com/bizbee/hub/auth/AuthServiceImpl.java`
- Create: `src/main/java/com/bizbee/hub/auth/AuthController.java`

- [ ] **Step 1: DTO 작성**

```java
// src/main/java/com/bizbee/hub/auth/LoginRequest.java
package com.bizbee.hub.auth;

import lombok.Getter;

@Getter
public class LoginRequest {
    private String username;
    private String password;
}
```

```java
// src/main/java/com/bizbee/hub/auth/LoginResponse.java
package com.bizbee.hub.auth;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class LoginResponse {
    private String token;
    private String username;
}
```

- [ ] **Step 2: AuthService 인터페이스 작성**

```java
// src/main/java/com/bizbee/hub/auth/AuthService.java
package com.bizbee.hub.auth;

import java.util.List;

public interface AuthService {
    LoginResponse login(LoginRequest request);
    List<String>  getMallKeys(String username);
}
```

- [ ] **Step 3: AuthServiceImpl 작성**

```java
// src/main/java/com/bizbee/hub/auth/AuthServiceImpl.java
package com.bizbee.hub.auth;

import com.bizbee.hub.config.JwtProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final UserMapper      userMapper;
    private final JwtProvider     jwtProvider;
    private final PasswordEncoder passwordEncoder;

    @Override
    public LoginResponse login(LoginRequest request) {
        HubUser user = userMapper.findByUsername(request.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("아이디 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        String token = jwtProvider.generate(user.getUsername());
        return new LoginResponse(token, user.getUsername());
    }

    @Override
    public List<String> getMallKeys(String username) {
        HubUser user = userMapper.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        return userMapper.findMallKeysByUserId(user.getId());
    }
}
```

- [ ] **Step 4: AuthController 작성**

```java
// src/main/java/com/bizbee/hub/auth/AuthController.java
package com.bizbee.hub.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/me/malls")
    public ResponseEntity<List<String>> myMalls(@AuthenticationPrincipal String username) {
        return ResponseEntity.ok(authService.getMallKeys(username));
    }
}
```

---

## Task 6: Spring Security 설정

**Files:**
- Create: `src/main/java/com/bizbee/hub/config/JwtAuthFilter.java`
- Create: `src/main/java/com/bizbee/hub/config/SecurityConfig.java`
- Modify: `src/main/java/com/bizbee/hub/config/WebConfig.java`

- [ ] **Step 1: JwtAuthFilter 작성**

```java
// src/main/java/com/bizbee/hub/config/JwtAuthFilter.java
package com.bizbee.hub.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            if (jwtProvider.isValid(token)) {
                String username = jwtProvider.extractUsername(token);
                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(username, null, List.of());
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }
        chain.doFilter(request, response);
    }
}
```

- [ ] **Step 2: SecurityConfig 작성**

```java
// src/main/java/com/bizbee/hub/config/SecurityConfig.java
package com.bizbee.hub.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/login").permitAll()
                .requestMatchers("/api/auth/me/**").authenticated()
                .anyRequest().permitAll()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:5173"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
```

- [ ] **Step 3: WebConfig에서 CORS 설정 제거**

`WebConfig.java`에서 `addCorsMappings` 메서드 전체를 삭제한다 (SecurityConfig에서 처리).

```java
// 삭제할 메서드:
@Override
public void addCorsMappings(CorsRegistry registry) { ... }
```

- [ ] **Step 4: GlobalExceptionHandler에 인증 오류 처리 추가**

`src/main/java/com/bizbee/hub/exception/GlobalExceptionHandler.java` 파일을 열고 아래 핸들러를 추가한다:

```java
@ExceptionHandler(IllegalArgumentException.class)
public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException e) {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("message", e.getMessage()));
}
```

필요한 import:
```java
import org.springframework.http.HttpStatus;
import java.util.Map;
```

- [ ] **Step 5: 서버 재시작 후 동작 확인**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Expected: `{"token":"eyJ...","username":"admin"}`

```bash
TOKEN=<위에서 받은 token>
curl http://localhost:3000/api/auth/me/malls \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `["11ST","COUPANG","GCHAN","NSS"]`

---

## Task 7: 프론트엔드 - AuthContext

**Files:**
- Create: `src/main/frontend/src/context/AuthContext.tsx`

- [ ] **Step 1: AuthContext 작성**

```tsx
// src/main/frontend/src/context/AuthContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react'

interface AuthCtx {
  token:    string | null
  username: string | null
  login:    (token: string, username: string) => void
  logout:   () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,    setToken]    = useState<string | null>(localStorage.getItem('hub_token'))
  const [username, setUsername] = useState<string | null>(localStorage.getItem('hub_username'))

  function login(token: string, username: string) {
    localStorage.setItem('hub_token',    token)
    localStorage.setItem('hub_username', username)
    setToken(token)
    setUsername(username)
  }

  function logout() {
    localStorage.removeItem('hub_token')
    localStorage.removeItem('hub_username')
    setToken(null)
    setUsername(null)
  }

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

---

## Task 8: 프론트엔드 - 로그인 페이지

**Files:**
- Create: `src/main/frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: LoginPage 작성**

```tsx
// src/main/frontend/src/pages/LoginPage.tsx
import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login }    = useAuth()
  const navigate     = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.message ?? '로그인에 실패했습니다.')
      }
      const { token, username: name } = await res.json()
      login(token, name)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <div className="w-[360px] bg-white rounded-2xl shadow-sm p-8">
        <div className="mb-6 text-center">
          <div className="w-10 h-10 bg-[#3182F6] rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-extrabold text-[14px]">B</span>
          </div>
          <h1 className="text-[18px] font-extrabold text-[#191F28]">BizBee HUB</h1>
          <p className="text-[13px] text-[#8B95A1] mt-1">주문수집 자동화 플랫폼</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="아이디"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full px-4 py-3 text-[14px] border border-slate-200 rounded-xl text-[#191F28] placeholder-[#C4C9D1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 text-[14px] border border-slate-200 rounded-xl text-[#191F28] placeholder-[#C4C9D1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
          />
          {error && (
            <p className="text-[12px] text-[#FF6B6B] text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-[14px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

---

## Task 9: 프론트엔드 - ProtectedRoute + App.tsx

**Files:**
- Create: `src/main/frontend/src/components/ProtectedRoute.tsx`
- Modify: `src/main/frontend/src/App.tsx`

- [ ] **Step 1: ProtectedRoute 작성**

```tsx
// src/main/frontend/src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ReactNode } from 'react'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}
```

- [ ] **Step 2: App.tsx 전체 교체**

```tsx
// src/main/frontend/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import JobsPage      from './pages/JobsPage'
import MonitorPage   from './pages/MonitorPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute><DashboardPage /></ProtectedRoute>
          } />
          <Route path="/jobs" element={
            <ProtectedRoute><JobsPage /></ProtectedRoute>
          } />
          <Route path="/monitor" element={
            <ProtectedRoute><MonitorPage /></ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
```

---

## Task 10: 수집 요청 모달 - API 연동

**Files:**
- Modify: `src/main/frontend/src/components/CollectRequestModal.tsx`

- [ ] **Step 1: CollectRequestModal 전체 교체**

하드코딩 `MALLS` 배열을 제거하고 `/api/auth/me/malls`에서 불러온다.

```tsx
// src/main/frontend/src/components/CollectRequestModal.tsx
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'

const MALL_LABELS: Record<string, string> = {
  '11ST':    '11번가',
  COUPANG:   '쿠팡',
  GCHAN:     'G마켓/옥션',
  NSS:       '네이버 스마트스토어',
}

interface Props {
  onClose: () => void
}

export default function CollectRequestModal({ onClose }: Props) {
  const { token } = useAuth()
  const today     = new Date().toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(today)
  const [endDate,   setEndDate]   = useState(today)
  const [malls,     setMalls]     = useState<string[]>([])
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(true)
  const allRef = useRef<HTMLInputElement>(null)

  const allChecked  = malls.length > 0 && selected.size === malls.length
  const someChecked = selected.size > 0 && !allChecked

  useEffect(() => {
    fetch('/api/auth/me/malls', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((keys: string[]) => setMalls(keys))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someChecked
  }, [someChecked])

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(malls))
  }

  function toggleMall(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[420px] bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-[16px] font-extrabold text-[#191F28]">수집 요청</h2>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#4E5968] text-[20px] leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-[12px] font-semibold text-[#8B95A1] uppercase tracking-wide mb-2">수집 기간</label>
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" />
              <span className="text-[#8B95A1] text-[13px]">~</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#8B95A1] uppercase tracking-wide mb-2">쇼핑몰 선택</label>
            {loading ? (
              <div className="py-8 text-center text-[13px] text-[#8B95A1]">불러오는 중...</div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <label className="flex items-center gap-3 px-4 py-3 bg-[#FAFAFA] border-b border-slate-100 cursor-pointer hover:bg-slate-50">
                  <input ref={allRef} type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 accent-[#3182F6]" />
                  <span className="text-[13px] font-bold text-[#191F28]">전체 선택</span>
                  <span className="ml-auto text-[12px] text-[#8B95A1]">{selected.size} / {malls.length}</span>
                </label>
                {malls.map((key) => (
                  <label key={key} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={selected.has(key)} onChange={() => toggleMall(key)} className="w-4 h-4 accent-[#3182F6]" />
                    <span className="text-[13px] text-[#4E5968]">{MALL_LABELS[key] ?? key}</span>
                    <span className="ml-auto text-[11px] font-bold text-[#8B95A1]">{key}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200">취소</button>
          <button disabled={selected.size === 0}
            className="px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">
            수집 요청
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

---

## Self-Review 체크리스트

| 항목 | 상태 |
|------|------|
| DB 스키마 (users, user_malls) | ✅ Task 1 |
| BCrypt 비밀번호 검증 | ✅ Task 5 AuthServiceImpl |
| JWT 생성/검증 | ✅ Task 3 JwtProvider |
| `/api/auth/login` 무인증 허용 | ✅ Task 6 SecurityConfig |
| `/api/auth/me/malls` JWT 인증 | ✅ Task 6 SecurityConfig + Task 5 Controller |
| 기존 API Key 인터셉터 유지 | ✅ Task 6 anyRequest().permitAll() |
| 프론트 토큰 localStorage 저장 | ✅ Task 7 AuthContext |
| 로그인 화면 | ✅ Task 8 LoginPage |
| 미로그인 리다이렉트 | ✅ Task 9 ProtectedRoute |
| 모달 API 연동 | ✅ Task 10 CollectRequestModal |
| CORS 중복 제거 | ✅ Task 6 WebConfig addCorsMappings 삭제 |
| 에러 응답 핸들링 | ✅ Task 6 GlobalExceptionHandler |
