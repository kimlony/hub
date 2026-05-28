# Hub API 전환 세팅 — Claude Code 프롬프트

> 이 파일을 Claude Code에서 실행하세요.
> 작업 디렉토리: `bizbee-hub/hub-api-erp/` (추후 hub-api로 리네임)

---

## 작업 목표

기존 `hub-api-erp` 프로젝트를 수정하여 `hub-api`로 전환한다.
기존 코드를 최대한 유지하면서 아래 변경사항을 적용한다.

1. **포트 변경**: 8090 → 3000
2. **JPA → MyBatis 전환**: `spring-boot-starter-data-jpa` 제거, `mybatis-spring-boot-starter` 추가, 기존 JPA 코드를 MyBatis 방식으로 재작성
3. **React Vite 프론트엔드 추가**: `src/main/frontend/`
4. **SpaController 추가**: React Router 딥링크 지원
5. **WebConfig CORS 추가**: 개발용 `localhost:5173` 허용
6. **Gradle 빌드 통합**: React 빌드 → static/ 복사 자동화
7. **settings.gradle 수정**: `rootProject.name = 'hub-api'`

참고 파일: `CLAUDE.md` (구조, 규칙, 설정값 전부 명시)

---

## Step 1 — build.gradle 수정

기존 `build.gradle`에서 아래 변경사항을 적용하라.

**제거:**
```groovy
implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
runtimeOnly 'org.postgresql:postgresql'  // 위치 이동
```

**추가:**
```groovy
implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.3'
runtimeOnly 'org.postgresql:postgresql'
```

**Gradle task 추가 (파일 하단):**
```groovy
task buildFrontend(type: Exec) {
    workingDir 'src/main/frontend'
    commandLine 'npm', 'run', 'build'
}

task copyFrontend(type: Copy, dependsOn: buildFrontend) {
    from 'src/main/frontend/dist'
    into 'src/main/resources/static'
}

processResources.dependsOn copyFrontend
```

`settings.gradle`의 `rootProject.name`을 `'hub-api'`로 변경하라.

---

## Step 2 — application.yml 수정

기존 `application.yml`에서 아래를 변경하라.

**변경:**
- `server.port`: `8090` → `3000`

**제거:**
- `spring.jpa` 블록 전체
- `logging.level.org.hibernate.SQL` 항목

**추가:**
```yaml
mybatis:
  mapper-locations: classpath:mapper/**/*.xml
  type-aliases-package: com.bizbee.hub
  configuration:
    map-underscore-to-camel-case: true
```

---

## Step 3 — Java 소스 수정 및 추가

### 3-1. config/WebConfig.java 수정 (기존 파일)

기존 인터셉터 등록 코드는 유지하면서 아래를 추가하라.

- `WebMvcConfigurer`에 CORS 설정 추가:
```java
@Override
public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/api/**")
            .allowedOrigins("http://localhost:5173")
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("*");
}
```

### 3-2. config/SpaController.java 신규 생성

```java
package com.bizbee.hub.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
public class SpaController {

    @RequestMapping(value = "/{path:[^\\.]*}")
    public String forward() {
        return "forward:/index.html";
    }
}
```

### 3-3. job/HubJob.java 수정 (기존 파일)

기존 JPA 어노테이션(`@Entity`, `@Table`, `@Id`, `@Column` 등)을 모두 제거하고 순수 도메인 객체로 변경하라.

