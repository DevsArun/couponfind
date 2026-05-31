<?php

declare(strict_types=1);

namespace CouponFind\Controllers;

use CouponFind\Core\Database;
use CouponFind\Core\Env;
use CouponFind\Core\Request;
use CouponFind\Core\Response;
use CouponFind\Repositories\EngagementRepository;
use CouponFind\Repositories\SearchLogRepository;
use CouponFind\Repositories\SubscriptionRepository;
use CouponFind\Repositories\UserRepository;
use CouponFind\Security\Password;
use CouponFind\Services\Billing\BillingService;
use CouponFind\Services\UsageService;
use CouponFind\Support\HttpException;
use CouponFind\Support\Validator;

final class UserController
{
    private EngagementRepository $engagement;
    private SearchLogRepository $searchLogs;
    private SubscriptionRepository $subs;
    private UserRepository $users;
    private UsageService $usage;
    private BillingService $billing;
    private Database $db;

    public function __construct()
    {
        $this->engagement = new EngagementRepository();
        $this->searchLogs = new SearchLogRepository();
        $this->subs = new SubscriptionRepository();
        $this->users = new UserRepository();
        $this->usage = new UsageService($this->subs);
        $this->billing = new BillingService();
        $this->db = Database::instance();
    }

    public function dashboard(Request $request): Response
    {
        $userId = (int) $request->userId();
        return Response::ok([
            'quota'           => $this->usage->status($userId),
            'subscription'    => $this->subs->activeForUser($userId),
            'saved_count'     => count($this->engagement->savedCoupons($userId)),
            'watch_count'     => count($this->engagement->watchlist($userId)),
            'unread'          => $this->engagement->unreadCount($userId),
            'recent_search'   => $this->searchLogs->recentForUser($userId, 8),
            'saved'           => array_slice($this->engagement->savedCoupons($userId), 0, 6),
            'recommendations' => (new \CouponFind\Services\RecommendationService())->forUser($userId, 6),
        ]);
    }

    public function recommendations(Request $request): Response
    {
        $limit = (int) $request->query('limit', 8);
        return Response::ok((new \CouponFind\Services\RecommendationService())->forUser((int) $request->userId(), $limit));
    }

    // ---- Saved coupons ----
    public function saved(Request $request): Response
    {
        return Response::ok(['coupons' => $this->engagement->savedCoupons((int) $request->userId())]);
    }

    public function save(Request $request): Response
    {
        $data = Validator::make($request->all(), ['coupon_id' => 'required|int']);
        $this->engagement->saveCoupon((int) $request->userId(), (int) $data['coupon_id'], $request->input('note'));
        return Response::ok(null, 'Coupon saved');
    }

    public function unsave(Request $request, array $params): Response
    {
        $this->engagement->unsaveCoupon((int) $request->userId(), (int) $params['id']);
        return Response::ok(null, 'Removed');
    }

    // ---- Watchlist ----
    public function watchlist(Request $request): Response
    {
        return Response::ok(['watchlist' => $this->engagement->watchlist((int) $request->userId())]);
    }

    public function addWatch(Request $request): Response
    {
        $merchantId = $request->input('merchant_id');
        $keyword = $request->input('keyword');
        if (!$merchantId && !$keyword) {
            throw HttpException::validation(['watch' => ['Provide a merchant or keyword.']]);
        }
        $id = $this->engagement->addWatch((int) $request->userId(), $merchantId ? (int) $merchantId : null, $keyword ?: null);
        return Response::created(['id' => $id], 'Added to watchlist');
    }

    public function removeWatch(Request $request, array $params): Response
    {
        $this->engagement->removeWatch((int) $request->userId(), (int) $params['id']);
        return Response::ok(null, 'Removed');
    }

    // ---- Deal alerts ----
    public function alerts(Request $request): Response
    {
        return Response::ok(['alerts' => $this->engagement->alerts((int) $request->userId())]);
    }

