# Deploying CouponFind

CouponFind is a multi-service **Docker** app (nginx + PHP-FPM, MySQL, Redis,
Meilisearch, and a Python engine). You **cannot** just unzip it onto shared/cPanel
hosting — it needs a host that can run **Docker + Docker Compose** (a VPS, a home
PC/laptop, etc.). The good news: once Docker is there, it's basically one command.

## TL;DR — does it "just work" after copying the code?
No, but almost. You need to:
1. Have **Docker + Docker Compose** on the server.
2. Run **`./deploy.sh`** (creates `.env` with strong secrets, builds, starts, indexes).

That's it. The database schema + seed data load automatically on first boot, and
the engine imports curated starter coupons + builds the search index by itself.

---

## Option A — A real server (VPS, always-on)

```bash
# 1. Install Docker (Ubuntu/Debian example)
curl -fsSL https://get.docker.com | sh

# 2. Get the code (git clone OR upload + unzip)
git clone https://github.com/DevsArun/couponfind.git
cd couponfind

# 3. One command — sets up secrets, builds, starts, indexes
chmod +x deploy.sh
./deploy.sh
```

Open `http://<server-ip>:8080`. Done.

### Make it public + secure
- **HTTPS**: easiest is [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
  (`cloudflared tunnel --url http://localhost:8080`) — free, no extra server config.
  Or point a domain at the box and run Caddy/nginx for Let's Encrypt TLS.
- After HTTPS is live, set `COOKIE_SECURE=true` in `.env` then `docker compose up -d`.
- **Change the admin password** (login at `/admin`) and delete the demo user.

## Option B — No server / no card (free beta on your own PC)

```bash
./deploy.sh                                   # start the stack locally
cloudflared tunnel --url http://localhost:8080   # get a public https URL to share
```

Your PC must stay on while testers use it. Perfect for collecting early feedback.

---

## What runs automatically (no manual steps)
- **MySQL** runs the schema (`001`, `002`) + seed (`001_seed.sql`) on first boot.
- **Engine** cold-starts: imports curated coupons, validates, scores, and syncs
  them into Meilisearch — so search has results immediately.
- Add a coupon source in **Admin → Coupon Sources** and the engine crawls it
  within seconds (Telegram channels, subreddits, RSS, web pages).

## Optional keys (the app runs fine without them)
| Key | Enables |
|---|---|
| `GROQ_API_KEY` (free tier) | Better AI cleanup of scraped coupons |
| `STRIPE_*` / `RAZORPAY_*` | Paid plan checkout |
| SMTP settings | Password reset, contact form, email alerts |

## Useful commands
```bash
docker compose ps                 # service status
docker compose logs -f php        # backend logs
docker compose logs -f engine     # scraping/engine logs
docker compose exec engine python cli.py discover   # force a crawl now
docker compose exec engine python cli.py sync       # rebuild search index
docker compose down               # stop (data persists in volumes)
```
