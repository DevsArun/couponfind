<?php

declare(strict_types=1);

/**
 * CouponFind PHP console — maintenance + background tasks for cron.
 *
 * Usage:
 *   php backend/console.php alerts:dispatch     match new coupons -> notify users (in-app + email)
 *   php backend/console.php coupons:expire       mark coupons past valid_until as expired
 *   php backend/console.php mail:test <email>    send a test email to verify SMTP config
 *
 * Suggested cron (VPS):
 *   *\/10 * * * *  php /var/www/couponfind/backend/console.php alerts:dispatch
 *   *\/30 * * * *  php /var/www/couponfind/backend/console.php coupons:expire
 */

require __DIR__ . '/vendor/autoload.php';

use CouponFind\Core\Database;
use CouponFind\Core\Env;
use CouponFind\Services\NotificationDispatcher;
use CouponFind\Support\Mailer;

Env::load();
date_default_timezone_set('UTC');

$command = $argv[1] ?? 'help';

try {
    switch ($command) {
        case 'alerts:dispatch':
            $stats = (new NotificationDispatcher())->dispatch();
            fwrite(STDOUT, '[alerts:dispatch] ' . json_encode($stats) . PHP_EOL);
            exit(0);

        case 'coupons:expire':
            $n = Database::instance()->execute(
                "UPDATE coupons SET status = 'expired'
                 WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until < NOW()"
            );
            fwrite(STDOUT, "[coupons:expire] expired={$n}" . PHP_EOL);
            exit(0);

        case 'mail:test':
            $to = $argv[2] ?? '';
            if ($to === '') {
                fwrite(STDERR, "Usage: php console.php mail:test <email>" . PHP_EOL);
                exit(1);
            }
            $html = Mailer::render('SMTP test', 'If you can read this, your CouponFind SMTP configuration works.');
            $ok = Mailer::send($to, 'CouponFind SMTP test', $html);
            fwrite(STDOUT, '[mail:test] sent=' . ($ok ? 'true' : 'false (check MAIL_* env)') . PHP_EOL);
            exit($ok ? 0 : 1);

        case 'help':
        default:
            fwrite(STDOUT, "CouponFind console commands:\n"
                . "  alerts:dispatch    notify users about new coupons matching alerts/watchlists\n"
                . "  coupons:expire     expire coupons past their valid_until\n"
                . "  mail:test <email>  send a test email\n");
            exit($command === 'help' ? 0 : 1);
    }
} catch (\Throwable $e) {
    fwrite(STDERR, '[console:error] ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
