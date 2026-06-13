#!/usr/bin/env bash
# One-command launcher: builds + starts the whole stack, then builds the
# Meilisearch index from the seeded coupons so search works immediately.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Waiting for the Docker daemon to be ready..."
for i in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "==> Building & starting all services (this takes a few minutes the first time)..."
docker compose up -d --build

echo "==> Waiting for MySQL + Meilisearch to become healthy..."
# Give the dependencies time to pass their healthchecks.
for i in $(seq 1 60); do
  if docker compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | grep -q "mysql healthy" \
     && docker compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | grep -q "meilisearch healthy"; then
    echo "==> Core services are healthy."
    break
  fi
  sleep 5
done

echo "==> Building the search index from seeded coupons..."
docker compose exec -T engine python cli.py sync || \
  echo "   (index sync will also run automatically on the engine's schedule)"

echo ""
echo "============================================================"
echo " CouponFind is up!"
echo "   App   -> open the forwarded port 8080 (Ports tab)"
echo "   Admin -> /admin   (admin@couponfind.local / Admin@12345)"
echo "   User  -> /app     (user@couponfind.local  / User@12345)"
echo "============================================================"
