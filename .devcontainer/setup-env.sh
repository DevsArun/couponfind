#!/usr/bin/env bash
# Runs once when the Codespace is created.
# Creates .env from the example and fills in strong random secrets so the
# stack boots securely without any manual editing.
set -euo pipefail

# Move to the repo root (this script lives in .devcontainer/)
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo "[setup-env] .env already exists — leaving it untouched."
  exit 0
fi

echo "[setup-env] Creating .env from .env.example ..."
cp .env.example .env

# --- secret generators (work with or without openssl) ---
rand_hex() {  # $1 = number of bytes
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import secrets,sys; print(secrets.token_hex(int(sys.argv[1])))" "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}
rand_b64() {  # $1 = number of bytes
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$1"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import base64,os,sys; print(base64.b64encode(os.urandom(int(sys.argv[1]))).decode())" "$1"
  else
    head -c "$1" /dev/urandom | base64 | tr -d '\n'
  fi
}

# base64/hex alphabets never contain the '|' sed delimiter or '&', so these
# substitutions are safe.
JWT_SECRET="$(rand_hex 32)"
APP_KEY="$(rand_b64 32)"
MEILI_MASTER_KEY="$(rand_hex 24)"

sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
sed -i "s|^APP_KEY=.*|APP_KEY=${APP_KEY}|" .env
sed -i "s|^MEILI_MASTER_KEY=.*|MEILI_MASTER_KEY=${MEILI_MASTER_KEY}|" .env

echo "[setup-env] Done. Secrets generated for JWT_SECRET, APP_KEY, MEILI_MASTER_KEY."
echo "[setup-env] (AI / Stripe / Razorpay keys are optional and left blank — the app runs fine without them.)"
