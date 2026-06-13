<?php

declare(strict_types=1);

namespace CouponFind\Services\Affiliate;

use CouponFind\Support\Http;
use CouponFind\Support\HttpException;

/**
 * Impact.com (Impact Radius) media-partner adapter. Pulls promotional "Ads"
 * (which include coupon/promo offers) via the REST API using HTTP Basic auth
 * (AccountSID:AuthToken). The Ad's TrackingLink is already an affiliate
 * deeplink, so we use it directly as the coupon landing URL.
 *
 * Docs: https://developer.impact.com  (GET /Mediapartners/{AccountSID}/Ads)
 *
 * @return array<int,array{merchant:string,title:string,description:?string,code:?string,landing_url:string,valid_until:?string}>
 */
final class ImpactAdapter
{
    public static function fetch(array $cfg): array
    {
        $sid = trim((string) ($cfg['account_sid'] ?? ''));
        $token = trim((string) ($cfg['auth_token'] ?? ''));
        if ($sid === '' || $token === '') {
            throw new HttpException('Impact: account_sid and auth_token are required.', 422);
        }
        $subId = trim((string) ($cfg['sub_id'] ?? ''));
        $auth = ['Authorization' => 'Basic ' . base64_encode($sid . ':' . $token), 'Accept' => 'application/json'];

        $out = [];
        $page = 1;
        do {
            $url = 'https://api.impact.com/Mediapartners/' . rawurlencode($sid) . '/Ads?PageSize=100&Page=' . $page;
            $res = Http::getJson($url, $auth, 25);
            if (!$res['ok'] || !is_array($res['json'])) {
                if ($page === 1) {
                    throw new HttpException('Impact API error (HTTP ' . $res['status'] . '). Check AccountSID/AuthToken.', 502);
                }
                break;
            }
            $ads = $res['json']['Ads'] ?? $res['json']['ads'] ?? [];
            foreach ($ads as $ad) {
                if (!is_array($ad)) {
                    continue;
                }
                $land = $ad['TrackingLink'] ?? $ad['LandingPageUrl'] ?? $ad['Uri'] ?? null;
                if (!$land) {
                    continue;
                }
                if ($subId !== '') {
                    $land .= (str_contains((string) $land, '?') ? '&' : '?') . 'subId1=' . rawurlencode($subId);
                }
                $out[] = [
                    'merchant'    => (string) ($ad['CampaignName'] ?? $ad['AdvertiserName'] ?? 'Store'),
                    'title'       => (string) ($ad['Name'] ?? $ad['Description'] ?? 'Deal'),
                    'description' => isset($ad['Description']) ? (string) $ad['Description'] : null,
                    'code'        => isset($ad['CouponCode']) && $ad['CouponCode'] !== '' ? (string) $ad['CouponCode'] : null,
                    'landing_url' => (string) $land,
                    'valid_until' => isset($ad['EndDate']) && $ad['EndDate'] !== '' ? (string) $ad['EndDate'] : null,
                ];
            }
            $totalPages = (int) ($res['json']['@numpages'] ?? $res['json']['NumPages'] ?? 1);
            $page++;
        } while ($page <= $totalPages && $page <= 10);

        return $out;
    }
}
