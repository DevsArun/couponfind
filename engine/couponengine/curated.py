"""Curated starter-coupons importer.

Populates the catalog with hand-picked, honest merchant offers so the site has
real, browseable coupons BEFORE affiliate networks are connected. This is the
reliable "cold start" path: it does not depend on crawling, AI structuring or
external feeds being available.

- Source of truth: engine/data/curated_coupons.json (owner-editable)
- Idempotent: safe to run repeatedly (matched on content_hash)
- Imports coupons directly as status='active', records a 'manual' validation,
  recomputes scores, and pushes to Meilisearch so they appear in search.

Run it with:  python cli.py seed-curated
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

from . import meili_sync, ranking
from .db import db
from .deduplicator import content_hash
from .importer import slugify

log = logging.getLogger("couponengine.curated")

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "curated_coupons.json"


def _load(path: str | None = None) -> list[dict]:
    p = Path(path) if path else DEFAULT_PATH
    if not p.is_file():
        log.warning("curated dataset not found: %s", p)
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("failed to parse curated dataset %s: %s", p, exc)
        return []
    if isinstance(data, list):
        return data
    return data.get("merchants", []) if isinstance(data, dict) else []


def _ensure_merchant(m: dict) -> int:
    slug = (m.get("slug") or slugify(m["name"]))[:120]
    row = db().first("SELECT id FROM merchants WHERE slug=%s LIMIT 1", (slug,))
    if row:
        db().execute(
            "UPDATE merchants SET name=%s, domain=COALESCE(%s,domain), website_url=COALESCE(%s,website_url), "
            "category=COALESCE(%s,category), country=COALESCE(%s,country), is_active=1 WHERE id=%s",
            (m["name"][:150], m.get("domain"), m.get("website_url"), m.get("category"),
             m.get("country"), row["id"]),
        )
        return int(row["id"])
    return db().insert(
        "INSERT INTO merchants (slug, name, domain, website_url, category, country, popularity, is_active) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,1)",
        (slug, m["name"][:150], m.get("domain"), m.get("website_url"), m.get("category"),
         m.get("country"), int(m.get("popularity", 100))),
    )


def _valid_until(days) -> str | None:
    if days is None:
        return None
    try:
        return (datetime.utcnow() + timedelta(days=int(days))).strftime("%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return None


def run(path: str | None = None, sync: bool = True) -> dict:
    groups = _load(path)
    stats = {"merchants": 0, "coupons": 0, "inserted": 0, "updated": 0}

    for g in groups:
        if not g.get("name"):
            continue
        merchant_id = _ensure_merchant(g)
        slug = (g.get("slug") or slugify(g["name"]))[:120]
        stats["merchants"] += 1

        for off in g.get("offers", []):
            if not off.get("title"):
                continue
            coupon = {
                "title": off["title"],
                "description": off.get("description"),
                "code": off.get("code"),
                "type": off.get("type", "deal"),
                "discount_type": off.get("discount_type", "other"),
                "discount_value": off.get("discount_value"),
                "landing_url": off.get("landing_url") or g.get("website_url"),
            }
            chash = content_hash(slug, coupon)
            vu = _valid_until(off.get("valid_days", 60))
            featured = 1 if off.get("featured") else 0
            stats["coupons"] += 1

            existing = db().first("SELECT id FROM coupons WHERE content_hash=%s LIMIT 1", (chash,))
            if existing:
                cid = int(existing["id"])
                db().execute(
                    "UPDATE coupons SET title=%s, description=%s, code=%s, type=%s, discount_type=%s, "
                    "discount_value=%s, landing_url=%s, status='active', is_featured=%s, valid_until=%s, "
                    "last_seen_at=NOW() WHERE id=%s",
                    (coupon["title"][:255], coupon["description"], coupon["code"], coupon["type"],
                     coupon["discount_type"], coupon["discount_value"], coupon["landing_url"],
                     featured, vu, cid),
                )
                stats["updated"] += 1
            else:
                cid = db().insert(
                    "INSERT INTO coupons (merchant_id, source_id, content_hash, title, description, code, type, "
                    "discount_type, discount_value, landing_url, status, is_featured, valid_until, last_seen_at) "
                    "VALUES (%s,NULL,%s,%s,%s,%s,%s,%s,%s,%s,'active',%s,%s,NOW())",
                    (merchant_id, chash, coupon["title"][:255], coupon["description"], coupon["code"],
                     coupon["type"], coupon["discount_type"], coupon["discount_value"],
                     coupon["landing_url"], featured, vu),
                )
                stats["inserted"] += 1

            # Record a manual validation so these read as verified, curated offers.
            db().insert(
                "INSERT INTO coupon_validations (coupon_id, method, result, confidence, detail) "
                "VALUES (%s,'manual','valid',0.90,'Curated starter offer')",
                (cid,),
            )

    # Recompute scores and push to search so curated coupons surface immediately.
    try:
        ranking.run()
    except Exception as exc:  # pragma: no cover
        log.warning("ranking after curated import failed: %s", exc)
    if sync:
        try:
            meili_sync.run()
        except Exception as exc:  # pragma: no cover
            log.warning("meili sync after curated import failed: %s", exc)

    log.info("curated import: %s", stats)
    return stats
