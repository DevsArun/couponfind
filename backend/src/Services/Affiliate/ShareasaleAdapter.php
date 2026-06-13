<?php

declare(strict_types=1);

namespace CouponFind\Services\Affiliate;

use CouponFind\Support\Http;
use CouponFind\Support\HttpException;

/**
 * ShareASale Affiliate API — couponDeals action. Uses the signed-request scheme
 * (HMAC-SHA256 over token:timestamp:action:secret). Returns a pipe-delimited
 * dataset with a header row; we map columns by name.
 *
 * @return array<int,array{merchant:string,title:string,description:?string,code:?string,landing_url:string,valid_until:?string}>
 */
final class ShareasaleAdapter
{
    public static function fetch(array $cfg): array
    {
        $affiliateId = trim((string) ($cfg['affiliate_id'] ?? ''));
        $token = trim((string) ($cfg['api_token'] ?? ''));
        $secret = trim((string) ($cfg['api_secret'] ?? ''));
        if ($affiliateId === '' || $token === '' || $secret === '') {
            throw new HttpException('ShareASale: affiliate_id, api_token and api_secret are required.', 422);
        }
        $action = 'couponDeals';
        $version = '2.8';
        $timestamp = gmdate('D, d M Y H:i:s') . ' GMT';
        $sig = hash('sha256', $token . ':' . $timestamp . ':' . $action . ':' . $secret);
        $url = 'https://api.shareasale.com/x.cfm?action=' . $action . '&affiliateId=' . rawurlencode($affiliateId)
            . '&token=' . rawurlencode($token) . '&version=' . $version;
        $res = Http::request('GET', $url, [
            'x-ShareASale-Date'           => $timestamp,
            'x-ShareASale-Authentication' => $sig,
        ], null, 25);
        if (($res['status'] ?? 0) < 200 || ($res['status'] ?? 0) >= 300 || $res['body'] === '') {
            throw new HttpException('ShareASale API error (HTTP ' . $res['status'] . '). Check credentials.', 502);
        }

        $lines = preg_split('/\r\n|\r|\n/', trim($res['body'])) ?: [];
        if (count($lines) < 2) {
            return [];
        }
        $delim = str_contains($lines[0], '|') ? '|' : "\t";
        $headers = array_map(static fn ($h) => strtolower(trim($h)), explode($delim, array_shift($lines)));
        $idx = static function (array $names) use ($headers): ?int {
            foreach ($names as $n) {
                $i = array_search($n, $headers, true);
                if ($i !== false) {
                    return (int) $i;
                }
            }
            return null;
        };
        $iMerchant = $idx(['merchantname', 'merchant']);
        $iCode = $idx(['couponcode', 'coupon']);
        $iTitle = $idx(['couponname', 'dealname', 'name', 'title']);
        $iDesc = $idx(['dealdescription', 'description', 'restrictions']);
        $iUrl = $idx(['trackingurl', 'dealurl', 'clickurl', 'url']);
        $iEnd = $idx(['enddate', 'expiration', 'expires']);

        $out = [];
        foreach ($lines as $line) {
            if (trim($line) === '') {
                continue;
            }
            $cols = explode($delim, $line);
            $land = $iUrl !== null ? trim($cols[$iUrl] ?? '') : '';
            if ($land === '') {
                continue;
            }
            $out[] = [
                'merchant'    => $iMerchant !== null ? trim($cols[$iMerchant] ?? 'Store') : 'Store',
                'title'       => $iTitle !== null ? trim($cols[$iTitle] ?? 'Deal') : 'Deal',
                'description' => $iDesc !== null ? (trim($cols[$iDesc] ?? '') ?: null) : null,
                'code'        => $iCode !== null ? (trim($cols[$iCode] ?? '') ?: null) : null,
                'landing_url' => $land,
                'valid_until' => $iEnd !== null ? (trim($cols[$iEnd] ?? '') ?: null) : null,
            ];
        }
        return $out;
    }
}
