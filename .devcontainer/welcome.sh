#!/usr/bin/env bash
# Printed every time you attach to the Codespace terminal.
cat <<'EOF'

  Welcome to CouponFind 👋  (full stack: PHP + MySQL + Redis + Meilisearch + Python)

  To launch everything in one go:
      bash .devcontainer/start.sh

  Or manually:
      docker compose up --build           # start all services
      docker compose exec engine python cli.py sync   # build search index

  Then open the forwarded port 8080 (see the "Ports" tab) in your browser.

  Demo logins:
      Admin -> admin@couponfind.local / Admin@12345   (visit /admin)
      User  -> user@couponfind.local  / User@12345    (visit /app)

EOF
