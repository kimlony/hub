#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.dev"
YES=false
TIMEOUT_SECONDS=300

usage() {
  cat <<USAGE
Usage: ./scripts/verify-empty-db-compose.sh [--yes] [--env-file PATH] [--timeout SECONDS]

Verifies the EC2 dev Docker Compose stack from an empty PostgreSQL volume.
This command runs docker compose down -v and deletes compose-managed volumes.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)
      YES=true
      shift
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.server.yml" -f "$ROOT_DIR/docker-compose.dev.yml" --env-file "$ENV_FILE")
SERVICES=(postgres kafka hub-api hub-worker-consumer hub-worker-http hub-worker-recovery)

compose() {
  "${COMPOSE[@]}" "$@"
}

print_diagnostics() {
  echo
  echo "[diagnostics] docker compose ps" >&2
  compose ps >&2 || true
  for service in "${SERVICES[@]}"; do
    echo >&2
    echo "[diagnostics] logs: $service" >&2
    compose logs --tail=160 "$service" >&2 || true
  done
}

on_error() {
  local line="$1"
  echo >&2
  echo "Verification failed near line $line." >&2
  print_diagnostics
}
trap 'on_error $LINENO' ERR

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 2
  fi
}

container_ids() {
  compose ps -q "$1"
}

container_health() {
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{if .State.Running}}running{{else}}stopped{{end}}{{end}}' "$1"
}

container_running() {
  docker inspect -f '{{.State.Running}}' "$1"
}

wait_for_health() {
  local service="$1"
  local expected="$2"
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  echo "Waiting for $service to be $expected..."
  while (( SECONDS < deadline )); do
    local ids
    ids="$(container_ids "$service" || true)"
    if [[ -n "$ids" ]]; then
      local all_ready=true
      local id status
      for id in $ids; do
        status="$(container_health "$id")"
        if [[ "$status" != "$expected" ]]; then
          all_ready=false
          break
        fi
      done
      if [[ "$all_ready" == "true" ]]; then
        echo "$service is $expected."
        return 0
      fi
    fi
    sleep 3
  done
  echo "Timed out waiting for $service to be $expected." >&2
  return 1
}

wait_for_running() {
  local service="$1"
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  echo "Waiting for $service to be running..."
  while (( SECONDS < deadline )); do
    local ids
    ids="$(container_ids "$service" || true)"
    if [[ -n "$ids" ]]; then
      local all_running=true
      local id running
      for id in $ids; do
        running="$(container_running "$id")"
        if [[ "$running" != "true" ]]; then
          all_running=false
          break
        fi
      done
      if [[ "$all_running" == "true" ]]; then
        echo "$service is running."
        return 0
      fi
    fi
    sleep 3
  done
  echo "Timed out waiting for $service to be running." >&2
  return 1
}

require_command docker
require_command curl

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  echo "Create it from .env.dev.example before running this verification." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

API_PORT="${HUB_API_PORT:-3000}"
API_URL="http://localhost:${API_PORT}"

if [[ "$YES" != "true" ]]; then
  cat <<WARNING
WARNING: This verification runs:
  docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file $ENV_FILE down -v

It will remove Docker Compose containers, networks, and volumes for this project,
including the PostgreSQL data volume used by this compose stack.
WARNING
  read -r -p 'Type YES to continue: ' answer
  if [[ "$answer" != "YES" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "[1/10] Removing compose stack and volumes..."
compose down -v

echo "[2/10] Building and starting compose stack..."
compose up -d --build

echo "[3/10] Waiting for postgres healthy..."
wait_for_health postgres healthy

echo "[4/10] Waiting for kafka healthy..."
wait_for_health kafka healthy

echo "[5/10] Waiting for hub-api healthy..."
wait_for_health hub-api healthy

echo "[6/10] Waiting for hub-worker-consumer running..."
wait_for_running hub-worker-consumer

echo "[7/10] Waiting for hub-worker-http running..."
wait_for_running hub-worker-http

echo "[8/10] Waiting for hub-worker-recovery running..."
wait_for_running hub-worker-recovery

echo "[9/10] Checking hub-api Flyway logs..."
api_logs="$(compose logs --no-color hub-api)"
if ! printf '%s' "$api_logs" | grep -Eq 'Successfully applied [0-9]+ migrations?'; then
  echo "Flyway success log was not found in hub-api logs." >&2
  exit 1
fi

echo "[10/10] Checking DB migration status API..."
login_response="$(curl -fsS -H 'Content-Type: application/json' -d '{"username":"demo","password":"password"}' "$API_URL/api/auth/login")"
token="$(printf '%s' "$login_response" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
if [[ -z "$token" ]]; then
  echo "Could not extract JWT token from login response." >&2
  echo "$login_response" >&2
  exit 1
fi
migration_response="$(curl -fsS -H "Authorization: Bearer $token" "$API_URL/api/admin/db-migrations")"
printf '%s\n' "$migration_response"
if ! printf '%s' "$migration_response" | grep -q '"schemaUpToDate":true'; then
  echo "schemaUpToDate=true was not found in migration status response." >&2
  exit 1
fi

echo
printf 'Empty DB compose verification succeeded. API: %s\n' "$API_URL"