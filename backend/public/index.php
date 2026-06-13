<?php

declare(strict_types=1);

/**
 * Couponaut API front controller.
 * All /api/* traffic is routed here (via nginx or the dev router).
 */

require dirname(__DIR__) . '/vendor/autoload.php';

(new CouponFind\Core\App())->run();
