# 테스트 가이드

이 문서는 Easy Hub에서 사용하는 로컬 테스트 명령과 GitHub Actions 자동화를 정리합니다.

모든 스크립트 명령은 저장소 루트(`C:\Users\Scrap-2\bizbee-hub`)에서 실행하는 것을 기준으로 합니다.

## 테스트 그룹

| 그룹 | 범위 | 명령 |
| --- | --- | --- |
| 빠른 검증 | Java 단위 테스트, Node 단위 테스트, TypeScript check, Worker build, Frontend build | `powershell -ExecutionPolicy Bypass -File scripts/test-fast.ps1` |
| 통합 검증 | Java PostgreSQL 통합 테스트, Node PostgreSQL/Kafka 통합 테스트 | `powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1` |

빠른 검증은 코드 변경마다 실행하는 기준이고, 통합 검증은 병합 전 또는 수동 확인 기준입니다.

## 빠른 검증

```powershell
cd C:\Users\Scrap-2\bizbee-hub
powershell -ExecutionPolicy Bypass -File scripts/test-fast.ps1
```

실행 항목:

1. `hub-api-erp` Java unit test
2. `hub-worker` TypeScript check
3. `hub-worker` Node unit test
4. `hub-worker` build
5. `hub-api-erp/src/main/frontend` frontend build

Java만 따로 확인하려면:

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp
.\gradlew.bat test
```

Worker만 따로 확인하려면:

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-worker
npm run check
npm test
npm run build
```

Frontend만 따로 확인하려면:

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp\src\main\frontend
npm run build
```

## 통합 검증

```powershell
cd C:\Users\Scrap-2\bizbee-hub
powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1
```

통합 테스트는 Testcontainers 기반 임시 인프라를 사용합니다.

- Java DB 통합 테스트는 격리된 PostgreSQL 컨테이너를 사용합니다.
- Node 통합 테스트는 격리된 PostgreSQL/Kafka 컨테이너를 사용합니다.
- 로컬 Docker Compose의 PostgreSQL/Kafka 데이터는 사용하지 않습니다.

개별 Java 통합 테스트:

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp
$env:RUN_DB_INTEGRATION_TESTS = "true"
.\gradlew.bat test --tests "*IntegrationTest"
```

개별 Node 통합 테스트:

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-worker
npm run test:integration
```

## GitHub Actions

### Fast CI

`.github/workflows/ci.yml`

실행 조건:

- `main`, `develop`, `feature/**`, `codex/**` 브랜치 push
- `main`, `develop` 대상 pull request

실행 내용:

- Java 17 설정
- Node.js 20 설정
- Worker dependency 설치
- Frontend dependency 설치
- `scripts/test-fast.ps1` 실행

### Integration Tests

`.github/workflows/integration-tests.yml`

실행 조건:

- GitHub Actions 화면에서 수동 실행

실행 내용:

- Java DB 통합 테스트
- Node DB/Kafka 통합 테스트
- Testcontainers로 임시 PostgreSQL/Kafka 생성

수동 실행 방법:

1. GitHub 저장소로 이동
2. `Actions` 탭 선택
3. `Integration Tests` workflow 선택
4. `Run workflow` 클릭

## 환경 조건

- Java 17 필요
- Node.js/npm 필요
- 통합 테스트는 Docker가 실행 가능한 상태여야 함
- `hub-api-erp`는 Gradle Wrapper를 사용하므로 전역 Gradle 설치는 필요 없음

로컬 터미널에서 Java를 못 찾으면:

```powershell
$env:JAVA_HOME="C:\Users\Scrap-2\.jdks\ms-21.0.10"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

## 리팩토링 후 확인 포인트

패키지 루트는 `hub`입니다.

- main class: `hub.BizbeeHubApplication`
- MyBatis type aliases: `hub`
- mapper namespace 예: `hub.job.mapper.HubJobMapper`

패키지 구조 변경 후에는 최소한 다음 순서로 확인합니다.

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp
.\gradlew.bat compileJava
.\gradlew.bat compileTestJava
```

그 다음 저장소 루트에서 fast/integration 스크립트를 실행합니다.
