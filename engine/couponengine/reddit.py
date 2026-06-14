"""Reddit subreddit discovery via the public JSON endpoint (no auth required).

Deal/coupon subreddits (r/coupons, r/deals, r/buildapcsales, ...) expose a
public JSON listing. We read the newest posts and turn each into a candidate;
the extractor pulls codes/discounts and the AI layer refines them.

The source URL may be given as:
    https://www.reddit.com/r/coupons
    https://reddit.com/r/coupons/
    r/coupons
    coupons
"""
from __future__ import annotations

import logging
import re

import requests

from .config import config

log = logging.getLogger("couponengine.reddit")

_LIMIT = 50


def subreddit(url: str) -> str | None:
    s = (url or "").strip()
    if not s:
        return None
    m = re.search(r"r/([A-Za-z0-9_]{2,40})", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_]{2,40}", s):
        return s
    return None


def discover(url: str) -> list[dict]:
    sub = subreddit(url)
    if not sub:
        log.info("reddit: could not parse subreddit from %s", url)
        return []

    api = f"https://www.reddit.com/r/{sub}/new.json?limit={_LIMIT}"
    try:
        resp = requests.get(
            api,
            headers={"User-Agent": config().USER_AGENT, "Accept": "application/json"},
            timeout=config().REQUEST_TIMEOUT,
        )
        if resp.status_code >= 400:
            log.info("reddit r/%s -> HTTP %s", sub, resp.status_code)
            return []
        data = resp.json()
    except Exception as exc:  # pragma: no cover
        log.info("reddit fetch error r/%s: %s", sub, exc)
        return []

    out: list[dict] = []
    for child in (data.get("data", {}).get("children", []) or []):
        d = child.get("data", {}) if isinstance(child, dict) else {}
        title = (d.get("title") or "").strip()
        if not title:
            continue
        body = (d.get("selftext") or "").strip()
        permalink = d.get("permalink") or ""
        link = d.get("url_overridden_by_dest") or d.get("url") or (
            f"https://www.reddit.com{permalink}" if permalink else api
        )
        out.append({"url": link, "title": title[:120], "text": f"{title}. {body}"[:1500]})

    log.info("reddit r/%s -> %d posts", sub, len(out))
    return out
