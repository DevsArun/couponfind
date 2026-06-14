"""Lightweight in-process scheduler.

Runs the engine on fixed intervals (configurable via env) and continuously
drains the job queue created by the admin panel. This is the default command
the Docker `engine` service runs.
"""
from __future__ import annotations

import logging
import time

from . import meili_sync, pipeline, ranking, validator, worker
from .config import config
from .db import db

log = logging.getLogger("couponengine.scheduler")


def _engine_enabled() -> bool:
    """Admin kill-switch. The engine runs 24/7 by default; an admin can pause
    it from the panel (settings.engine_enabled = '0') for emergencies."""
    try:
        v = db().scalar("SELECT value FROM settings WHERE `key`='engine_enabled' LIMIT 1")
        return str(v) != "0"
    except Exception:
        return True


def run() -> None:
    cfg = config()
    log.info(
        "scheduler started (discovery=%dm validate=%dm sync=%dm)",
        cfg.SCHEDULE_DISCOVERY, cfg.SCHEDULE_VALIDATE, cfg.SCHEDULE_SYNC,
    )

    last_discovery = 0.0
    last_validate = 0.0
    last_sync = 0.0
    paused = False

    # Cold start: if the catalog is empty (e.g. fresh install, before any
    # affiliate feeds are connected), seed curated starter coupons so the site
    # has real, browseable deals immediately.
    try:
        total = db().scalar("SELECT COUNT(*) FROM coupons") or 0
        if int(total) == 0:
            from . import curated
            log.info("empty catalog detected — importing curated starter coupons")
            curated.run()
    except Exception as exc:  # pragma: no cover
        log.warning("curated cold-start skipped: %s", exc)

    # Ensure the index exists immediately on boot.
    try:
        meili_sync.ensure_index()
        meili_sync.run()
    except Exception as exc:  # pragma: no cover
        log.warning("initial sync skipped: %s", exc)

    while True:
        now = time.time()
        try:
            # Emergency kill-switch: pause all crawling/validation work.
            if not _engine_enabled():
                if not paused:
                    log.warning("engine PAUSED by admin (settings.engine_enabled=0)")
                    paused = True
                time.sleep(15)
                continue
            if paused:
                log.info("engine RESUMED by admin")
                paused = False

            # Always drain admin-dispatched jobs first (low latency).
            handled = worker.drain(max_jobs=20)
            if handled:
                log.info("drained %d queued job(s)", handled)

            if now - last_discovery >= cfg.SCHEDULE_DISCOVERY * 60:
                log.info("scheduled discovery run")
                pipeline.discover()
                ranking.run()
                last_discovery = now

            if now - last_validate >= cfg.SCHEDULE_VALIDATE * 60:
                log.info("scheduled validation run")
                validator.run()
                ranking.run()
                last_validate = now

            if now - last_sync >= cfg.SCHEDULE_SYNC * 60:
                log.info("scheduled meili sync")
                meili_sync.run()
                last_sync = now

        except Exception:  # pragma: no cover
            log.exception("scheduler tick error")

        time.sleep(15)
