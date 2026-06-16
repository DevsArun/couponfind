<?php

declare(strict_types=1);

namespace CouponFind\Controllers;

use CouponFind\Core\Database;
use CouponFind\Core\RedisClient;
use CouponFind\Core\Request;
use CouponFind\Core\Response;
use CouponFind\Repositories\CouponRepository;
use CouponFind\Repositories\MerchantRepository;
use CouponFind\Repositories\PlanRepository;
use CouponFind\Repositories\SearchLogRepository;
use CouponFind\Repositories\SubscriptionRepository;
use CouponFind\Repositories\UserRepository;
use CouponFind\Services\Meilisearch;
use CouponFind\Support\Audit;
use CouponFind\Support\HttpException;
use CouponFind\Support\Mailer;
use CouponFind\Support\Validator;

/**
 * Super Admin "mission control". Every mutating action is audit-logged.
 * Heavy engine operations (crawl / validate / reindex) are dispatched as
 * durable engine_jobs that the Python engine picks up.
 */
final class AdminController
{
    private Database $db;
    private UserRepository $users;
    private PlanRepository $plans;
    private MerchantRepository $merchants;
    private CouponRepository $coupons;
    private SubscriptionRepository $subs;
    private SearchLogRepository $searchLogs;

    public function __construct()
    {
        $this->db = Database::instance();
        $this->users = new UserRepository();
        $this->plans = new PlanRepository();
        $this->merchants = new MerchantRepository();
        $this->coupons = new CouponRepository();
        $this->subs = new SubscriptionRepository();
        $this->searchLogs = new SearchLogRepository();
    }

    // ---- Dashboard ----
    public function dashboard(Request $request): Response
    {
        return Response::ok([
            'users_total'        => (int) $this->db->scalar('SELECT COUNT(*) FROM users'),
            'users_active_24h'   => (int) $this->db->scalar('SELECT COUNT(*) FROM users WHERE last_login_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)'),
            'subscriptions'      => $this->subs->countActive(),
            'mrr'                => round($this->subs->mrrCents() / 100, 2),
            'coupons_total'      => $this->coupons->totalCount(),
            'coupons_active'     => $this->coupons->activeCount(),
            'merchants'          => $this->merchants->count(),
            'searches_total'     => $this->searchLogs->totalCount(),
            'searches_24h'       => $this->searchLogs->countSince(date('Y-m-d H:i:s', strtotime('-1 day'))),
            'avg_latency_ms'     => round($this->searchLogs->avgLatencyMs(7), 1),
            'search_volume'      => $this->searchLogs->dailyVolume(14),
            'top_queries'        => $this->searchLogs->topQueries(10, 30),
            'revenue_30d'        => round(((int) $this->db->scalar("SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE status='succeeded' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)")) / 100, 2),
        ]);
    }

    // ---- Users ----
    public function users(Request $request): Response
    {
        $page = max(1, (int) $request->query('page', 1));
        $per = min(100, max(5, (int) $request->query('per_page', 25)));
        return Response::ok($this->users->paginate($page, $per, $request->query('search')));
    }

    public function setUserStatus(Request $request, array $params): Response
    {
        $data = Validator::make($request->all(), ['status' => 'required|in:active,suspended,pending']);
        $this->users->setStatus((int) $params['id'], $data['status']);
        Audit::log((int) $request->userId(), 'admin.user.status', 'user', $params['id'], ['status' => $data['status']], $request->ip());
        return Response::ok(null, 'User updated');
    }

    public function setUserRole(Request $request, array $params): Response
    {
        $data = Validator::make($request->all(), ['role_id' => 'required|int']);
        $this->users->setRole((int) $params['id'], (int) $data['role_id']);
        Audit::log((int) $request->userId(), 'admin.user.role', 'user', $params['id'], ['role_id' => $data['role_id']], $request->ip());
        return Response::ok(null, 'Role updated');
    }

    // ---- Plans CRUD ----
    public function plans(Request $request): Response
    {
        return Response::ok(['plans' => $this->plans->all()]);
    }

