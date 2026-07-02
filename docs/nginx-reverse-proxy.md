# Nginx Reverse Proxy 선택 적용 가이드

기본 EC2 dev 배포는 Nginx 없이 Hub API를 `3000` 포트로 직접 노출해 먼저 검증합니다. Nginx는 배포가 성공한 뒤 별도 단계로 적용합니다.

## 적용 순서

1. Nginx 없이 Hub API `3000` 포트로 먼저 배포 검증
2. 서비스 정상 확인
3. `docker-compose.nginx.yml` 추가 실행
4. EC2 보안 그룹에서 `3000` 포트를 닫고 `80` 포트만 허용

## 실행 예시

dev 서버 기준:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev up -d --build
```

Hub API 직접 접근 확인:

```text
http://{EC2_PUBLIC_IP}:3000
```

Nginx 추가 실행:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml -f docker-compose.nginx.yml --env-file .env.dev up -d --build
```

Nginx 접근 확인:

```text
http://{EC2_PUBLIC_IP}
```

## 설정 파일

기본 예시는 `nginx/default.conf.example`에 있습니다.

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://hub-api:3000;
    }
}
```

운영에서 HTTPS가 필요하면 인증서 발급, TLS 설정, `X-Forwarded-*` 헤더, 업로드 제한 등을 환경에 맞게 조정해야 합니다.
