<?php

declare(strict_types=1);

namespace CouponFind\Services\Affiliate;

use CouponFind\Support\Http;
use CouponFind\Support\HttpException;

/**
 * CJ (Commission Junction) Link Search API. Returns coupon/promo links as XML;
 * the <clickUrl> is the affiliate deeplink.
 *
 * Docs: https://developers.cj.com  (link-search.api.cj.com/v2/link-search)
 *
 * @return array<int,array{merchant:string,title:string,description:?string,code:?string,landing_url:string,valid_until:?string}>
 */
final class CjAdapter
{
    public static function fetch(array $cfg): array
    {
        $key = trim((string) ($cfg['dev_key'] ?? ''));
        $wid = trim((string) ($cfg['website_id'] ?? ''));
        if ($key === '' || $wid === '') {
            throw new HttpException('CJ: dev_key (personal access token) and website_id are required.', 422);
        }
        $url = 'https://link-search.api.cj.com/v2/link-search?website-id=' . rawurlencode($wid)
            . '&promotion-type=coupon&records-per-page=100&page-number=1';
        $res = Http::getJson($url, ['Authorization' => $key, 'Accept' => 'application/xml'], 25);
        if (($res['status'] ?? 0) < 200 || ($res['status'] ?? 0) >= 300 || $res['body'] === '') {
            throw new HttpException('CJ API error (HTTP ' . $res['status'] . '). Check dev_key/website_id.', 502);
        }

        $xml = @simplexml_load_string($res['body']);
        if ($xml === false) {
            throw new HttpException('CJ: could not parse response.', 502);
        }
        $out = [];
        $links = $xml->links->link ?? [];
        foreach ($links as $l) {
            $land = (string) ($l->clickUrl ?? '');
            if ($land === '') {
                continue;
            }
            $code = trim((string) ($l->{'coupon-code'} ?? ''));
            $end = trim((string) ($l->{'promotion-end-date'} ?? ''));
            $out[] = [
                'merchant'    => (string) ($l->{'advertiser-name'} ?? 'Store'),
                'title'       => (string) ($l->{'link-name'} ?? $l->{'promotion-text'} ?? 'Deal'),
                'description' => (string) ($l->description ?? $l->{'promotion-text'} ?? '') ?: null,
                'code'        => $code !== '' ? $code : null,
                'landing_url' => $land,
                'valid_until' => $end !== '' ? $end : null,
            ];
        }
        return $out;
    }
}
