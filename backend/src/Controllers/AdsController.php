<?php

declare(strict_types=1);

namespace CouponFind\Controllers;

use CouponFind\Core\Database;
use CouponFind\Core\Request;
use CouponFind\Core\Response;
use CouponFind\Core\Settings;

/**
 * Public ad configuration for the frontend. Returns only client-safe values
 * (ad network codes are public by design). Disabled by default. Paid
 * subscribers never receive ads — they get an ad-free experience.
 */
final class AdsController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::instance();
    }

    public static function publicConfig(): array
    {
        $enabled = Settings::get('ads_enabled', null, '0') === '1';
        return [
            'enabled'        => $enabled,
            'ad_free'        => false,
            'network'        => Settings::get('ads_network', null, 'adsense'),
            'adsense_client' => Settings::get('ads_adsense_client'),
            'adsense_slot'   => Settings::get('ads_adsense_slot'),
            'ezoic_id'       => Settings::get('ads_ezoic_id'),
            'custom_code'    => Settings::get('ads_custom_code'),
            'frequency'      => max(1, (int) (Settings::get('ads_frequency', null, '1') ?: '1')),
            // "Support us" / donation promo shown after chat responses (UPI / Razorpay QR).
            'support'        => [
                'enabled'   => Settings::get('support_enabled', null, '0') === '1',
                'title'     => Settings::get('support_title'),
                'message'   => Settings::get('support_message'),
                'upi'       => Settings::get('support_upi'),
                'pay_url'   => Settings::get('support_pay_url'),
                'qr_url'    => Settings::get('support_qr_url'),
                'frequency' => max(1, (int) (Settings::get('support_frequency', null, '3') ?: '3')),
            ],
            // Generic custom promo banner shown after chat responses (any image + text + link).
            'banner'         => [
                'enabled'   => Settings::get('banner_enabled', null, '0') === '1',
                'image'     => Settings::get('banner_image'),
                'title'     => Settings::get('banner_title'),
                'text'      => Settings::get('banner_text'),
                'link'      => Settings::get('banner_link'),
                'cta'       => Settings::get('banner_cta'),
                'html'      => Settings::get('banner_html'),
                'frequency' => max(1, (int) (Settings::get('banner_frequency', null, '2') ?: '2')),
            ],
        ];
    }

    public function config(Request $request): Response
    {
        $cfg = self::publicConfig();
        // Paid subscribers get an ad-free experience.
        if ($cfg['enabled']) {
            $uid = $request->userId();
            if ($uid) {
                $sub = $this->db->first(
                    "SELECT p.price_cents, p.slug FROM subscriptions s
                     JOIN plans p ON p.id = s.plan_id
                     WHERE s.user_id = ? AND s.status = 'active'
                     ORDER BY s.id DESC LIMIT 1",
                    [(int) $uid]
                );
                if ($sub && ((int) $sub['price_cents'] > 0 || $sub['slug'] !== 'free')) {
                    $cfg['enabled'] = false;
                    $cfg['ad_free'] = true;
                }
            }
        }
        return Response::ok($cfg);
    }
}
