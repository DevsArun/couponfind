<?php

declare(strict_types=1);

namespace CouponFind\Services\Affiliate;

use CouponFind\Core\Database;
use CouponFind\Repositories\MerchantRepository;
use CouponFind\Services\Meilisearch;
use CouponFind\Support\HttpException;

/**
 * Coordinates affiliate networks (Impact + any JSON-feed network), syncs their
 * coupons into our catalog (marked is_affiliate=1 with the affiliate deeplink
 * as landing_url), and indexes them straight into Meilisearch so they appear
 * in search immediately and rank above general coupons.
 */
final class AffiliateService
{
    private Database $db;
    private MerchantRepository $merchants;
    private Meilisearch $meili;

    public function __construct()
    {
        $this->db = Database::instance();
        $this->merchants = new MerchantRepository();
        $this->meili = new Meilisearch();
    }

    /** Create affiliate tables + columns on demand (safe on fresh & existing DBs). */
    public function ensureSchema(): void
    {
        $this->db->execute(
            'CREATE TABLE IF NOT EXISTS affiliate_networks (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                provider VARCHAR(40) NOT NULL,
                name VARCHAR(120) NOT NULL,
                config_json JSON NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                last_synced_at TIMESTAMP NULL,
                last_status VARCHAR(255) NULL,
                imported_count INT UNSIGNED NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $this->db->execute(
            'CREATE TABLE IF NOT EXISTS affiliate_clicks (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                coupon_id BIGINT UNSIGNED NULL,
                user_id BIGINT UNSIGNED NULL,
                ip VARCHAR(45) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_click_coupon (coupon_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        // Add coupon columns if an older DB is missing them.
        $col = (int) $this->db->scalar(
            "SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'coupons' AND column_name = 'is_affiliate'"
        );
        if ($col === 0) {
            $this->db->execute('ALTER TABLE coupons ADD COLUMN is_affiliate TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN affiliate_network VARCHAR(60) NULL');
        }
    }

    // ---- Network CRUD -----------------------------------------------------

    public function networks(): array
    {
        $this->ensureSchema();
        $rows = $this->db->all('SELECT id, provider, name, config_json, is_active, last_synced_at, last_status, imported_count, created_at FROM affiliate_networks ORDER BY id DESC');
        // Never leak secrets to the client — only echo which keys are set.
        foreach ($rows as &$r) {
            $cfg = json_decode((string) ($r['config_json'] ?? '{}'), true) ?: [];
            $r['config_keys'] = array_keys($cfg);
            $r['has_credentials'] = !empty($cfg);
            unset($r['config_json']);
        }
        unset($r);
        return $rows;
    }

    public function addNetwork(string $provider, string $name, array $config): int
    {
        $this->ensureSchema();
        return $this->db->insert(
            'INSERT INTO affiliate_networks (provider, name, config_json, is_active) VALUES (?,?,?,1)',
            [$provider, $name, json_encode($config, JSON_UNESCAPED_SLASHES)]
        );
    }

    public function updateNetwork(int $id, array $fields): void
    {
        $this->ensureSchema();
        $cur = $this->db->first('SELECT config_json FROM affiliate_networks WHERE id = ?', [$id]);
        if ($cur === null) {
            throw HttpException::notFound('Network not found');
        }
        $config = json_decode((string) ($cur['config_json'] ?? '{}'), true) ?: [];
        if (isset($fields['config']) && is_array($fields['config'])) {
            // Merge; blank values keep the existing secret.
            foreach ($fields['config'] as $k => $v) {
                if ($v !== '' && $v !== null) {
                    $config[$k] = $v;
                }
            }
        }
        $this->db->execute(
            'UPDATE affiliate_networks SET name = COALESCE(?, name), is_active = ?, config_json = ? WHERE id = ?',
            [$fields['name'] ?? null, (int) ($fields['is_active'] ?? 1), json_encode($config, JSON_UNESCAPED_SLASHES), $id]
        );
    }

    public function deleteNetwork(int $id): void
    {
        $this->ensureSchema();
        $this->db->execute('DELETE FROM affiliate_networks WHERE id = ?', [$id]);
    }

    // ---- Sync -------------------------------------------------------------

    /** Sync a single network. @return int imported count */
    public function sync(int $id): int
    {
        $this->ensureSchema();
        $net = $this->db->first('SELECT * FROM affiliate_networks WHERE id = ?', [$id]);
        if ($net === null) {
            throw HttpException::notFound('Network not found');
        }
        $config = json_decode((string) ($net['config_json'] ?? '{}'), true) ?: [];
        try {
            $coupons = match ($net['provider']) {
                'impact'     => ImpactAdapter::fetch($config),
                'awin'       => AwinAdapter::fetch($config),
                'cj'         => CjAdapter::fetch($config),
                'shareasale' => ShareasaleAdapter::fetch($config),
                default      => GenericAdapter::fetch($config),
            };
        } catch (\Throwable $e) {
            $this->db->execute('UPDATE affiliate_networks SET last_synced_at = NOW(), last_status = ? WHERE id = ?', [mb_substr('ERROR: ' . $e->getMessage(), 0, 255), $id]);
            throw $e;
        }

        $docs = [];
        $count = 0;
        foreach ($coupons as $c) {
            $doc = $this->import($c, (string) $net['provider']);
            if ($doc !== null) {
                $docs[] = $doc;
                $count++;
            }
        }
        if ($docs) {
            try { $this->meili->ensureIndex(); $this->meili->indexDocuments($docs); } catch (\Throwable) {}
        }
        $this->db->execute(
            'UPDATE affiliate_networks SET last_synced_at = NOW(), last_status = ?, imported_count = ? WHERE id = ?',
            ['OK: imported ' . $count . ' coupons', $count, $id]
        );
        return $count;
    }

    public function syncAllActive(): int
    {
        $this->ensureSchema();
        $ids = $this->db->all('SELECT id FROM affiliate_networks WHERE is_active = 1');
        $total = 0;
        foreach ($ids as $row) {
            try { $total += $this->sync((int) $row['id']); } catch (\Throwable) {}
        }
        return $total;
    }

    /** Upsert one normalized coupon as an affiliate coupon. @return ?array Meili doc */
    private function import(array $c, string $provider): ?array
    {
        $merchantName = trim((string) ($c['merchant'] ?? 'Store')) ?: 'Store';
        $landing = trim((string) ($c['landing_url'] ?? ''));
        if ($landing === '') {
            return null;
        }
        $merchant = $this->resolveMerchant($merchantName);
        $title = mb_substr(trim((string) ($c['title'] ?? 'Deal')) ?: 'Deal', 0, 255);
        $code = $c['code'] ? mb_substr((string) $c['code'], 0, 80) : null;
        [$dtype, $dvalue] = $this->parseDiscount($title . ' ' . (string) ($c['description'] ?? ''));
        $type = $code ? 'code' : 'deal';
        $validUntil = $this->normalizeDate($c['valid_until'] ?? null);
        $hash = hash('sha256', $merchant['slug'] . '|' . ($code ?? '') . '|' . $title);

        $existing = $this->db->first('SELECT id FROM coupons WHERE content_hash = ? LIMIT 1', [$hash]);
        if ($existing) {
            $id = (int) $existing['id'];
            $this->db->execute(
                "UPDATE coupons SET title=?, description=?, code=?, type=?, discount_type=?, discount_value=?, landing_url=?,
                        status='active', is_affiliate=1, affiliate_network=?, valid_until=?, last_seen_at=NOW() WHERE id=?",
                [$title, $c['description'] ?? null, $code, $type, $dtype, $dvalue, $landing, $provider, $validUntil, $id]
            );
        } else {
            $id = $this->db->insert(
                "INSERT INTO coupons (merchant_id, content_hash, title, description, code, type, discount_type, discount_value, currency,
                        landing_url, status, is_affiliate, affiliate_network, valid_until, last_seen_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?, 'active', 1, ?, ?, NOW())",
                [$merchant['id'], $hash, $title, $c['description'] ?? null, $code, $type, $dtype, $dvalue, 'USD', $landing, $provider, $validUntil]
            );
        }

        // Give affiliate coupons a strong baseline score so they rank well.
        $this->db->execute(
            'INSERT INTO coupon_scores (coupon_id, score, freshness, reliability, popularity, value_score)
             VALUES (?, 0.88, 0.9, 0.9, 0.6, ?) ON DUPLICATE KEY UPDATE score = VALUES(score), computed_at = NOW()',
            [$id, $dvalue !== null ? min(0.99, (float) $dvalue / 100) : 0.5]
        );

        return [
            'id'             => $id,
            'title'          => $title,
            'description'    => $c['description'] ?? null,
            'code'           => $code,
            'type'           => $type,
            'discount_type'  => $dtype,
            'discount_value' => $dvalue,
            'currency'       => 'USD',
            'landing_url'    => $landing,
            'valid_until'    => $validUntil,
            'valid_until_ts' => $validUntil ? strtotime($validUntil) : null,
            'status'         => 'active',
            'merchant_id'    => $merchant['id'],
            'merchant_name'  => $merchant['name'],
            'merchant_slug'  => $merchant['slug'],
            'category'       => $merchant['category'] ?? null,
            'score'          => 0.88,
            'is_affiliate'   => 1,
        ];
    }

    private function resolveMerchant(string $name): array
    {
        $slug = $this->slugify($name);
        if ($slug === '') {
            $slug = 'store';
        }
        $m = $this->merchants->findBySlug($slug);
        if ($m) {
            return $m;
        }
        $id = $this->merchants->create(['slug' => $slug, 'name' => $name, 'is_active' => 1]);
        return ['id' => $id, 'slug' => $slug, 'name' => $name, 'category' => null];
    }

    /** @return array{0:string,1:?float} [discount_type, discount_value] */
    private function parseDiscount(string $text): array
    {
        if (preg_match('/(\d{1,3})\s*%/', $text, $m)) {
            return ['percent', (float) $m[1]];
        }
        if (preg_match('/(?:\$|₹|USD|INR)\s?(\d+(?:\.\d+)?)/i', $text, $m)) {
            return ['amount', (float) $m[1]];
        }
        if (preg_match('/free\s*ship/i', $text)) {
            return ['free_shipping', null];
        }
        return ['other', null];
    }

    private function normalizeDate(?string $d): ?string
    {
        if (!$d) {
            return null;
        }
        $ts = strtotime($d);
        return $ts ? date('Y-m-d H:i:s', $ts) : null;
    }

    private function slugify(string $s): string
    {
        $s = strtolower(trim($s));
        $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? $s;
        return trim($s, '-');
    }

    // ---- Click tracking ---------------------------------------------------

    public function recordClick(int $couponId, ?int $userId, ?string $ip): ?string
    {
        $this->ensureSchema();
        $coupon = $this->db->first('SELECT landing_url FROM coupons WHERE id = ? LIMIT 1', [$couponId]);
        if ($coupon === null || empty($coupon['landing_url'])) {
            return null;
        }
        try {
            $this->db->insert('INSERT INTO affiliate_clicks (coupon_id, user_id, ip) VALUES (?,?,?)', [$couponId, $userId, $ip]);
            $this->db->execute('UPDATE coupons SET times_used = times_used + 1 WHERE id = ?', [$couponId]);
        } catch (\Throwable) {
        }
        return (string) $coupon['landing_url'];
    }
}
