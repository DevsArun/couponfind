<?php

declare(strict_types=1);

namespace CouponFind\Services\Affiliate;

use CouponFind\Support\Http;
use CouponFind\Support\HttpException;

/**
 * Awin Promotions API. Auth via OAuth2 bearer token; pulls joined-programme
 * vouchers. The `urlTracking` field is the affiliate deeplink.
 *
 * @return array<int,array{merchant:string,title:string,description:?string,code:?string,landing_url:string,valid_until:?string}>
 */
final class AwinAdapter
{
    public static function fetch(array $cfg): array
    {
        $pub = trim((string) ($cfg['publisher_id'] ?? ''));
        $token = trim((string) ($cfg['api_token'] ?? ''));
        if ($pub === '' || $token === '') {
            throw new HttpException('Awin: publisher_id and api_token are required.', 422);
        }
        $url = 'https://api.awin.com/publishers/' . rawurlencode($pub) . '/promotions/';
        $res = Http::postJson($url, ['filters' => ['membership' => 'joined', 'type' => 'voucher']], ['Authorization' => 'Bearer ' . $token], 25);
        if (!$res['ok'] || !is_array($res['json'])) {
            throw new HttpException('Awin API error (HTTP ' . $res['status'] . '). Check publisher_id/api_token.', 502);
        }
        $rows = $res['json']['data'] ?? $res['json']['promotions'] ?? [];
        $out = [];
        foreach ($rows as $p) {
            if (!is_array($p)) {
                continue;
            }
            $land = $p['urlTracking'] ?? $p['url'] ?? null;
            if (!$land) {
                continue;
            }
            $code = $p['voucher']['code'] ?? $p['voucherCode'] ?? null;
            $out[] = [
                'merchant'    => (string) ($p['advertiser']['name'] ?? $p['advertiserName'] ?? 'Store'),
                'title'       => (string) ($p['title'] ?? 'Deal'),
                'description' => isset($p['description']) ? (string) $p['description'] : null,
                'code'        => $code ? (string) $code : null,
                'landing_url' => (string) $land,
                'valid_until' => isset($p['endDate']) ? (string) $p['endDate'] : null,
            ];
        }
        return $out;
    }
}
