#!/usr/bin/env bash
# Runs every time the Codespace STARTS or RESUMES (postStartCommand).
# Brings the whole stack back up (without rebuilding) so the forwarded
# port 8080 works immediately — even after the Codespace was stopped.
set -uo pipefail

cd "$(dirname "$0")/.."

echo "[resume] Waiting for the Docker daemon to be ready..."
for i in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 2
done

if ! docker info >/dev/null 2>&1; then
  echo "[resume] Docker daemon not ready yet. Run 'bash .devcontainer/start.sh' manually."
  exit 0
fi

echo "[resume] Starting CouponFind services..."
# `up -d` will also build any image that doesn't exist yet, so this works on
# a fresh boot too. Fall back to an explicit build if a plain up fails.
docker compose up -d || docker compose up -d --build

echo "[resume] CouponFind is up — open the forwarded port 8080 (Ports tab)."
