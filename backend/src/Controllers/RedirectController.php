<?php

declare(strict_types=1);

namespace CouponFind\Controllers;

use CouponFind\Core\Request;
use CouponFind\Core\Response;
use CouponFind\Services\Affiliate\AffiliateService;

/**
 * Click-tracking redirect for coupon/affiliate links. Logs the click (for our
 * own analytics + affiliate sub-id attribution) then 302s to the deeplink.
 */
final class RedirectController
{
    public function go(Request $request, array $params): Response
    {
        $url = (new AffiliateService())->recordClick((int) $params['id'], $request->userId(), $request->ip());
        return Response::raw('', 'text/html; charset=utf-8', ['Location' => $url ?: '/'], 302);
    }
}
