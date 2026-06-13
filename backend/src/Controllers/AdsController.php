<?php

declare(strict_types=1);

namespace CouponFind\Controllers;

use CouponFind\Core\Request;
use CouponFind\Core\Response;
use CouponFind\Core\Settings;

/**
 * Public ad configuration for the frontend. Returns only client-safe values
 * (ad network codes are public by design). Disabled by default.
 */
final class AdsController
{
    public static function publicConfig(): array
    {
        $enabled = Settings::get('ads_enabled', null, '0') === '1';
        return [
            'enabled'        => $enabled,
            'network'        => Settings::get('ads_network', null, 'adsense'),
            'adsense_client' => Settings::get('ads_adsense_client'),
            'adsense_slot'   => Settings::get('ads_adsense_slot'),
            'ezoic_id'       => Settings::get('ads_ezoic_id'),
            'custom_code'    => Settings::get('ads_custom_code'),
            'frequency'      => max(1, (int) (Settings::get('ads_frequency', null, '1') ?: '1')),
        ];
    }

    public function config(Request $request): Response
    {
        return Response::ok(self::publicConfig());
    }
}
