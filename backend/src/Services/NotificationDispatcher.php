<?php

declare(strict_types=1);

namespace CouponFind\Services;

use CouponFind\Core\Database;
use CouponFind\Repositories\EngagementRepository;
use CouponFind\Support\Mailer;

/**
 * Matches newly-imported active coupons against users' deal alerts and
 * watchlists, then notifies the matched users (in-app always; email when an
 * alert's channel is "email"). Designed to be run periodically from cron:
 *
 *     php backend/console.php alerts:dispatch
 *
 * A cursor (settings: alerts.last_dispatch_at) ensures each coupon is only
 * processed once, and per-run dedupe prevents notifying a user twice for the
 * same coupon.
 */
final class NotificationDispatcher
{
    private Database $db;
    private EngagementRepository $engagement;

    private const CURSOR_KEY = 'alerts.last_dispatch_at';

    public function __construct()
    {
        $this->db = Database::instance();
        $this->engagement = new EngagementRepository();
    }

    /**
     * @return array{processed:int, alert_hits:int, watch_hits:int, emails:int}
     */
    public function dispatch(int $maxCoupons = 500): array
    {
        $cursor = $this->cursor();
        $coupons = $this->db->all(
            "SELECT c.id, c.title, c.code, c.discount_type, c.discount_value, c.landing_url, c.created_at,
                    m.id AS merchant_id, m.name AS merchant_name
             FROM coupons c JOIN merchants m ON m.id = c.merchant_id
             WHERE c.status = 'active' AND c.created_at > ?
             ORDER BY c.created_at ASC
             LIMIT " . (int) $maxCoupons,
            [$cursor]
        );

        $stats = ['processed' => 0, 'alert_hits' => 0, 'watch_hits' => 0, 'emails' => 0];
        $newCursor = $cursor;

        foreach ($coupons as $coupon) {
            $stats['processed']++;
            $notifiedUsers = [];   // user_id => true (per-coupon dedupe)

            // ---- Deal alerts ----
            $alerts = $this->db->all(
                "SELECT da.id, da.user_id, da.channel, u.email, u.name
                 FROM deal_alerts da JOIN users u ON u.id = da.user_id
                 WHERE da.is_active = 1
                   AND u.status = 'active'
                   AND ( da.merchant_id = ?
                         OR (da.keyword IS NOT NULL AND da.keyword <> '' AND (? LIKE CONCAT('%', da.keyword, '%') OR ? LIKE CONCAT('%', da.keyword, '%'))) )
                   AND ( da.min_discount IS NULL OR (? IS NOT NULL AND ? >= da.min_discount) )",
                [
                    $coupon['merchant_id'],
                    $coupon['title'], $coupon['merchant_name'],
                    $coupon['discount_value'], $coupon['discount_value'],
                ]
            );
            foreach ($alerts as $a) {
                $uid = (int) $a['user_id'];
                if (isset($notifiedUsers[$uid])) {
                    continue;
                }
                $notifiedUsers[$uid] = true;
                $stats['alert_hits']++;
                $this->notify($uid, 'deal_alert', $coupon);
                $this->db->execute('UPDATE deal_alerts SET last_triggered_at = NOW() WHERE id = ?', [$a['id']]);

                if ($a['channel'] === 'email' && $this->emailEnabled()) {
                    if ($this->emailCoupon((string) $a['email'], (string) $a['name'], $coupon)) {
                        $stats['emails']++;
                    }
                }
            }

            // ---- Watchlists ----
            $watches = $this->db->all(
                "SELECT w.user_id FROM watchlists w JOIN users u ON u.id = w.user_id
                 WHERE u.status = 'active'
                   AND ( w.merchant_id = ?
                         OR (w.keyword IS NOT NULL AND w.keyword <> '' AND ? LIKE CONCAT('%', w.keyword, '%')) )",
                [$coupon['merchant_id'], $coupon['title']]
            );
            foreach ($watches as $w) {
                $uid = (int) $w['user_id'];
                if (isset($notifiedUsers[$uid])) {
                    continue;
                }
                $notifiedUsers[$uid] = true;
                $stats['watch_hits']++;
                $this->notify($uid, 'watchlist', $coupon);
            }

            if ($coupon['created_at'] > $newCursor) {
                $newCursor = $coupon['created_at'];
            }
        }

        // Advance the cursor (to the newest processed coupon, or now if none).
        $this->setCursor($coupons ? $newCursor : date('Y-m-d H:i:s'));
        return $stats;
    }

    private function notify(int $userId, string $type, array $coupon): void
    {
        $label = $this->discountLabel($coupon);
        $title = sprintf('New deal: %s at %s', $label, $coupon['merchant_name']);
        $this->engagement->notify(
            $userId,
            $type,
            $title,
            $coupon['title'],
            ['coupon_id' => (int) $coupon['id'], 'merchant_id' => (int) $coupon['merchant_id'], 'code' => $coupon['code']]
        );
    }

    private function emailCoupon(string $email, string $name, array $coupon): bool
    {
        $label = $this->discountLabel($coupon);
        $codeLine = $coupon['code']
            ? '<p>Use code: <b style="color:#FF7A18;font-family:monospace;">' . htmlspecialchars((string) $coupon['code']) . '</b></p>'
            : '';
        $html = Mailer::render(
            $label . ' at ' . htmlspecialchars((string) $coupon['merchant_name']),
            htmlspecialchars((string) $coupon['title']) . $codeLine,
            $coupon['landing_url'] ? ['label' => 'View deal', 'url' => (string) $coupon['landing_url']] : null
        );
        return Mailer::send($email, 'New deal matching your alert', $html, $name);
    }

    private function discountLabel(array $coupon): string
    {
        $type = $coupon['discount_type'] ?? null;
        $val = $coupon['discount_value'] ?? null;
        if ($type === 'percent' && $val) {
            return round((float) $val) . '% off';
        }
        if ($type === 'amount' && $val) {
            return '$' . round((float) $val) . ' off';
        }
        if ($type === 'free_shipping') {
            return 'Free shipping';
        }
        return 'New deal';
    }

    private function emailEnabled(): bool
    {
        return \CouponFind\Core\Env::string('MAIL_HOST', '') !== '';
    }

    private function cursor(): string
    {
        $val = $this->db->scalar('SELECT value FROM settings WHERE `key` = ?', [self::CURSOR_KEY]);
        if (is_string($val) && $val !== '') {
            return $val;
        }
        // First run: look back a short window so we don't flood on initial deploy.
        return date('Y-m-d H:i:s', strtotime('-1 hour'));
    }

    private function setCursor(string $value): void
    {
        $this->db->execute(
            'INSERT INTO settings (`key`, value, type) VALUES (?, ?, "string")
             ON DUPLICATE KEY UPDATE value = VALUES(value)',
            [self::CURSOR_KEY, $value]
        );
    }
}