    public function addAlert(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'channel'      => 'in:email,in_app',
            'min_discount' => 'numeric',
        ]);
        $id = $this->engagement->addAlert((int) $request->userId(), [
            'merchant_id'  => $request->input('merchant_id') ? (int) $request->input('merchant_id') : null,
            'keyword'      => $request->input('keyword'),
            'min_discount' => $data['min_discount'] ?? null,
            'channel'      => $data['channel'] ?? 'in_app',
        ]);
        return Response::created(['id' => $id], 'Alert created');
    }

    public function removeAlert(Request $request, array $params): Response
    {
        $this->engagement->removeAlert((int) $request->userId(), (int) $params['id']);
        return Response::ok(null, 'Removed');
    }

    // ---- Notifications ----
    public function notifications(Request $request): Response
    {
        $userId = (int) $request->userId();
        return Response::ok([
            'notifications' => $this->engagement->notifications($userId),
            'unread'        => $this->engagement->unreadCount($userId),
        ]);
    }

    public function readNotification(Request $request, array $params): Response
    {
        $this->engagement->markRead((int) $request->userId(), (int) $params['id']);
        return Response::ok(null, 'Marked read');
    }

    public function readAllNotifications(Request $request): Response
    {
        $this->engagement->markAllRead((int) $request->userId());
        return Response::ok(null, 'All marked read');
    }

    // ---- History ----
    public function searchHistory(Request $request): Response
    {
        return Response::ok(['history' => $this->searchLogs->recentForUser((int) $request->userId(), 100)]);
    }

    // ---- Billing ----
    public function invoices(Request $request): Response
    {
        $userId = (int) $request->userId();
        return Response::ok([
            'invoices' => $this->billing->invoicesForUser($userId),
            'payments' => $this->billing->paymentsForUser($userId),
        ]);
    }

    /** Generate a downloadable PDF invoice. */
    public function invoicePdf(Request $request, array $params): Response
    {
        $number = (string) $params['number'];
        $inv = $this->billing->invoiceForUser((int) $request->userId(), $number);
        if ($inv === null) {
            throw HttpException::notFound('Invoice not found');
        }

        $currency = strtoupper((string) ($inv['currency'] ?? 'USD'));
        $amount = number_format(((int) $inv['amount_cents']) / 100, 2);
        $desc = $inv['plan_name'] ? ($inv['plan_name'] . ' plan subscription') : 'CouponFind subscription';

        $pdf = new \CouponFind\Support\Pdf();
        $pdf->line('CouponFind', 22)->gap(2)
            ->line('AI Coupon Search SaaS', 10)->gap(14)
            ->line('INVOICE', 16)->gap(6)
            ->line('Invoice #: ' . $inv['number'], 11)
            ->line('Issued:    ' . date('M j, Y', strtotime((string) ($inv['issued_at'] ?? $inv['created_at']))), 11)
            ->line('Status:    ' . strtoupper((string) $inv['status']), 11)
            ->line('Gateway:   ' . strtoupper((string) $inv['gateway']), 11)
            ->gap(10)
            ->line('Bill to', 12)
            ->line((string) $inv['user_name'], 11)
            ->line((string) $inv['user_email'], 11)
            ->gap(12)->rule()
            ->line('Description                                         Amount', 11)
            ->rule()
            ->line(str_pad(substr($desc, 0, 44), 48) . $currency . ' ' . $amount, 11)
            ->gap(8)->rule()
            ->line(str_pad('TOTAL', 48) . $currency . ' ' . $amount, 13)
            ->gap(24)
            ->line('Thank you for your business.', 10)
            ->line('CouponFind - billing@couponfind.example', 9);

        return Response::raw($pdf->render(), 'application/pdf', [
            'Content-Disposition' => 'attachment; filename="' . $inv['number'] . '.pdf"',
        ]);
    }

    // ---- Profile ----
    public function profile(Request $request): Response
    {
        $user = $this->users->findById((int) $request->userId());
        return Response::ok(['profile' => [
            'id'    => (int) $user['id'],
            'name'  => $user['name'],
            'email' => $user['email'],
            'role'  => $user['role_slug'],
            'created_at' => $user['created_at'],
        ]]);
    }

    public function updateProfile(Request $request): Response
    {
        $data = Validator::make($request->all(), ['name' => 'required|string|min:2|max:120']);
        $this->db->execute('UPDATE users SET name = ? WHERE id = ?', [$data['name'], (int) $request->userId()]);
        return Response::ok(null, 'Profile updated');
    }

    public function changePassword(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'current_password' => 'required|string',
            'password'         => 'required|string|min:8|max:100',
        ]);
        $user = $this->users->findById((int) $request->userId());
        if (!Password::verify($data['current_password'], $user['password_hash'])) {
            throw new HttpException('Current password is incorrect.', 422);
        }
        $this->users->updatePassword((int) $user['id'], $data['password']);
        return Response::ok(null, 'Password changed');
    }

    // ---- Referrals ----
    public function referrals(Request $request): Response
    {
        $userId = (int) $request->userId();
        $user = $this->users->findById($userId);
        $referred = $this->db->all('SELECT name, created_at FROM users WHERE referred_by = ? ORDER BY id DESC', [$userId]);
        $appUrl = rtrim(Env::string('APP_URL', 'http://localhost:8080'), '/');
        return Response::ok([
            'code'      => $user['referral_code'],
            'link'      => $appUrl . '/register?ref=' . $user['referral_code'],
            'referred'  => $referred,
            'count'     => count($referred),
        ]);
    }
}
