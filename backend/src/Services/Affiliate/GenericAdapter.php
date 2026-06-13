<?php

declare(strict_types=1);

namespace CouponFind\Services\Affiliate;

use CouponFind\Support\Http;
use CouponFind\Support\HttpException;

/**
 * Network-agnostic adapter: pulls coupons from ANY affiliate network that
 * exposes a JSON feed. The admin supplies the feed URL, an optional bearer
 * token, the JSON path to the array (`root`), and a field `map` so any
 * network's field names can be mapped to ours.
 *
 * @return array<int,array{merchant:string,title:string,description:?string,code:?string,landing_url:string,valid_until:?string}>
 */
final class GenericAdapter
{
    public static function fetch(array $cfg): array
    {
        $url = trim((string) ($cfg['feed_url'] ?? ''));
        if ($url === '') {
            throw new HttpException('Generic network: feed_url is required.', 422);
        }
        $headers = ['Accept' => 'application/json'];
        if (!empty($cfg['bearer_token'])) {
            $headers['Authorization'] = 'Bearer ' . $cfg['bearer_token'];
        }
        $res = Http::getJson($url, $headers, 25);
        if (!$res['ok'] || !is_array($res['json'])) {
            throw new HttpException('Feed fetch failed (HTTP ' . $res['status'] . '). Check the URL/token.', 502);
        }

        $items = $res['json'];
        $root = trim((string) ($cfg['root'] ?? ''));
        if ($root !== '') {
            foreach (explode('.', $root) as $k) {
                $items = is_array($items) && isset($items[$k]) ? $items[$k] : [];
            }
        }
        if (!is_array($items)) {
            $items = [];
        }

        $map = is_array($cfg['map'] ?? null) ? $cfg['map'] : [];
        $pick = static function (array $it, string $field) use ($map) {
            $key = $map[$field] ?? $field;
            return $it[$key] ?? null;
        };

        $out = [];
        foreach ($items as $it) {
            if (!is_array($it)) {
                continue;
            }
            $land = $pick($it, 'landing_url');
            if (!$land) {
                continue;
            }
            $out[] = [
                'merchant'    => (string) ($pick($it, 'merchant') ?? 'Store'),
                'title'       => (string) ($pick($it, 'title') ?? 'Deal'),
                'description' => $pick($it, 'description') !== null ? (string) $pick($it, 'description') : null,
                'code'        => $pick($it, 'code') !== null ? (string) $pick($it, 'code') : null,
                'landing_url' => (string) $land,
                'valid_until' => $pick($it, 'valid_until') !== null ? (string) $pick($it, 'valid_until') : null,
            ];
        }
        return $out;
    }
}
