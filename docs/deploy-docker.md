# Docker Compose 배포 가이드

이 문서는 운영 서버 한 대에서 Easy Hub 전체 서비스를 Docker Compose로 실행하기 위한 기준을 정리합니다. 기존 로컬 개발 방식은 유지하고, 서버 배포용 실행은 별도 compose 파일 조합을 사용합니다.

## 구성 원칙

- 기존 `docker-compose.yml`은 로컬 개발용으로 유지합니다.
- 기존 로컬 개발 명령 `docker compose up -d`는 계속 PostgreSQL, Kafka, Worker consumer, Worker recovery, Worker http만 실행합니다.
- Hub API를 포함한 전체 Docker 실행은 `docker-compose.server.yml`과 환경별 override 파일을 사용합니다.
- Nginx는 1차 배포 구성에 포함하지 않습니다. EC2 dev 배포 성공 후 선택적으로 적용합니다.
- 실제 `.env.local`, `.env.dev`, `.env.prod` 파일은 커밋하지 않습니다. 저장소에는 `.env.*.example` 파일만 둡니다.

## 파일 역할

| 파일 | 역할 |
| --- | --- |
| `docker-compose.yml` | 기존 로컬 개발용 compose. 변경 없이 유지 |
| `docker-compose.server.yml` | 서버 배포용 공통 서비스 정의 |
| `docker-compose.full-local.yml` | Hub API까지 Docker로 띄우는 전체 로컬 검증용 override |
| `docker-compose.dev.yml` | EC2 dev 서버용 override. Hub API `3000:3000` 직접 노출 |
| `docker-compose.prod.yml` | 운영 서버용 override. 외부 포트 노출 최소화 |
| `docker-compose.nginx.yml` | 선택 Nginx reverse proxy compose |
| `nginx/default.conf.example` | 선택 Nginx 설정 예시 |

## 1. 기존 로컬 개발 실행

Hub API는 IntelliJ 또는 Gradle로 직접 실행하고, 인프라와 Worker만 Docker로 실행하는 기존 방식입니다.

```powershell
docker compose up -d
```

실행 대상:

- PostgreSQL
- Kafka
- Worker consumer
- Worker recovery
- Worker http

기존 compose는 로컬 개발 편의를 위해 PostgreSQL, Kafka, Worker http 포트를 노출합니다.

## 2. Hub API까지 포함한 전체 로컬 Docker 검증

전체 서비스를 Docker로 띄워보고 싶을 때만 사용합니다.

```powershell
Copy-Item .env.local.example .env.local
docker compose -f docker-compose.server.yml -f docker-compose.full-local.yml --env-file .env.local up -d --build
```

로컬 검증용 override는 다음 포트를 노출합니다.

- Hub API: `3000`
- PostgreSQL: `5432`
- Kafka: `9092`
- Worker http: `4000`

## 3. EC2 dev 서버 실행

1차 목표는 Nginx 없이 Hub API를 `3000` 포트로 직접 노출해 배포를 확인하는 것입니다. PostgreSQL과 Kafka는 외부에 직접 노출하지 않습니다.

```bash
cp .env.dev.example .env.dev
vi .env.dev
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev up -d --build
```

EC2 보안 그룹에서는 1차 검증 단계에서 `3000` 포트를 허용합니다.

정상 확인 예:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev ps
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev logs -f hub-api
```

브라우저에서 다음 주소를 확인합니다.

```text
http://{EC2_PUBLIC_IP}:3000
```

## 4. 운영 서버 실행

운영 override는 Hub API, PostgreSQL, Kafka, Worker http 포트를 기본으로 외부에 노출하지 않습니다. 실제 외부 접근은 Nginx 또는 별도 reverse proxy를 붙이는 구성을 권장합니다.

```bash
cp .env.prod.example .env.prod
vi .env.prod
docker compose -f docker-compose.server.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## 5. Nginx 선택 적용

EC2 dev에서 Hub API `3000` 직접 노출로 먼저 배포를 검증한 뒤 Nginx를 붙입니다.