```java
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HubJob {
    private String requestId;
    private String requestKey;
    private String channelCd;
    private HubJobStatus status;
    private String payload;
    private int retryCount;
    private String errorMessage;
    private LocalDateTime completedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

### 3-4. job/HubJobMapper.java 수정 (기존 파일)

기존 내용을 MyBatis `@Mapper` 인터페이스로 완전히 교체하라.

```java
package com.bizbee.hub.job;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface HubJobMapper {
    void insertJob(HubJob job);
    HubJob selectByRequestId(String requestId);
    HubJob selectByRequestKey(String requestKey);
    List<HubJob> selectByStatus(String status);
    void updateStatus(@Param("requestId") String requestId,
                      @Param("status") String status,
                      @Param("errorMessage") String errorMessage);
    void updateStatusToReset(String requestKey);
}
```

### 3-5. resources/mapper/HubJobMapper.xml 신규 생성

`src/main/resources/mapper/HubJobMapper.xml`을 생성하라.

- namespace: `com.bizbee.hub.job.HubJobMapper`
- resultMap id `hubJobResultMap` 정의 (snake_case → camelCase)
- 구현 메서드: `insertJob`, `selectByRequestId`, `selectByRequestKey`, `selectByStatus`, `updateStatus`, `updateStatusToReset`
- `hub_job` 테이블 기준 컬럼:
  `request_id`, `request_key`, `channel_cd`, `status`, `payload`, `retry_count`, `error_message`, `completed_at`, `created_at`, `updated_at`

### 3-6. job/HubJobRepository.java 삭제

JPA Repository 파일이 있다면 삭제하라.

### 3-7. job/HubJobService.java 수정 (기존 파일)

기존 interface를 유지하고, JPA 관련 import만 제거하라.

### 3-8. job/HubJobServiceImpl.java 수정 또는 신규 생성

기존 Service 구현체가 있다면 JPA Repository 주입을 `HubJobMapper`로 교체하라.
없다면 아래 구조로 신규 생성하라.

- `@Service`, `@RequiredArgsConstructor`, `@Transactional`
- `HubJobMapper` 주입
- `createBatchJobs(HubJobBatchRequest)`:
  - 채널별 requestKey 생성: `{channelCd}_{frDt}_{toDt}_{corpCd}`
  - 중복 처리 로직 (CLAUDE.md 참고)
  - 신규 job: UUID requestId 생성 → insertJob → Kafka 발행
- `getJob(String requestId)`: selectByRequestId → 없으면 HubJobNotFoundException

### 3-9. kafka/HubKafkaProducer.java 확인 및 수정

기존 Kafka 어댑터가 있다면 메서드명을 `sendJobEvent(HubJob job)`으로 통일하라.
메시지 형식: `{ "requestId", "channelCd", "payload", "status" }` JSON

---

## Step 4 — React (Vite) 프론트엔드 추가

`src/main/frontend/` 디렉토리를 생성하고 React + TypeScript + Vite 프로젝트를 구성하라.

### 4-1. package.json
```json
{
  "name": "hub-frontend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.1.0"
  }
}
```

### 4-2. vite.config.ts
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist'
  }
})
```

### 4-3. tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src"]
}
```

### 4-4. index.html
```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BizBee HUB</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 4-5. src/main.tsx
```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

### 4-6. src/App.tsx
```typescript
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import JobsPage from './pages/JobsPage'
import MonitorPage from './pages/MonitorPage'

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: '12px 24px', borderBottom: '1px solid #e5e7eb' }}>
        <Link to="/" style={{ marginRight: 16 }}>대시보드</Link>
        <Link to="/jobs" style={{ marginRight: 16 }}>주문수집</Link>
        <Link to="/monitor">Kafka 모니터</Link>
      </nav>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
      </Routes>
    </BrowserRouter>
  )
}
```

### 4-7. src/pages/DashboardPage.tsx
```typescript
export default function DashboardPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>BizBee HUB</h1>
      <p>주문수집 자동화 플랫폼</p>
    </div>
  )
}
```

### 4-8. src/pages/JobsPage.tsx
```typescript
export default function JobsPage() {
  return (
    <div style={{ padding: 24 }}>
      <h2>주문수집</h2>
      <p>채널별 주문수집 화면 (개발 예정)</p>
    </div>
  )
}
```

### 4-9. src/pages/MonitorPage.tsx
```typescript
export default function MonitorPage() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Kafka 모니터링</h2>
      <p>트래픽 및 수집 현황 (개발 예정)</p>
    </div>
  )
}
```

---

## Step 5 — 검증

아래 사항을 순서대로 확인하라.

1. `./gradlew compileJava` — 컴파일 오류 없음 확인
2. `./gradlew bootRun` — 포트 3000에서 Spring Boot 기동 확인
3. `src/main/frontend/`에서 `npm install && npm run dev` — 5173에서 Vite 기동 확인
4. 브라우저 `http://localhost:5173` — React 대시보드 화면 표시 확인
5. 브라우저 `http://localhost:5173/jobs` — React 라우팅 동작 확인
6. 브라우저 `http://localhost:5173/api/hub/jobs/test-id` — Spring Boot 응답(404) 오는지 확인 (프록시 동작)

---

## 주의사항

- JPA / Hibernate 코드 완전히 제거 (`@Entity`, `@Table`, `@Column`, `JpaRepository` 등)
- MyBatis mapper.xml의 namespace는 Mapper interface 풀 패키지명과 정확히 일치
- API 경로는 반드시 `/api/` prefix
- 프론트엔드 소스를 `src/main/resources/static/`에 직접 작성 금지
- TypeScript `any` 타입 사용 금지