    public function createPlan(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'slug'        => 'required|string|max:50',
            'name'        => 'required|string|max:100',
            'price_cents' => 'required|int',
            'interval'    => 'required|in:day,month,year,lifetime',
        ]);
        $id = $this->plans->create($request->all());
        Audit::log((int) $request->userId(), 'admin.plan.create', 'plan', (string) $id, $data, $request->ip());
        return Response::created(['id' => $id], 'Plan created');
    }

    public function updatePlan(Request $request, array $params): Response
    {
        $this->plans->update((int) $params['id'], $request->all());
        Audit::log((int) $request->userId(), 'admin.plan.update', 'plan', $params['id'], [], $request->ip());
        return Response::ok(null, 'Plan updated');
    }

    public function deletePlan(Request $request, array $params): Response
    {
        $this->plans->delete((int) $params['id']);
        Audit::log((int) $request->userId(), 'admin.plan.delete', 'plan', $params['id'], [], $request->ip());
        return Response::ok(null, 'Plan deleted');
    }

    // ---- Subscriptions: assign custom / lifetime / override ----
    public function subscriptions(Request $request): Response
    {
        $rows = $this->db->all(
            "SELECT s.*, u.email, u.name, p.name AS plan_name FROM subscriptions s
             JOIN users u ON u.id = s.user_id JOIN plans p ON p.id = s.plan_id
             ORDER BY s.id DESC LIMIT 200"
        );
        return Response::ok(['subscriptions' => $rows]);
    }

    public function assignSubscription(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'user_id' => 'required|int',
            'plan_id' => 'required|int',
        ]);
        $plan = $this->plans->find((int) $data['plan_id']);
        if ($plan === null) {
            throw HttpException::notFound('Plan not found');
        }
        $lifetime = filter_var($request->input('lifetime', false), FILTER_VALIDATE_BOOLEAN);
        $id = $this->subs->create([
            'user_id'                => (int) $data['user_id'],
            'plan_id'                => (int) $data['plan_id'],
            'gateway'                => 'manual',
            'status'                 => 'active',
            'is_lifetime'            => $lifetime ? 1 : 0,
            'current_period_end'     => $lifetime ? null : date('Y-m-d H:i:s', strtotime('+1 year')),
            'override_search_limit'  => $request->input('override_search_limit'),
            'override_search_window' => $request->input('override_search_window'),
        ]);
        Audit::log((int) $request->userId(), 'admin.subscription.assign', 'subscription', (string) $id, $request->all(), $request->ip());
        return Response::created(['id' => $id], 'Subscription assigned');
    }

    public function overrideSubscription(Request $request, array $params): Response
    {
        $limit = $request->input('override_search_limit');
        $window = $request->input('override_search_window');
        $lifetime = filter_var($request->input('lifetime', false), FILTER_VALIDATE_BOOLEAN);
        $this->subs->setOverride((int) $params['id'], $limit !== null ? (int) $limit : null, $window, $lifetime);
        Audit::log((int) $request->userId(), 'admin.subscription.override', 'subscription', $params['id'], $request->all(), $request->ip());
        return Response::ok(null, 'Override applied');
    }

    // ---- Merchants CRUD ----
    public function merchants(Request $request): Response
    {
        return Response::ok(['merchants' => $this->merchants->all(false)]);
    }

    public function createMerchant(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'slug' => 'required|string|max:120',
            'name' => 'required|string|max:150',
        ]);
        $id = $this->merchants->create($request->all());
        Audit::log((int) $request->userId(), 'admin.merchant.create', 'merchant', (string) $id, $data, $request->ip());
        return Response::created(['id' => $id], 'Merchant created');
    }

    public function updateMerchant(Request $request, array $params): Response
    {
        $this->merchants->update((int) $params['id'], $request->all());
        Audit::log((int) $request->userId(), 'admin.merchant.update', 'merchant', $params['id'], [], $request->ip());
        return Response::ok(null, 'Merchant updated');
    }

    public function deleteMerchant(Request $request, array $params): Response
    {
        $this->merchants->delete((int) $params['id']);
        Audit::log((int) $request->userId(), 'admin.merchant.delete', 'merchant', $params['id'], [], $request->ip());
        return Response::ok(null, 'Merchant deleted');
    }

    // ---- Coupons management ----
    public function coupons(Request $request): Response
    {
        $page = max(1, (int) $request->query('page', 1));
        $per = min(100, max(5, (int) $request->query('per_page', 25)));
        return Response::ok($this->coupons->paginate($page, $per, $request->query('status'), $request->query('search')));
    }

    public function setCouponStatus(Request $request, array $params): Response
    {
        $data = Validator::make($request->all(), ['status' => 'required|in:active,expired,unverified,rejected,draft']);
        $this->coupons->setStatus((int) $params['id'], $data['status']);
        Audit::log((int) $request->userId(), 'admin.coupon.status', 'coupon', $params['id'], $data, $request->ip());
        return Response::ok(null, 'Coupon updated');
    }

    public function expireCoupon(Request $request, array $params): Response
    {
        $this->coupons->expire((int) $params['id']);
        (new Meilisearch())->deleteDocument((int) $params['id']);
        Audit::log((int) $request->userId(), 'admin.coupon.expire', 'coupon', $params['id'], [], $request->ip());
        return Response::ok(null, 'Coupon expired');
    }

    // ---- Coupon sources ----
    public function sources(Request $request): Response
    {
        $rows = $this->db->all(
            'SELECT cs.*, m.name AS merchant_name FROM coupon_sources cs
             LEFT JOIN merchants m ON m.id = cs.merchant_id ORDER BY cs.id DESC LIMIT 200'
        );
        return Response::ok(['sources' => $rows]);
    }

    public function createSource(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'type' => 'required|in:offer_page,promo_page,rss,sitemap,newsletter,user_submission,telegram,reddit,forum,webpage',
            'url'  => 'required|url',
        ]);
        $id = $this->db->insert(
            'INSERT INTO coupon_sources (merchant_id, type, url, is_active, crawl_frequency_minutes) VALUES (?,?,?,?,?)',
            [$request->input('merchant_id') ? (int) $request->input('merchant_id') : null, $data['type'], $data['url'], 1, (int) $request->input('crawl_frequency_minutes', 180)]
        );
        Audit::log((int) $request->userId(), 'admin.source.create', 'coupon_source', (string) $id, $data, $request->ip());

        // Auto-start ingestion for the new source immediately: crawl it now,
        // then validate + index — so coupons appear within seconds instead of
        // waiting for the next scheduled discovery cycle.
        $this->enqueueEngineJob('discover', ['source_id' => (int) $id]);
        $this->enqueueEngineJob('validate', []);
        $this->enqueueEngineJob('sync', []);

        return Response::created(['id' => $id], 'Source added — the engine is crawling it now');
    }

    /**
     * Queue an engine job (durable in engine_jobs + Redis wakeup hint). The
     * engine worker drains the DB queue every ~15s, so jobs run promptly even
     * if Redis is unavailable.
     */
    private function enqueueEngineJob(string $type, array $payload = []): int
    {
        $id = (int) $this->db->insert(
            'INSERT INTO engine_jobs (type, payload, status, scheduled_at) VALUES (?,?,?,NOW())',
            [$type, $payload ? json_encode($payload) : null, 'queued']
        );
        try {
            RedisClient::instance()->rpush('engine:jobs', json_encode(['id' => $id, 'type' => $type, 'payload' => $payload]));
        } catch (\Throwable $e) {
            // Redis is only a low-latency hint; the scheduler drains the DB queue regardless.
        }
        return $id;
    }

    public function deleteSource(Request $request, array $params): Response
    {
        $this->db->execute('DELETE FROM coupon_sources WHERE id = ?', [(int) $params['id']]);
        Audit::log((int) $request->userId(), 'admin.source.delete', 'coupon_source', $params['id'], [], $request->ip());
        return Response::ok(null, 'Source removed');
    }

    // ---- Analytics ----
    public function searchAnalytics(Request $request): Response
    {
        return Response::ok([
            'daily_volume' => $this->searchLogs->dailyVolume(30),
            'top_queries'  => $this->searchLogs->topQueries(20, 30),
            'avg_latency'  => round($this->searchLogs->avgLatencyMs(30), 1),
            'zero_result'  => (int) $this->db->scalar('SELECT COUNT(*) FROM search_logs WHERE result_count = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'),
        ]);
    }

    public function revenueAnalytics(Request $request): Response
    {
        return Response::ok([
            'mrr'         => round($this->subs->mrrCents() / 100, 2),
            'by_day'      => $this->db->all("SELECT DATE(created_at) AS day, COALESCE(SUM(amount_cents),0)/100 AS revenue FROM payments WHERE status='succeeded' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY day ASC"),
            'by_plan'     => $this->db->all("SELECT p.name, COUNT(*) AS subscribers FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status IN ('active','trialing') GROUP BY p.id ORDER BY subscribers DESC"),
            'failed_30d'  => (int) $this->db->scalar("SELECT COUNT(*) FROM payments WHERE status='failed' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"),
        ]);
    }

    // ---- AI control center ----
    public function aiProviders(Request $request): Response
    {
        return Response::ok(['providers' => $this->db->all('SELECT * FROM ai_providers ORDER BY priority ASC')]);
    }

    public function updateAiProvider(Request $request, array $params): Response
    {
        $enabled = filter_var($request->input('is_enabled', true), FILTER_VALIDATE_BOOLEAN);
        $this->db->execute(
            'UPDATE ai_providers SET is_enabled = ?, priority = COALESCE(?, priority), model = COALESCE(?, model) WHERE id = ?',
            [(int) $enabled, $request->input('priority'), $request->input('model'), (int) $params['id']]
        );
        Audit::log((int) $request->userId(), 'admin.ai.update', 'ai_provider', $params['id'], $request->all(), $request->ip());
        return Response::ok(null, 'AI provider updated');
    }

    // ---- Payments + refunds ----
    public function payments(Request $request): Response
    {
        return Response::ok(['payments' => (new \CouponFind\Services\Billing\BillingService())->listPayments()]);
    }

    public function refundPayment(Request $request, array $params): Response
    {
        $amount = $request->input('amount_cents');
        $result = (new \CouponFind\Services\Billing\BillingService())->refundPayment(
            (int) $params['id'],
            $amount !== null ? (int) $amount : null
        );
        Audit::log((int) $request->userId(), 'admin.payment.refund', 'payment', (string) $params['id'], $result, $request->ip());
        return Response::ok($result, 'Refund issued');
    }

    // ---- Engine control (crawler / validation / indexer) ----
    public function dispatchJob(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'type' => 'required|in:discover,crawl,validate,score,sync,import',
        ]);
        $payload = $request->input('payload', []);
        $id = $this->db->insert(
            'INSERT INTO engine_jobs (type, payload, status, scheduled_at) VALUES (?,?,?,NOW())',
            [$data['type'], is_array($payload) ? json_encode($payload) : null, 'queued']
        );
        // Mirror onto the Redis queue for the worker to pick up promptly.
        RedisClient::instance()->rpush('engine:jobs', json_encode(['id' => $id, 'type' => $data['type'], 'payload' => $payload]));
        Audit::log((int) $request->userId(), 'admin.engine.dispatch', 'engine_job', (string) $id, $data, $request->ip());
        return Response::created(['id' => $id], ucfirst($data['type']) . ' job queued');
    }

    public function jobs(Request $request): Response
    {
        return Response::ok(['jobs' => $this->db->all('SELECT * FROM engine_jobs ORDER BY id DESC LIMIT 100')]);
    }

    public function reindex(Request $request): Response
    {
        $meili = new Meilisearch();
        $meili->ensureIndex();
        $id = $this->db->insert('INSERT INTO engine_jobs (type, status, scheduled_at) VALUES ("sync","queued",NOW())', []);
        RedisClient::instance()->rpush('engine:jobs', json_encode(['id' => $id, 'type' => 'sync']));
        Audit::log((int) $request->userId(), 'admin.indexer.reindex', 'index', null, [], $request->ip());
        return Response::ok(['job_id' => $id], 'Reindex queued');
    }

    // ---- Engine control (24/7 by default; emergency start/stop + live stats) ----
    public function engineControl(Request $request): Response
    {
        $enabled = \CouponFind\Core\Settings::get('engine_enabled', null, '1') !== '0';
        $lastJob = $this->db->first('SELECT type, status, created_at, finished_at FROM engine_jobs ORDER BY id DESC LIMIT 1');
        return Response::ok([
            'enabled' => $enabled,
            'stats'   => [
                'found_today'    => (int) $this->db->scalar('SELECT COUNT(*) FROM coupons WHERE created_at >= CURDATE()'),
                'removed_today'  => (int) $this->db->scalar("SELECT COUNT(*) FROM coupons WHERE status IN ('expired','rejected') AND updated_at >= CURDATE()"),
                'active'         => (int) $this->db->scalar("SELECT COUNT(*) FROM coupons WHERE status = 'active'"),
                'total'          => (int) $this->db->scalar('SELECT COUNT(*) FROM coupons'),
                'active_sources' => (int) $this->db->scalar('SELECT COUNT(*) FROM coupon_sources WHERE is_active = 1'),
                'queued_jobs'    => (int) $this->db->scalar("SELECT COUNT(*) FROM engine_jobs WHERE status = 'queued'"),
                'running_jobs'   => (int) $this->db->scalar("SELECT COUNT(*) FROM engine_jobs WHERE status = 'running'"),
                'last_job'       => $lastJob,
            ],
        ]);
    }

    public function setEngineControl(Request $request): Response
    {
        $enabled = filter_var($request->input('enabled', true), FILTER_VALIDATE_BOOLEAN);
        \CouponFind\Core\Settings::set('engine_enabled', $enabled ? '1' : '0');
        Audit::log((int) $request->userId(), 'admin.engine.toggle', 'engine', null, ['enabled' => $enabled], $request->ip());
        return Response::ok(['enabled' => $enabled], $enabled ? 'Engine resumed' : 'Engine paused (emergency stop)');
    }

    public function purgeCoupons(Request $request): Response
    {
        $scope = (string) $request->input('scope', 'all');
        if ($scope === 'demo') {
            $deleted = $this->db->execute("DELETE FROM coupons WHERE code IN ('AMZ20','FREESHIP','NIKE25','EXTRA15','HOST75','NORD68','RUN30')");
        } else {
            $deleted = $this->db->execute('DELETE FROM coupons');
        }
        try {
            (new Meilisearch())->ensureIndex();
        } catch (\Throwable $e) {
        }
        $id = $this->db->insert('INSERT INTO engine_jobs (type, status, scheduled_at) VALUES ("sync","queued",NOW())', []);
        RedisClient::instance()->rpush('engine:jobs', json_encode(['id' => $id, 'type' => 'sync']));
        Audit::log((int) $request->userId(), 'admin.coupons.purge', 'coupon', null, ['scope' => $scope, 'deleted' => $deleted], $request->ip());
        return Response::ok(['deleted' => $deleted], 'Removed ' . $deleted . ' coupon(s)');
    }

    public function emailUser(Request $request, array $params): Response
    {
        $data = Validator::make($request->all(), [
            'subject' => 'required|string|min:2|max:200',
            'body'    => 'required|string|min:2|max:5000',
        ]);
        $user = $this->users->findById((int) $params['id']);
        if ($user === null) {
            throw HttpException::notFound('User not found');
        }
        $html = Mailer::render($data['subject'], nl2br(htmlspecialchars((string) $data['body'])));
        $outreachFrom = [
            'address' => \CouponFind\Core\Settings::get('mail_user_from_address', null, ''),
            'name'    => \CouponFind\Core\Settings::get('mail_user_from_name', null, ''),
        ];
        $sent = Mailer::send($user['email'], (string) $data['subject'], $html, $user['name'], $outreachFrom['address'] !== '' ? $outreachFrom : null);
        Audit::log((int) $request->userId(), 'admin.user.email', 'user', (string) $params['id'], ['subject' => $data['subject'], 'sent' => $sent], $request->ip());
        if (!$sent) {
            throw new HttpException('Email could not be sent — configure SMTP under Email settings first.', 422);
        }
        return Response::ok(['sent' => true], 'Email sent to ' . $user['email']);
    }

    // ---- Ads / monetization (admin-controlled) ----
    public function ads(Request $request): Response
    {
        return Response::ok(\CouponFind\Controllers\AdsController::publicConfig());
    }

    public function updateAds(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'network' => 'required|in:adsense,ezoic,custom',
        ]);
        \CouponFind\Core\Settings::set('ads_enabled', filter_var($request->input('enabled', false), FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        \CouponFind\Core\Settings::set('ads_network', (string) $data['network']);
        \CouponFind\Core\Settings::set('ads_adsense_client', (string) $request->input('adsense_client', ''));
        \CouponFind\Core\Settings::set('ads_adsense_slot', (string) $request->input('adsense_slot', ''));
        \CouponFind\Core\Settings::set('ads_ezoic_id', (string) $request->input('ezoic_id', ''));
        \CouponFind\Core\Settings::set('ads_custom_code', (string) $request->input('custom_code', ''));
        \CouponFind\Core\Settings::set('ads_frequency', (string) max(1, (int) $request->input('frequency', 1)));
        // Support / donation promo (UPI / Razorpay QR) shown after chat responses.
        \CouponFind\Core\Settings::set('support_enabled', filter_var($request->input('support_enabled', false), FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        \CouponFind\Core\Settings::set('support_title', (string) $request->input('support_title', ''));
        \CouponFind\Core\Settings::set('support_message', (string) $request->input('support_message', ''));
        \CouponFind\Core\Settings::set('support_upi', (string) $request->input('support_upi', ''));
        \CouponFind\Core\Settings::set('support_pay_url', (string) $request->input('support_pay_url', ''));
        \CouponFind\Core\Settings::set('support_qr_url', (string) $request->input('support_qr_url', ''));
        \CouponFind\Core\Settings::set('support_frequency', (string) max(1, (int) $request->input('support_frequency', 3)));
        \CouponFind\Core\Settings::clearCache();
        Audit::log((int) $request->userId(), 'admin.ads.update', 'setting', 'ads', ['network' => $data['network']], $request->ip());
        return Response::ok(\CouponFind\Controllers\AdsController::publicConfig(), 'Ad settings saved');
    }

    // ---- Affiliate networks (Impact + any JSON-feed network) ----
    public function affiliateNetworks(Request $request): Response
    {
        return Response::ok(['networks' => (new \CouponFind\Services\Affiliate\AffiliateService())->networks()]);
    }

    public function addAffiliateNetwork(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'provider' => 'required|in:impact,awin,cj,shareasale,generic',
            'name'     => 'required|string|min:1|max:120',
        ]);
        $config = is_array($request->input('config')) ? $request->input('config') : [];
        $id = (new \CouponFind\Services\Affiliate\AffiliateService())->addNetwork((string) $data['provider'], (string) $data['name'], $config);
        Audit::log((int) $request->userId(), 'admin.affiliate.add', 'affiliate_network', (string) $id, ['provider' => $data['provider']], $request->ip());
        return Response::created(['id' => $id], 'Affiliate network added');
    }

    public function updateAffiliateNetwork(Request $request, array $params): Response
    {
        (new \CouponFind\Services\Affiliate\AffiliateService())->updateNetwork((int) $params['id'], [
            'name'      => $request->input('name'),
            'is_active' => filter_var($request->input('is_active', true), FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
            'config'    => is_array($request->input('config')) ? $request->input('config') : [],
        ]);
        return Response::ok(null, 'Network updated');
    }

    public function deleteAffiliateNetwork(Request $request, array $params): Response
    {
        (new \CouponFind\Services\Affiliate\AffiliateService())->deleteNetwork((int) $params['id']);
        Audit::log((int) $request->userId(), 'admin.affiliate.delete', 'affiliate_network', (string) $params['id'], [], $request->ip());
        return Response::ok(null, 'Network deleted');
    }

    public function syncAffiliate(Request $request, array $params): Response
    {
        $count = (new \CouponFind\Services\Affiliate\AffiliateService())->sync((int) $params['id']);
        Audit::log((int) $request->userId(), 'admin.affiliate.sync', 'affiliate_network', (string) $params['id'], ['imported' => $count], $request->ip());
        return Response::ok(['imported' => $count], 'Synced — imported ' . $count . ' affiliate coupons');
    }

    // ---- Contact messages (from the public contact form) ----
    public function contactMessages(Request $request): Response
    {
        \CouponFind\Controllers\ContactController::ensureTable($this->db);
        return Response::ok([
            'messages' => $this->db->all('SELECT id, name, email, subject, message, status, ip, created_at FROM contact_messages ORDER BY id DESC LIMIT 300'),
            'new'      => (int) $this->db->scalar("SELECT COUNT(*) FROM contact_messages WHERE status = 'new'"),
        ]);
    }

    public function updateContactMessage(Request $request, array $params): Response
    {
        $status = (string) $request->input('status', 'read');
        if (!in_array($status, ['new', 'read', 'archived'], true)) {
            $status = 'read';
        }
        $this->db->execute('UPDATE contact_messages SET status = ? WHERE id = ?', [$status, (int) $params['id']]);
        return Response::ok(null, 'Message updated');
    }

    public function deleteContactMessage(Request $request, array $params): Response
    {
        $this->db->execute('DELETE FROM contact_messages WHERE id = ?', [(int) $params['id']]);
        Audit::log((int) $request->userId(), 'admin.contact.delete', 'contact_message', (string) $params['id'], [], $request->ip());
        return Response::ok(null, 'Message deleted');
    }

    // ---- Live activity feed (for the real-time backend log view) ----
    public function activity(Request $request): Response
    {
        return Response::ok([
            'enabled'        => \CouponFind\Core\Settings::get('engine_enabled', null, '1') !== '0',
            'server_time'    => date('H:i:s'),
            'found_today'    => (int) $this->db->scalar('SELECT COUNT(*) FROM coupons WHERE created_at >= CURDATE()'),
            'removed_today'  => (int) $this->db->scalar("SELECT COUNT(*) FROM coupons WHERE status IN ('expired','rejected') AND updated_at >= CURDATE()"),
            'active'         => (int) $this->db->scalar("SELECT COUNT(*) FROM coupons WHERE status = 'active'"),
            'queued_jobs'    => (int) $this->db->scalar("SELECT COUNT(*) FROM engine_jobs WHERE status = 'queued'"),
            'running_jobs'   => (int) $this->db->scalar("SELECT COUNT(*) FROM engine_jobs WHERE status = 'running'"),
            'jobs'           => $this->db->all('SELECT id, type, status, error, attempts, created_at, started_at, finished_at FROM engine_jobs ORDER BY id DESC LIMIT 25'),
            'recent_coupons' => $this->db->all('SELECT c.id, c.title, c.code, c.status, c.created_at, m.name AS merchant FROM coupons c JOIN merchants m ON m.id = c.merchant_id ORDER BY c.id DESC LIMIT 12'),
        ]);
    }

    // ---- Feature flags ----
    public function flags(Request $request): Response
    {
        return Response::ok(['flags' => $this->db->all('SELECT * FROM feature_flags ORDER BY `key` ASC')]);
    }

    public function updateFlag(Request $request, array $params): Response
    {
        $enabled = filter_var($request->input('is_enabled', false), FILTER_VALIDATE_BOOLEAN);
        $this->db->execute(
            'UPDATE feature_flags SET is_enabled = ?, rollout_pct = COALESCE(?, rollout_pct) WHERE `key` = ?',
            [(int) $enabled, $request->input('rollout_pct'), $params['key']]
        );
        Audit::log((int) $request->userId(), 'admin.flag.update', 'feature_flag', $params['key'], $request->all(), $request->ip());
        return Response::ok(null, 'Flag updated');
    }

    // ---- Settings ----
    public function settings(Request $request): Response
    {
        return Response::ok(['settings' => $this->db->all('SELECT * FROM settings ORDER BY `key` ASC')]);
    }

    public function updateSetting(Request $request, array $params): Response
    {
        $value = (string) $request->input('value', '');
        $this->db->execute(
            'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
            [$params['key'], $value]
        );
        Audit::log((int) $request->userId(), 'admin.setting.update', 'setting', $params['key'], ['value' => $value], $request->ip());
        return Response::ok(null, 'Setting saved');
    }

    // ---- Payment gateway (admin-controlled, switchable at any time) ----
    public function paymentGateway(Request $request): Response
    {
        $billing = new \CouponFind\Services\Billing\BillingService();
        $s = static fn (string $k, string $env): bool => \CouponFind\Core\Settings::get($k, $env) !== '';
        return Response::ok([
            'active'   => $billing->activeGateway(),
            'gateways' => [
                'stripe' => [
                    'label'       => 'Stripe',
                    'configured'  => $billing->stripe()->isConfigured(),
                    'has_secret'  => $s('stripe_secret_key', 'STRIPE_SECRET_KEY'),
                    'has_webhook' => $s('stripe_webhook_secret', 'STRIPE_WEBHOOK_SECRET'),
                ],
                'razorpay' => [
                    'label'          => 'Razorpay',
                    'configured'     => $billing->razorpay()->isConfigured(),
                    'has_key_id'     => $s('razorpay_key_id', 'RAZORPAY_KEY_ID'),
                    'has_key_secret' => $s('razorpay_key_secret', 'RAZORPAY_KEY_SECRET'),
                    'has_webhook'    => $s('razorpay_webhook_secret', 'RAZORPAY_WEBHOOK_SECRET'),
                ],
            ],
        ]);
    }

    public function updatePaymentGateway(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'active' => 'required|in:stripe,razorpay',
        ]);
        \CouponFind\Core\Settings::set('active_payment_gateway', (string) $data['active']);

        // Persist credentials only when a non-empty value is supplied, so a
        // blank field never wipes an existing key.
        foreach (['stripe_secret_key', 'stripe_webhook_secret', 'razorpay_key_id', 'razorpay_key_secret', 'razorpay_webhook_secret'] as $k) {
            $v = $request->input($k);
            if ($v !== null && $v !== '') {
                \CouponFind\Core\Settings::set($k, (string) $v);
            }
        }
        \CouponFind\Core\Settings::clearCache();
        Audit::log((int) $request->userId(), 'admin.payment_gateway.update', 'setting', 'active_payment_gateway', ['active' => $data['active']], $request->ip());
        return Response::ok(['active' => $data['active']], 'Payment gateway updated');
    }

    // ---- Logs / audit ----
    public function auditLogs(Request $request): Response
    {
        $rows = $this->db->all(
            'SELECT a.id, a.action, a.entity_type, a.entity_id, a.meta_json, a.created_at,
                    u.name AS actor_name, u.email AS actor_email
             FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
             ORDER BY a.id DESC LIMIT 200'
        );
        return Response::ok(['logs' => $rows]);
    }

    public function apiLogs(Request $request): Response
    {
        $rows = $this->db->all(
            'SELECT method, path, status_code, took_ms, created_at FROM api_logs ORDER BY id DESC LIMIT 200'
        );
        return Response::ok(['logs' => $rows]);
    }

    // ---- System health ----
    public function health(Request $request): Response
    {
        $redis = RedisClient::instance();
        $meili = new Meilisearch();
        return Response::ok([
            'database'    => Database::instance()->healthy(),
            'redis'       => $redis->isAvailable(),
            'meilisearch' => $meili->isHealthy(),
            'meili_stats' => $meili->stats(),
            'queued_jobs' => (int) $this->db->scalar("SELECT COUNT(*) FROM engine_jobs WHERE status = 'queued'"),
            'failed_jobs' => (int) $this->db->scalar("SELECT COUNT(*) FROM engine_jobs WHERE status = 'failed'"),
            'php_version' => PHP_VERSION,
            'time'        => gmdate('c'),
        ]);
    }
}
