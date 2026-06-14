#!/usr/bin/env bash
# =====================================================================
# CouponFind — one-command deploy for any server (VPS / home PC / etc.)
#
# What it does:
#   1. Creates .env from .env.example (only if missing) and fills in STRONG
#      random secrets (JWT, APP_KEY, Meilisearch key, DB passwords).
#   2. Sets a production posture (APP_ENV=production, APP_DEBUG=false).
#   3. Builds + starts the whole Docker stack.
#   4. Waits for MySQL + Meilisearch to be healthy, then builds the search index.
#
# Requirements on the server: Docker + Docker Compose. Nothing else.
# Usage:
#   chmod +x deploy.sh && ./deploy.sh
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")"

# ---- 0. Pre-flight: Docker present? ----------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is not installed. Install it first:"
  echo "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: 'docker compose' plugin not found. Install Docker Compose v2."
  exit 1
fi

# ---- secret generators (work with or without openssl) ----------------
rand_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  elif command -v python3 >/dev/null 2>&1; then python3 -c "import secrets,sys;print(secrets.token_hex(int(sys.argv[1])))" "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}
rand_b64() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -base64 "$1"
  elif command -v python3 >/dev/null 2>&1; then python3 -c "import base64,os,sys;print(base64.b64encode(os.urandom(int(sys.argv[1]))).decode())" "$1"
  else head -c "$1" /dev/urandom | base64 | tr -d '\n'; fi
}
# DB passwords: alphanumeric only (safe in URLs / my.cnf / sed).
rand_pw() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 16
  else rand_hex 16; fi
}

# ---- 1. Create .env with strong secrets (first run only) -------------
if [ -f .env ]; then
  echo "[deploy] .env already exists — leaving it untouched."
else
  echo "[deploy] Creating .env from .env.example with fresh secrets ..."
  cp .env.example .env
  set_kv() { sed -i "s|^$1=.*|$1=$2|" .env; }
  set_kv JWT_SECRET "$(rand_hex 32)"
  set_kv APP_KEY "$(rand_b64 32)"
  set_kv MEILI_MASTER_KEY "$(rand_hex 24)"
  set_kv DB_PASSWORD "$(rand_pw)"
  set_kv DB_ROOT_PASSWORD "$(rand_pw)"
  # Production posture.
  set_kv APP_ENV production
  set_kv APP_DEBUG false
  echo "[deploy] Secrets generated. (AI / Stripe / Razorpay keys are optional — edit .env to add them.)"
fi

# ---- 2. Build + start ------------------------------------------------
echo "[deploy] Building & starting all services (first run takes a few minutes) ..."
docker compose up -d --build

# ---- 3. Wait for core services, then index ---------------------------
echo "[deploy] Waiting for MySQL + Meilisearch to become healthy ..."
for i in $(seq 1 60); do
  health="$(docker compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null || true)"
  if echo "$health" | grep -q "mysql healthy" && echo "$health" | grep -q "meilisearch healthy"; then
    echo "[deploy] Core services healthy."
    break
  fi
  sleep 5
done

echo "[deploy] Building the search index ..."
docker compose exec -T engine python cli.py sync \
  || echo "   (index sync will also run automatically on the engine's schedule)"

PORT="$(grep -E '^APP_PORT=' .env | cut -d= -f2 | tr -d '[:space:]')"; PORT="${PORT:-8080}"
cat <<EOF

============================================================
 CouponFind is UP  🚀
   App    ->  http://<your-server-ip>:${PORT}
   Admin  ->  /admin
   User   ->  /app

 SEEDED LOGINS (change immediately!):
   admin@couponfind.local / Admin@12345
   user@couponfind.local  / User@12345

 NEXT STEPS for a public launch:
   1) Log in as admin and CHANGE the password; delete the demo user.
   2) Put it behind HTTPS (Cloudflare Tunnel, or a domain + Caddy/nginx),
      then set COOKIE_SECURE=true in .env and: docker compose up -d
   3) (Optional) Add GROQ_API_KEY (free) for better scraping quality,
      and Stripe/Razorpay keys to enable paid plans.
   4) Add your Telegram channels / subreddits in Admin -> Coupon Sources.
============================================================
EOF
