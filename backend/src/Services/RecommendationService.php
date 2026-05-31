<?php

declare(strict_types=1);

namespace CouponFind\Services;

use CouponFind\Core\Database;
use CouponFind\Repositories\CouponRepository;

/**
 * Personalized coupon recommendations.
 *
 * Signals (most → least weighted):
 *   1. Merchants the user searched for recently (search_logs.detected_merchant_id)
 *   2. Merchants of coupons the user saved
 * We surface the top-scored active coupons from those merchants, excluding
 * already-saved coupons, and top up with featured coupons so the list is never
 * empty (graceful for brand-new users).
 */
final class RecommendationService
{
    private Database $db;
    private CouponRepository $coupons;

    public function __construct()
    {
        $this->db = Database::instance();
        $this->coupons = new CouponRepository();
    }

    public function forUser(int $userId, int $limit = 8): array
    {
        $merchantIds = $this->affinityMerchants($userId);
        $savedIds = $this->savedCouponIds($userId);

        $recommended = $merchantIds
            ? $this->coupons->recommended($merchantIds, $savedIds, $limit)
            : [];

        $reason = $merchantIds ? 'based_on_activity' : 'trending';

        // Top up with featured coupons if we don't have enough personalized ones.
        if (count($recommended) < $limit) {
            $have = array_map(static fn ($c) => (int) $c['id'], $recommended);
            $exclude = array_merge($have, $savedIds);
            foreach ($this->coupons->featured($limit * 2) as $f) {
                if (in_array((int) $f['id'], $exclude, true)) {
                    continue;
                }
                $recommended[] = $f;
                if (count($recommended) >= $limit) {
                    break;
                }
            }
        }

        return ['reason' => $reason, 'coupons' => array_slice($recommended, 0, $limit)];
    }

    /** Merchant ids the user has shown interest in, most relevant first. */
    private function affinityMerchants(int $userId, int $limit = 8): array
    {
        $rows = $this->db->all(
            "SELECT merchant_id, SUM(weight) AS w FROM (
                SELECT detected_merchant_id AS merchant_id, 2 AS weight
                FROM search_logs
                WHERE user_id = ? AND detected_merchant_id IS NOT NULL
                  AND created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
                UNION ALL
                SELECT c.merchant_id AS merchant_id, 3 AS weight
                FROM saved_coupons sc JOIN coupons c ON c.id = sc.coupon_id
                WHERE sc.user_id = ?
             ) t
             WHERE merchant_id IS NOT NULL
             GROUP BY merchant_id
             ORDER BY w DESC
             LIMIT " . (int) $limit,
            [$userId, $userId]
        );
        return array_map(static fn ($r) => (int) $r['merchant_id'], $rows);
    }

    private function savedCouponIds(int $userId): array
    {
        $rows = $this->db->all('SELECT coupon_id FROM saved_coupons WHERE user_id = ?', [$userId]);
        return array_map(static fn ($r) => (int) $r['coupon_id'], $rows);
    }
}
