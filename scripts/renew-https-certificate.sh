#!/usr/bin/env sh

# Run from the Docker Compose project root, for example via cron.
set -eu

nginx_container_name="${NGINX_CONTAINER_NAME:-hub-nginx-1}"
certbot_image="${CERTBOT_IMAGE:-certbot/certbot:latest}"

docker run --rm \
  -v "$PWD/certbot/conf:/etc/letsencrypt" \
  -v "$PWD/certbot/lib:/var/lib/letsencrypt" \
  -v "$PWD/certbot/log:/var/log/letsencrypt" \
  -v "$PWD/certbot/www:/var/www/certbot" \
  "$certbot_image" renew --quiet

# Certbot updates the certificate files in place; make Nginx load them.
docker exec "$nginx_container_name" nginx -s reload
