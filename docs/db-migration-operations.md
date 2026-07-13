# DB Migration 운영 절차 초안

Easy Hub의 DB 스키마는 Flyway migration version으로 관리한다. 운영 DB와 로컬 DB의 데이터는 같을 필요가 없지만, 스키마 구조는 동일한 migration 이력으로 추적되어야 한다.

## Migration 디렉터리

| 경로 | 용도 | 실행 환경 |
| --- | --- | --- |
| `hub-api-erp/src/main/resources/db/migration` | 운영/개발 공통 스키마 migration | 모든 profile |
| `hub-api-erp/src/main/resources/db/dev-migration` | 로컬/개발 전용 seed 또는 보조 데이터 | `dev` profile |

운영 데이터, 주문 데이터, Job 결과, ERP 결과는 migration에 넣지 않는다. 공통 reference 데이터만 스키마와 강하게 결합된 경우 공통 migration에 포함할 수 있다.

## 파일명 규칙

날짜 기반 버전을 사용한다.

```text
VYYYYMMDD_NNN__description.sql
```

예시:

```text
V20260709_001__init_schema.sql
V20260709_002__create_job_outbox.sql
V20260710_001__create_order_normalization_tables.sql
```

하루에 여러 migration이 생기면 `_001`, `_002` 순서로 증가시킨다. 이미 배포된 migration 파일은 수정하지 않고 새 migration을 추가한다.

## Profile별 Flyway 실행 방식

공통 설정인 `application.yml`은 `classpath:db/migration`만 실행한다. 따라서 운영/기본 환경은 schema migration만 적용한다.

`application-dev.yml`은 다음 위치를 함께 실행한다.

```yaml
spring:
  flyway:
    locations: classpath:db/migration,classpath:db/dev-migration
```

따라서 dev profile에서는 공통 schema migration 이후 개발 전용 migration이 이어서 적용된다.

## 빈 DB 배포 검증 명령

EC2 dev 배포 또는 로컬 full compose 검증 전, 필요한 경우 `.env.dev`를 준비한 뒤 자동 검증 스크립트를 실행한다.

```bash
./scripts/verify-empty-db-compose.sh
```

기본 실행은 `down -v` 위험 경고와 확인 입력을 요구한다. CI나 명시적인 검증에서는 다음처럼 확인을 생략할 수 있다.

```bash
./scripts/verify-empty-db-compose.sh --yes
```

스크립트는 아래 흐름을 자동으로 검증한다.

1. `docker compose down -v`
2. `docker compose up -d --build`
3. PostgreSQL/Kafka healthcheck
4. API/Worker 기동 상태
5. hub-api Flyway 성공 로그
6. `/api/admin/db-migrations`의 `schemaUpToDate=true`

수동 확인이 필요하면 같은 compose 기준으로 아래 명령을 사용할 수 있다.

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev down -v
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev up -d --build
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev ps
```

확인 항목:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev logs hub-api
```

로그에서 다음 성격의 메시지를 확인한다.

```text
Successfully validated ... migration
Migrating schema "public" to version ...
Successfully applied ... migration
```

PostgreSQL에서 Flyway history를 확인한다.

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select version, description, script, success from flyway_schema_history order by installed_rank;"
```

## Migration 상태 API

API:

```http
GET /api/admin/db-migrations
```

응답은 현재 DB version, 애플리케이션에 포함된 최신 known version, pending/failed count, migration 목록을 포함한다. 운영 화면의 `DB Migration 현황` 메뉴에서 같은 정보를 볼 수 있다.

## 기존 SchemaInitializer 처리

런타임 schema 생성 책임은 Flyway로 이동한다. 기존 Java `*SchemaInitializer`는 `legacy-schema-init` profile에서만 Bean으로 등록되며, 기본 dev/prod 실행에서는 동작하지 않는다.

임시로 legacy initializer를 실행해야 하는 특수 상황이 아니라면 `legacy-schema-init` profile을 운영 배포에 포함하지 않는다.

## 운영 절차

1. DB 구조 변경은 새 Flyway SQL로 작성한다.
2. 실제 데이터 seed, 주문/Job/ERP 결과 데이터는 migration에 넣지 않는다.
3. 로컬 또는 임시 DB에서 `docker compose ... down -v` 후 빈 DB 기동을 검증한다.
4. `/api/admin/db-migrations`에서 pending/failed 상태를 확인한다.
5. EC2 배포 후 `flyway_schema_history`와 hub-api 로그를 확인한다.
6. 운영 배포된 migration 파일은 수정하지 않는다. 수정이 필요하면 다음 버전 migration을 추가한다.

## 장애 대응 메모

- `flyway_schema_history`에 failed migration이 있으면 원인 SQL을 먼저 고친 뒤 DB 상태를 확인한다.
- 운영 DB에서 임의로 `repair` 또는 history 삭제를 수행하지 않는다.
- 기존 DB에 처음 Flyway를 붙이는 경우 `baseline-on-migrate` 설정과 현재 스키마 상태를 사전에 확인한다.
- Worker는 Flyway schema가 준비될 때까지 대기해야 하며, 기본 실행 경로에서 테이블을 직접 생성하지 않는다.

## Job 처리 권한 Fencing migration

`V20260713_001__add_job_processing_attempt_fencing.sql`은 `hub_job`에 처리 시도와 lease/fencing 정보를 추가한다. 기존 row에는 nullable 처리 권한 컬럼과 `fencing_token=0` 기본값이 적용되므로 기존 데이터가 있어도 migration이 가능하다.

배포 후 확인:

```sql
SELECT version, description, success
FROM flyway_schema_history
WHERE version = '20260713.001';

SELECT processing_attempt_id, claimed_by, lease_until, fencing_token
FROM hub_job
WHERE status = 'PROCESSING';
```

Worker의 기본 lease는 `JOB_LEASE_MINUTES=30`이며 운영/개발 compose에 같은 값을 사용한다. 상세한 보장 범위와 Recovery 운영 방식은 [Job 처리 권한 Fencing](./job-processing-fencing.md)을 참고한다.
