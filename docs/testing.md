# 테스트 가이드

이 문서는 이 저장소에서 사용하는 표준 테스트 실행 명령어를 정리합니다.
별도 안내가 없는 경우 모든 명령어는 저장소 루트 경로에서 실행합니다.

## 테스트 그룹

| 그룹 | 범위 | 명령어 |
| --- | --- | --- |
| 빠른 검증 | Java 단위 테스트, Node 단위 테스트, TypeScript 검사, 빌드 검사 | `powershell -ExecutionPolicy Bypass -File scripts/test-fast.ps1` |
| 통합 검증 | PostgreSQL/Kafka 통합 테스트 | `powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1` |

빠른 검증은 코드가 변경될 때마다 실행하는 것을 기준으로 합니다.
통합 검증은 상대적으로 무거운 테스트이므로 병합 전, 배포 전, 또는 DB/Kafka 동작이 변경되었을 때 실행하는 것을 기준으로 합니다.

## 빠른 검증

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-fast.ps1
```

이 명령어는 다음 항목을 실행합니다.

1. `hub-api-erp`의 Java 단위 테스트
2. `hub-worker`의 TypeScript 타입 검사
3. `hub-worker`의 Node 단위 테스트
4. `hub-worker`의 Node 빌드
5. `hub-api-erp/src/main/frontend`의 Frontend 빌드

개별 실행 명령어는 다음과 같습니다.

```powershell
cd hub-api-erp
.\gradlew.bat test
```

```powershell
cd hub-worker
npm run check
npm test
npm run build
```

```powershell
cd hub-api-erp/src/main/frontend
npm run build
```

## 통합 검증

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1
```

통합 테스트는 Testcontainers 기반 임시 인프라를 사용합니다.

- Java DB 통합 테스트는 격리된 PostgreSQL 컨테이너를 실행합니다.
- Node DB/Kafka 통합 테스트는 격리된 PostgreSQL/Kafka 컨테이너를 실행합니다.
- 로컬 개발용 Docker Compose의 PostgreSQL/Kafka 데이터는 사용하지 않습니다.

GitHub Actions에서도 같은 통합 테스트를 수동으로 실행할 수 있습니다.

1. GitHub 저장소를 엽니다.
2. `Actions` 탭으로 이동합니다.
3. `Integration Tests` 워크플로우를 선택합니다.
4. `Run workflow`를 클릭합니다.

개별 실행 명령어는 다음과 같습니다.

```powershell
cd hub-api-erp
$env:RUN_DB_INTEGRATION_TESTS = "true"
.\gradlew.bat test --tests "*IntegrationTest"
```

```powershell
cd hub-worker
npm run test:integration
```

## 현재 테스트 분리 기준

빠른 테스트에 포함되는 항목은 다음과 같습니다.

- Java 서비스 및 분기 테스트
- DB 인프라가 필요 없는 Java 보안/필터 테스트
- Node 스키마, 핸들러 레지스트리, 정규화 테스트
- TypeScript 컴파일 검사
- Worker 및 Frontend 빌드 검사

통합 테스트에 포함되는 항목은 다음과 같습니다.

- Java PostgreSQL mapper/auth/claim SQL 테스트
- Node PostgreSQL 기반 job lock, retry, deduplication 테스트
- Node Kafka DLQ 테스트

## 참고 사항

- 테스트 실행 전 의존성을 먼저 설치해야 합니다.
  - `hub-worker`에서 `npm ci`
  - `hub-api-erp/src/main/frontend`에서 `npm ci`
- Testcontainers가 임시 인프라를 생성하므로 Docker가 실행 가능한 상태여야 합니다.
- 통합 테스트 스크립트는 로컬 개발용 Docker Compose 스택을 시작하거나 종료하지 않습니다.
- `hub-api-erp`에는 Gradle Wrapper가 포함되어 있으므로 전역 Gradle 설치가 필요하지 않습니다.
