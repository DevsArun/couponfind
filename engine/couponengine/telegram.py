"""Telegram public-channel discovery.

Scrapes the PUBLIC web preview of a Telegram channel
(https://t.me/s/<channel>) — no API key, bot token, or login required. Works
for any public channel/group that exposes a web preview. Each recent message
becomes a candidate; the extractor then pulls codes/discounts and the AI layer
refines them.

The source URL may be given in any of these forms (stored in coupon_sources.url):
    https://t.me/s/dealschannel
    https://t.me/dealschannel
    t.me/dealschannel
    @dealschannel
    dealschannel
"""
from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from .crawler import fetch

log = logging.getLogger("couponengine.telegram")

_WS = re.compile(r"\s+")


def channel_handle(url: str) -> str | None:
    """Extract a bare channel handle from any accepted URL form."""
    s = (url or "").strip()
    if not s:
        return None
    if s.startswith("@"):
        return s[1:].split("/")[0] or None
    if "t.me/" in s or "telegram.me/" in s:
        path = urlparse(s if "://" in s else "https://" + s).path.strip("/")
        if path.startswith("s/"):
            path = path[2:]
        handle = path.split("/")[0]
        return handle or None
    # Bare handle like "dealschannel"
    if re.fullmatch(r"[A-Za-z0-9_]{3,64}", s):
        return s
    return None


def discover(url: str) -> list[dict]:
    """Return recent channel messages as raw candidate entries."""
    handle = channel_handle(url)
    if not handle:
        log.info("telegram: could not parse channel from %s", url)
        return []

    preview = f"https://t.me/s/{handle}"
    # Telegram's robots.txt blocks bots broadly, but /s/ is a public preview
    # meant for embedding/sharing, so we fetch it directly.
    html = fetch(preview, respect_robots=False)
    if not html:
        log.info("telegram: no preview for %s", handle)
        return []

    out: list[dict] = []
    soup = BeautifulSoup(html, "lxml")
    for msg in soup.select(".tgme_widget_message")[:60]:
        text_el = msg.select_one(".tgme_widget_message_text")
        if not text_el:
            continue
        text = _WS.sub(" ", text_el.get_text(" ")).strip()
        if not text:
            continue

        post = msg.get("data-post")
        post_url = f"https://t.me/{post}" if post else preview

        # Prefer an outbound (non-telegram) link in the message as the landing URL.
        landing = post_url
        for a in text_el.find_all("a", href=True):
            href = a["href"]
            if href.startswith("http") and "t.me/" not in href and "telegram.me/" not in href:
                landing = href
                break

        out.append({"url": landing, "title": text[:120], "text": text[:1500]})

    log.info("telegram @%s -> %d messages", handle, len(out))
    return out
