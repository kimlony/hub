# BizBee Hub API — Claude Code 지침

## 프로젝트 개요

주문수집 자동화 플랫폼의 메인 서버.
기존 hub-api-erp를 hub-api로 전환한 버전으로, REST API + Kafka Producer + React 기반 Web UI를 모두 담당한다.

> 폴더명: `hub-api-erp` → 추후 `hub-api`로 리네임 예정

---

## 아키텍처

```
[React UI] ←→ [Hub API :3000] ←→ [Kafka] ←→ [Hub Worker (Node.js)]
                     ↓
               [PostgreSQL]
```

### 개발 환경
```
React (Vite :5173) --proxy /api--> Spring Boot (:3000)
```

### 운영 환경
```
Spring Boot (:3000) serves static/ (React build 결과물 포함)
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | Java 17, Spring Boot 3.3.5 |
| Frontend | React 18, TypeScript, Vite |
| DB (허브) | PostgreSQL 16 |
| DB | PostgreSQL |
| ORM | MyBatis (mapper + mapper.xml 구조) |
| 메시지 큐 | Apache Kafka 3.7 |
| 인프라 | Docker Compose |
| 포트 | 3000 (Spring Boot), 5173 (Vite dev) |

---

## 프로젝트 구조

```
hub-api-erp/  (→ hub-api로 리네임 예정)
├── src/
│   ├── main/
│   │   ├── java/com/bizbee/hub/
│   │   │   ├── HubApiApplication.java
│   │   │   ├── config/
│   │   │   │   ├── WebConfig.java          # CORS, SPA 포워딩, 인터셉터
│   │   │   │   ├── SpaController.java      # React Router 지원
│   │   │   │   └── KafkaConfig.java
│   │   │   ├── job/
│   │   │   │   ├── HubJobController.java   # /api/hub/jobs
│   │   │   │   ├── HubJobService.java
│   │   │   │   ├── HubJobServiceImpl.java
│   │   │   │   ├── HubJobMapper.java       # MyBatis
│   │   │   │   └── dto/
│   │   │   ├── kafka/
│   │   │   │   └── HubKafkaProducer.java
│   │   │   ├── scheduler/
│   │   │   │   └── HubJobScheduler.java    # 배치 Cron
│   │   │   └── exception/
│   │   │       └── GlobalExceptionHandler.java
│   │   ├── resources/
│   │   │   ├── application.yml
│   │   │   ├── mapper/
│   │   │   │   └── HubJobMapper.xml        # MyBatis XML
│   │   │   └── static/                     # React 빌드 결과물 (운영)
│   │   └── frontend/                       # React 소스
│   │       ├── src/
│   │       ├── package.json
│   │       └── vite.config.ts
│   └── test/
├── build.gradle
└── docker-compose.yml
```

---

## 코딩 규칙

### Backend (Java)
- 패키지: `com.bizbee.hub`
- MyBatis 구조: `Controller → Service → ServiceImpl → Mapper(interface) → mapper.xml`
- API 경로: 반드시 `/api/` prefix
- 모든 API 응답은 `ResponseEntity<T>` 사용
- Lombok 사용 (`@RequiredArgsConstructor`, `@Getter`, `@Builder` 등)
- 예외 처리: `GlobalExceptionHandler`에서 통합 처리
- `@Transactional`은 ServiceImpl에만 선언

### Frontend (React)
- TypeScript strict 모드
- API 호출은 `/api/` 경로로 (Vite proxy → Spring Boot)
- 컴포넌트는 `src/components/`, 페이지는 `src/pages/`
- 상태관리: React 기본 hooks (useState, useEffect, useContext)

### MyBatis mapper.xml 규칙
- namespace: Mapper interface 풀 경로와 일치
- id: Mapper interface 메서드명과 일치
- resultType / resultMap 명시

---

## 주요 API 설계

```
POST   /api/hub/jobs/batch      채널 선택 + 날짜로 수집 요청
GET    /api/hub/jobs/{id}       단건 조회
GET    /api/hub/jobs            목록 조회 (상태 필터)
POST   /api/hub/jobs/{id}/retry 수동 재시도
GET    /api/hub/metrics         채널별 성공률, 처리량
```

---

## application.yml 설정값

```yaml
server:
  port: 3000

spring:
  datasource:
    url: ${POSTGRES_URL:jdbc:postgresql://localhost:5432/hub_db}
    username: ${POSTGRES_USER:hub}
    password: ${POSTGRES_PASSWORD}
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}

hub:
  security:
    enabled: true
    header-name: X-Hub-Api-Key
    api-key: ${HUB_API_KEY}
  kafka:
    topics:
      jobs: hub.jobs
```

---

## Vite 프록시 설정 (개발 시)

```typescript
// frontend/vite.config.ts
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true
    }
  }
}
```

---

## SPA 라우팅 처리

React Router를 위해 `/api/`로 시작하지 않는 경로는 모두 `index.html`로 포워딩.

```java
@Controller
public class SpaController {
    @RequestMapping(value = "/{path:[^\\.]*}")
    public String redirect() {
        return "forward:/index.html";
    }
}
```

---

## Gradle 빌드 통합

운영 배포 시 React 빌드 결과물을 static/에 자동 복사:

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

---

## 금지사항

- `/api/` prefix 없는 REST 엔드포인트 생성 금지
- JPA / Hibernate 사용 금지 (MyBatis만 사용)
- `any` 타입 사용 금지 (TypeScript)
- SpaController 없이 React Router 사용 금지
- frontend 소스를 `src/main/resources/static/`에 직접 작성 금지 (빌드 결과물만)
