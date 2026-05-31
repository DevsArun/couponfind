<?php

declare(strict_types=1);

namespace CouponFind\Support;

/**
 * Minimal, dependency-free PDF writer (single page, Helvetica). Enough to
 * produce clean text-based documents such as invoices without pulling in a
 * PDF library. Coordinates are PDF points; origin is bottom-left.
 */
final class Pdf
{
    private const PAGE_W = 595; // A4 @ 72dpi
    private const PAGE_H = 842;

    /** @var array<int,array{x:float,y:float,size:int,text:string}> */
    private array $items = [];
    private float $cursorY = self::PAGE_H - 60;

    public function text(string $text, int $size = 11, float $x = 56, ?float $y = null): self
    {
        $y ??= $this->cursorY;
        $this->items[] = ['x' => $x, 'y' => $y, 'size' => $size, 'text' => self::escape($text)];
        return $this;
    }

    /** Write a line at the current cursor and advance downward by $size + lead. */
    public function line(string $text = '', int $size = 11, float $x = 56, float $lead = 8): self
    {
        $this->text($text, $size, $x, $this->cursorY);
        $this->cursorY -= $size + $lead;
        return $this;
    }

    public function gap(float $h = 12): self
    {
        $this->cursorY -= $h;
        return $this;
    }

    /** A horizontal rule drawn as a thin row of underscores. */
    public function rule(): self
    {
        return $this->line(str_repeat('_', 78), 11, 56, 10);
    }

    public function render(): string
    {
        // Build the content stream.
        $content = "BT\n";
        foreach ($this->items as $it) {
            $content .= sprintf("/F1 %d Tf\n%.2F %.2F Td\n(%s) Tj\n%.2F %.2F Td\n",
                $it['size'], $it['x'], $it['y'], $it['text'], -$it['x'], -$it['y']);
        }
        $content .= "ET";

        $objects = [];
        $objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
        $objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
        $objects[3] = sprintf(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            self::PAGE_W, self::PAGE_H
        );
        $objects[4] = "<< /Length " . strlen($content) . " >>\nstream\n" . $content . "\nendstream";
        $objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $num => $body) {
            $offsets[$num] = strlen($pdf);
            $pdf .= $num . " 0 obj\n" . $body . "\nendobj\n";
        }

        $xrefPos = strlen($pdf);
        $count = count($objects) + 1;
        $pdf .= "xref\n0 " . $count . "\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i < $count; $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        $pdf .= "trailer\n<< /Size " . $count . " /Root 1 0 R >>\n";
        $pdf .= "startxref\n" . $xrefPos . "\n%%EOF";

        return $pdf;
    }

    private static function escape(string $text): string
    {
        // Drop non-Latin1 chars Helvetica can't render, then escape PDF syntax.
        $text = preg_replace('/[^\x20-\x7e]/', '', $text) ?? $text;
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
    }
}
