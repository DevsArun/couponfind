-- ---------------------------------------------------------------------
-- 002 — Multi-source coupon ingestion
-- Adds new coupon_sources.type values so the engine can scrape coupons from
-- Telegram channels, Reddit/deal forums and arbitrary web pages — not just
-- RSS/sitemaps/offer pages.
--
-- Fresh installs already get these via 001 (the ENUM there was updated too).
-- For an EXISTING database, run this once:
--   docker compose exec -T mysql sh -c \
--     'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" couponfind' < database/migrations/002_add_source_types.sql
-- (ALTER ... MODIFY is safe to re-run.)
-- ---------------------------------------------------------------------

ALTER TABLE coupon_sources
    MODIFY COLUMN type ENUM(
        'offer_page','promo_page','rss','sitemap','newsletter','user_submission',
        'telegram','reddit','forum','webpage'
    ) NOT NULL;
