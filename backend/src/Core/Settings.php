<?php

declare(strict_types=1);

namespace CouponFind\Core;

/**
 * Settings reads platform configuration from the `settings` table first and
 * falls back to environment variables. This lets the admin override config
 * (e.g. the active payment gateway and its API keys) at runtime without a
 * redeploy. Values are cached per-request.
 */
final class Settings
{
    /** @var array<string,string>|null */
    private static ?array $cache = null;

    /** @return array<string,string> */
    private static function load(): array
    {
        if (self::$cache === null) {
            self::$cache = [];
            try {
                $rows = Database::instance()->all('SELECT `key`, `value` FROM settings');
                foreach ($rows as $row) {
                    self::$cache[(string) $row['key']] = (string) ($row['value'] ?? '');
                }
            } catch (\Throwable) {
                self::$cache = [];
            }
        }
        return self::$cache;
    }

    /**
     * Resolve a setting: DB value (if non-empty) > env var (if provided) > default.
     */
    public static function get(string $key, ?string $envKey = null, string $default = ''): string
    {
        $map = self::load();
        if (isset($map[$key]) && $map[$key] !== '') {
            return $map[$key];
        }
        if ($envKey !== null) {
            $fromEnv = Env::string($envKey, '');
            if ($fromEnv !== '') {
                return $fromEnv;
            }
        }
        return $default;
    }

    /** Upsert a setting value and refresh the cache. */
    public static function set(string $key, string $value): void
    {
        Database::instance()->execute(
            'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
            [$key, $value]
        );
        if (self::$cache !== null) {
            self::$cache[$key] = $value;
        }
    }

    public static function clearCache(): void
    {
        self::$cache = null;
    }
}
