<?php

declare(strict_types=1);

namespace CouponFind\Controllers;

use CouponFind\Core\Database;
use CouponFind\Core\Request;
use CouponFind\Core\Response;
use CouponFind\Support\Validator;

/**
 * Public contact form. Stores messages in contact_messages so the admin can
 * review every query from the panel. The table is created on demand so this
 * works even on databases provisioned before the table existed.
 */
final class ContactController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::instance();
    }

    public static function ensureTable(Database $db): void
    {
        $db->execute(
            'CREATE TABLE IF NOT EXISTS contact_messages (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                name VARCHAR(120) NOT NULL,
                email VARCHAR(190) NOT NULL,
                subject VARCHAR(200) NULL,
                message TEXT NOT NULL,
                status ENUM("new","read","archived") NOT NULL DEFAULT "new",
                ip VARCHAR(45) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_cm_status (status, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    public function submit(Request $request): Response
    {
        $data = Validator::make($request->all(), [
            'name'    => 'required|string|min:1|max:120',
            'email'   => 'required|email',
            'message' => 'required|string|min:2|max:5000',
        ]);
        $subject = mb_substr((string) $request->input('subject', ''), 0, 200);

        self::ensureTable($this->db);
        $this->db->insert(
            'INSERT INTO contact_messages (name, email, subject, message, status, ip) VALUES (?,?,?,?,?,?)',
            [$data['name'], strtolower((string) $data['email']), $subject, $data['message'], 'new', $request->ip()]
        );

        return Response::created(null, 'Thanks! Your message has been received — we will get back to you soon.');
    }
}