권장 순서:

1. Nginx 없이 Hub API `3000` 포트로 먼저 배포 검증
2. 서비스 정상 확인
3. `docker-compose.nginx.yml` 추가 실행
4. EC2 보안 그룹에서 `3000` 포트를 닫고 `80` 포트만 허용

Nginx 실행 예:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml -f docker-compose.nginx.yml --env-file .env.dev up -d --build
```

Nginx 적용 후 확인:

```text
http://{EC2_PUBLIC_IP}
```

Nginx 설정 예시는 `nginx/default.conf.example`에 있습니다. 운영에서 TLS가 필요하면 별도 인증서/HTTPS 설정을 추가해야 합니다.

## 6. 환경변수 파일 작성

예시 파일을 복사한 뒤 실제 값으로 수정합니다.

```bash
cp .env.dev.example .env.dev
```

반드시 바꿔야 하는 값:

- `POSTGRES_PASSWORD`
- `HUB_API_KEY`
- `HUB_JWT_SECRET`
- `HUB_AES_SECRET`
- 외부 쇼핑몰 API 관련 key 또는 endpoint

주의:

- `HUB_AES_SECRET`은 정확히 32 bytes여야 합니다.
- 실제 `.env.dev`, `.env.prod`는 커밋하지 않습니다.
- `POSTGRES_URL`은 서버 compose 내부에서는 `jdbc:postgresql://postgres:5432/hub_db` 형식을 사용합니다.
- Worker의 `POSTGRES_HOST`는 `postgres`, `KAFKA_BROKERS`는 `kafka:9092`를 사용합니다.

## 7. 로그 확인

dev:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev logs -f hub-api
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev logs -f hub-worker-consumer
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev logs -f hub-worker-recovery
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev logs -f kafka
```

prod:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.prod.yml --env-file .env.prod logs -f hub-api
```

## 8. 서비스 중지

dev:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev down
```

prod:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.prod.yml --env-file .env.prod down
```

볼륨까지 삭제하는 명령은 운영 데이터가 삭제될 수 있으므로 주의합니다.

```bash
docker compose -f docker-compose.server.yml -f docker-compose.prod.yml --env-file .env.prod down -v
```

## 9. 문제 해결

### Hub API 컨테이너가 바로 종료될 때

환경변수 누락을 확인합니다.

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev logs hub-api
```

특히 다음 값이 필요합니다.

- `POSTGRES_PASSWORD`
- `HUB_API_KEY`
- `HUB_JWT_SECRET`
- `HUB_AES_SECRET`

### `HUB_AES_SECRET` 오류

`HUB_AES_SECRET`은 정확히 32 bytes여야 합니다. 한글이나 특수 문자를 섞으면 byte 길이가 예상과 다를 수 있으므로 ASCII 더미값 또는 운영 secret을 사용합니다.

### PostgreSQL 연결 실패

서버 compose 내부에서는 DB host가 `localhost`가 아니라 `postgres`입니다.

```env
POSTGRES_URL=jdbc:postgresql://postgres:5432/hub_db
POSTGRES_HOST=postgres
```

### Kafka 연결 실패

서버 compose 내부에서는 Kafka broker가 `kafka:9092`입니다.

```env
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
KAFKA_BROKERS=kafka:9092
```

### dev 서버에서 화면이 열리지 않을 때

1차 dev 구성은 Hub API만 `3000:3000`으로 노출합니다. EC2 보안 그룹에서 `3000` 포트가 열려 있는지 확인합니다.

Nginx 적용 후에는 보안 그룹에서 `3000`을 닫고 `80`만 허용합니다.

### API healthcheck

현재 Hub API에는 별도 `/health` 또는 Actuator health endpoint를 추가하지 않았습니다. 이번 작업 범위에서는 코드 변경 없이 Docker 구성을 우선 정리했습니다. 추후 운영 안정성을 높이려면 인증 없이 확인 가능한 `/health` endpoint 또는 Spring Boot Actuator 도입을 검토할 수 있습니다.
