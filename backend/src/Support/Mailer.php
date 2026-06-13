<?php

declare(strict_types=1);

namespace CouponFind\Support;

use CouponFind\Core\Env;
use CouponFind\Core\Settings;

/**
 * Dependency-free SMTP mailer (raw socket). Supports STARTTLS, implicit SSL,
 * or plaintext, with AUTH LOGIN. Credentials/sender are resolved from the
 * admin-editable settings store first, then environment variables. If no host
 * is configured the mailer degrades to a no-op (logs the message) and reports
 * success=false so callers can decide on fallbacks — it never throws.
 */
final class Mailer
{
    /**
     * @return bool whether the message was actually handed off to an SMTP server
     */
    public static function send(string $toEmail, string $subject, string $htmlBody, ?string $toName = null, ?array $from = null): bool
    {
        $host = Settings::get('mail_host', 'MAIL_HOST');
        $fromAddr = !empty($from['address']) ? $from['address'] : Settings::get('mail_from_address', 'MAIL_FROM_ADDRESS', 'no-reply@couponaut.example');
        $fromName = !empty($from['name']) ? $from['name'] : Settings::get('mail_from_name', 'MAIL_FROM_NAME', 'Couponaut');

        if ($host === '') {
            // No SMTP configured — log so it's observable in dev.
            error_log(sprintf('[mail:disabled] to=%s subject=%s', $toEmail, $subject));
            return false;
        }

        $port = (int) (Settings::get('mail_port', 'MAIL_PORT', '587'));
        $enc = strtolower(Settings::get('mail_encryption', 'MAIL_ENCRYPTION', 'tls'));
        $user = Settings::get('mail_username', 'MAIL_USERNAME');
        $pass = Settings::get('mail_password', 'MAIL_PASSWORD');

        try {
            return self::deliver($host, $port, $enc, $user, $pass, $fromAddr, $fromName, $toEmail, $toName, $subject, $htmlBody);
        } catch (\Throwable $e) {
            error_log('[mail:error] ' . $e->getMessage());
            return false;
        }
    }

    private static function deliver(
        string $host,
        int $port,
        string $enc,
        string $user,
        string $pass,
        string $fromAddr,
        string $fromName,
        string $toEmail,
        ?string $toName,
        string $subject,
        string $htmlBody
    ): bool {
        $transport = $enc === 'ssl' ? "ssl://{$host}:{$port}" : "{$host}:{$port}";
        $ctx = stream_context_create();
        $socket = @stream_socket_client($transport, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if ($socket === false) {
            throw new \RuntimeException("SMTP connect failed: {$errstr} ({$errno})");
        }
        stream_set_timeout($socket, 15);

        $read = function () use ($socket): string {
            $data = '';
            while (($line = fgets($socket, 515)) !== false) {
                $data .= $line;
                // A space at position 4 marks the final line of a reply.
                if (strlen($line) < 4 || $line[3] === ' ') {
                    break;
                }
            }
            return $data;
        };
        $expect = function (string $resp, string $code, string $stage) {
            if (strncmp($resp, $code, strlen($code)) !== 0) {
                throw new \RuntimeException("SMTP {$stage} failed: " . trim($resp));
            }
        };
        $cmd = function (string $line) use ($socket): void {
            fwrite($socket, $line . "\r\n");
        };

        $expect($read(), '220', 'greeting');

        $ehloHost = gethostname() ?: 'localhost';
        $cmd('EHLO ' . $ehloHost);
        $ehlo = $read();
        $expect($ehlo, '250', 'EHLO');

        if ($enc === 'tls') {
            $cmd('STARTTLS');
            $expect($read(), '220', 'STARTTLS');
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new \RuntimeException('STARTTLS negotiation failed');
            }
            $cmd('EHLO ' . $ehloHost);
            $expect($read(), '250', 'EHLO(tls)');
        }

        if ($user !== '') {
            $cmd('AUTH LOGIN');
            $expect($read(), '334', 'AUTH');
            $cmd(base64_encode($user));
            $expect($read(), '334', 'AUTH user');
            $cmd(base64_encode($pass));
            $expect($read(), '235', 'AUTH pass');
        }

        $cmd('MAIL FROM:<' . $fromAddr . '>');
        $expect($read(), '250', 'MAIL FROM');
        $cmd('RCPT TO:<' . $toEmail . '>');
        $expect($read(), '25', 'RCPT TO'); // 250 or 251

        $cmd('DATA');
        $expect($read(), '354', 'DATA');

        $headers = [
            'From: ' . self::encodeName($fromName) . " <{$fromAddr}>",
            'To: ' . ($toName ? self::encodeName($toName) . " <{$toEmail}>" : $toEmail),
            'Subject: ' . self::encodeHeader($subject),
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'Date: ' . date('r'),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@couponaut>',
        ];
        // Dot-stuffing per RFC 5321.
        $body = preg_replace('/^\./m', '..', $htmlBody) ?? $htmlBody;
        $cmd(implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.");
        $expect($read(), '250', 'send');

        $cmd('QUIT');
        @fclose($socket);
        return true;
    }

    private static function encodeHeader(string $value): string
    {
        return preg_match('/[^\x20-\x7e]/', $value)
            ? '=?UTF-8?B?' . base64_encode($value) . '?='
            : $value;
    }

    private static function encodeName(string $name): string
    {
        $encoded = self::encodeHeader($name);
        return $encoded === $name ? '"' . addslashes($name) . '"' : $encoded;
    }

    // ---- Templating ----------------------------------------------------

    public static function render(string $heading, string $bodyHtml, ?array $cta = null): string
    {
        $button = '';
        if ($cta && !empty($cta['url']) && !empty($cta['label'])) {
            $button = '<a href="' . htmlspecialchars($cta['url'], ENT_QUOTES) . '" style="display:inline-block;background:#0d0d0d;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;margin-top:20px;">'
                . htmlspecialchars($cta['label'], ENT_QUOTES) . '</a>';
        }
        return '<!DOCTYPE html><html><body style="margin:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;color:#0d0d0d;padding:32px;">'
            . '<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(13,13,13,0.1);border-radius:16px;padding:32px;">'
            . '<div style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;background:#0d0d0d;color:#fff;font-weight:900;margin-bottom:8px;">C</div>'
            . '<div style="font-weight:800;font-size:18px;margin-bottom:2px;">Couponaut</div>'
            . '<h1 style="font-size:22px;margin:16px 0 8px;color:#0d0d0d;">' . htmlspecialchars($heading) . '</h1>'
            . '<div style="color:#555;font-size:15px;line-height:1.6;">' . $bodyHtml . '</div>'
            . $button
            . '<div style="color:#9b9b9b;font-size:12px;margin-top:28px;border-top:1px solid rgba(13,13,13,0.08);padding-top:16px;">You received this email from Couponaut.</div>'
            . '</div></body></html>';
    }
}
