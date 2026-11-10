<?php

declare(strict_types=1);

namespace Trx\Domain;

/**
 * Fills a copy of the customer's original timesheet (resources/timesheet/template, unpacked from the
 * approved XLSX). Pure: no DB, no ext-zip; output is a stored ZIP via XlsxWriter::zipFiles.
 *
 * Only these deviations from the original are made (spec 2026-11-08 §6):
 * AJ = SUM(Dn:AHn) instead of D+E+… (text codes would give #VALUE!), hour cells get appended
 * General-format copies of their styles (original #,##0.0 would show 7.75 as 7,8),
 * «код*» + footnote for code/QR conflicts, «НЗ» footnote, calcChain dropped + fullCalcOnLoad, metadata «Demo CRM».
 */
final class TimesheetSheet
{
    public const TEMPLATE_DIR = __DIR__ . '/../../resources/timesheet/template';
    public const CODES = ['Б', 'О', 'А', 'К', 'П', 'Р', 'Д', 'В'];
    public const INCOMPLETE = 'НЗ';
    public const NOTE_INCOMPLETE = 'НЗ — смена не завершена, часы не рассчитаны';
    public const NOTE_CONFLICT = '* — в этот день есть и код, и QR-отметки; часы не учтены, требуется проверка';

    private const FIRST_ROW = 8;
    private const TEMPLATE_ROWS = 13;
    private const LAST_TEMPLATE_ROW = 27;
    private const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    private const MONTHS = [1 => 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    /** Fixed part list of the original (calcChain is read but dropped). */
    private const PARTS = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml',
        'xl/theme/theme1.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/_rels/sheet1.xml.rels',
        'xl/printerSettings/printerSettings1.bin', 'xl/calcChain.xml', 'docProps/core.xml', 'docProps/app.xml'];

    /** @var array<int,int> original style id => appended General-format copy */
    private array $hourStyle = [];

    private \DOMDocument $doc;
    private \DOMXPath $xp;

    /**
     * Totals for one employee row. Only days 1..$daysInMonth count; hours are normalized with hours()
     * exactly as they are written to the day cells, so the cached AJ equals SUM of the visible cells.
     * @param array<int, float|int|string|null> $cells
     */
    public static function totals(array $cells, int $daysInMonth): array
    {
        $count = array_fill_keys(self::CODES, 0);
        $days = 0;
        $hours = 0.0;
        foreach ($cells as $day => $v) {
            if ((int) $day < 1 || (int) $day > $daysInMonth) {
                continue;
            }
            if (is_float($v) || is_int($v)) {
                $days++;
                $hours += self::hours($v);
            } elseif (is_string($v) && isset($count[$v])) {
                $count[$v]++;
            }
        }

        return ['AI' => $days, 'AJ' => round($hours, 2), 'AK' => $count['Б'], 'AL' => $count['П'], 'AM' => $count['О'],
            'AN' => $count['А'], 'AO' => $count['Д'], 'AP' => $count['Р'], 'AQ' => $count['В'], 'AR' => $daysInMonth];
    }

    /**
     * @param array{period:string, org_title:string, employees:list<array{name:string, position:string, cells:array<int, float|int|string|null>}>, conflict_days?:list<array{row:int,day:int}>} $model
     */
    public static function build(array $model, \DateTimeImmutable $now): string
    {
        return (new self())->render($model, $now);
    }

    /** Single normalization of a day's hours (0.01 h), used for both the cell and the totals. */
    public static function hours(int|float $v): float
    {
        return round((float) $v, 2);
    }

    public static function col(int $day): string
    {
        return self::colName(3 + $day);
    }

    private function render(array $model, \DateTimeImmutable $now): string
    {
        if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', (string) $model['period'], $pm)) {
            throw new \InvalidArgumentException('Период должен быть ГГГГ-ММ');
        }
        [$y, $m] = [(int) $pm[1], (int) $pm[2]];
        $dim = (int) (new \DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m)))->format('t');
        $sheetName = sprintf('%02d.%d ', $m, $y);
        $employees = array_values($model['employees']);
        $conflicts = $model['conflict_days'] ?? [];
        $shift = max(0, count($employees) - self::TEMPLATE_ROWS);
        $files = self::readTemplate();

        $styles = new \DOMDocument();
        $styles->loadXML($files['xl/styles.xml']);

        $this->doc = new \DOMDocument();
        $this->doc->preserveWhiteSpace = true;
        $this->doc->loadXML($files['xl/worksheets/sheet1.xml']);
        $this->xp = new \DOMXPath($this->doc);
        $this->xp->registerNamespace('m', self::NS);

        if ($shift > 0) {
            $this->insertRows(self::FIRST_ROW + self::TEMPLATE_ROWS - 1, $shift);
        }
        $org = self::clean(trim((string) $model['org_title']));
        if ($org !== '') {
            $this->setString('Z1', $org);
            $this->setCachedString('A' . (22 + $shift), $org);
        }
        $this->setString('AC3', self::MONTHS[$m]);
        $this->setNumber('C6', self::excelDate($y, $m, 1));
        for ($d = $dim + 1; $d <= 31; $d++) {
            $this->clear(self::col($d) . '7');
        }

        $conflictSet = [];
        foreach ($conflicts as $c) {
            $conflictSet[(int) $c['row'] . ':' . (int) $c['day']] = true;
        }
        foreach ($employees as $i => $e) {
            $r = self::FIRST_ROW + $i;
            $this->setNumber("A{$r}", $i + 1);
            $this->setString("B{$r}", self::clean((string) $e['name']));
            $pos = self::clean(trim((string) ($e['position'] ?? '')));
            if ($pos !== '') {
                $this->setString("C{$r}", $pos);
            }
            for ($d = 1; $d <= $dim; $d++) {
                $v = $e['cells'][$d] ?? null;
                $ref = self::col($d) . $r;
                if (is_float($v) || is_int($v)) {
                    $this->setNumber($ref, self::hours($v), $styles);
                } elseif (is_string($v) && $v !== '') {
                    $this->setString($ref, self::clean($v) . (isset($conflictSet["{$i}:{$d}"]) ? '*' : ''));
                }
            }
            $t = self::totals($e['cells'], $dim);
            foreach ($t as $col => $val) {
                if ($col !== 'AJ') {
                    $this->setNumber("{$col}{$r}", $val);
                }
            }
            $this->setFormula("AJ{$r}", "SUM(D{$r}:AH{$r})", $t['AJ'], $styles);
        }
        $last = self::FIRST_ROW + max(count($employees), self::TEMPLATE_ROWS) - 1;
        for ($r = self::FIRST_ROW + count($employees); $r <= $last; $r++) {
            $this->setFormula("AJ{$r}", "SUM(D{$r}:AH{$r})", 0, $styles);
        }

        $note = self::LAST_TEMPLATE_ROW + 1 + $shift;
        if (self::hasIncomplete($employees, $dim)) {
            $this->setString('A' . $note++, self::NOTE_INCOMPLETE);
        }
        if ($conflicts !== []) {
            $this->setString('A' . $note, self::NOTE_CONFLICT);
        }

        $files['xl/worksheets/sheet1.xml'] = (string) $this->doc->saveXML();
        $files['xl/styles.xml'] = (string) $styles->saveXML();
        $files['xl/workbook.xml'] = self::patchWorkbook($files['xl/workbook.xml'], $sheetName, $last);
        unset($files['xl/calcChain.xml']);
        $files['[Content_Types].xml'] = (string) preg_replace('#<Override PartName="/xl/calcChain.xml"[^>]*/>#', '', $files['[Content_Types].xml']);
        $files['xl/_rels/workbook.xml.rels'] = (string) preg_replace('#<Relationship [^>]*calcChain[^>]*/>#', '', $files['xl/_rels/workbook.xml.rels']);
        $files['docProps/core.xml'] = self::patchCore($files['docProps/core.xml'], $now);
        $files['docProps/app.xml'] = (string) preg_replace('#(<TitlesOfParts><vt:vector[^>]*><vt:lpstr>)[^<]*(</vt:lpstr>)#u', '${1}' . $sheetName . '${2}', $files['docProps/app.xml']);

        return XlsxWriter::zipFiles($files);
    }

    /** @return array<string,string> */
    private static function readTemplate(): array
    {
        $out = [];
        foreach (self::PARTS as $p) {
            $b = @file_get_contents(self::TEMPLATE_DIR . '/' . $p);
            if ($b === false) {
                throw new \RuntimeException('Нет части шаблона табеля: ' . $p);
            }
            $out[$p] = $b;
        }

        return $out;
    }

    /**
     * Keeps only characters allowed by XML 1.0 (#x9 | #xA | #xD | #x20-#xD7FF | #xE000-#xFFFD | #x10000-#x10FFFF).
     * Invalid UTF-8 byte sequences are replaced first, so the rest of the text survives.
     */
    private static function clean(string $s): string
    {
        $s = mb_scrub($s, 'UTF-8');

        return (string) preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', $s);
    }

    private static function colName(int $n): string
    {
        $s = '';
        for (; $n > 0; $n = intdiv($n - 1, 26)) {
            $s = chr(65 + ($n - 1) % 26) . $s;
        }

        return $s;
    }

    private static function colIndex(string $c): int
    {
        $n = 0;
        foreach (str_split($c) as $ch) {
            $n = $n * 26 + ord($ch) - 64;
        }

        return $n;
    }

    private static function excelDate(int $y, int $m, int $d): int
    {
        return intdiv(gmmktime(0, 0, 0, $m, $d, $y) - gmmktime(0, 0, 0, 12, 30, 1899), 86400);
    }

    private function row(int $r): \DOMElement
    {
        $row = $this->xp->query("//m:sheetData/m:row[@r='{$r}']")->item(0);
        if ($row instanceof \DOMElement) {
            return $row;
        }
        $row = $this->doc->createElementNS(self::NS, 'row');
        $row->setAttribute('r', (string) $r);
        $sd = $this->xp->query('//m:sheetData')->item(0);
        $next = null;
        foreach ($this->xp->query('m:row', $sd) as $rr) {
            if ($rr instanceof \DOMElement && (int) $rr->getAttribute('r') > $r) {
                $next = $rr;
                break;
            }
        }
        $sd->insertBefore($row, $next);
        $dim = $this->xp->query('//m:dimension')->item(0);
        if ($dim instanceof \DOMElement && preg_match('/^([A-Z]+\d+):([A-Z]+)(\d+)$/', $dim->getAttribute('ref'), $dm) && (int) $dm[3] < $r) {
            $dim->setAttribute('ref', "{$dm[1]}:{$dm[2]}{$r}");
        }

        return $row;
    }

    private function cell(string $ref): \DOMElement
    {
        $found = $this->xp->query("//m:sheetData/m:row/m:c[@r='{$ref}']")->item(0);
        if ($found instanceof \DOMElement) {
            return $found;
        }
        preg_match('/^([A-Z]+)(\d+)$/', $ref, $mm);
        $row = $this->row((int) $mm[2]);
        $c = $this->doc->createElementNS(self::NS, 'c');
        $c->setAttribute('r', $ref);
        $before = null;
        foreach ($row->childNodes as $n) {
            if ($n instanceof \DOMElement && self::colIndex((string) preg_replace('/\d+/', '', $n->getAttribute('r'))) > self::colIndex($mm[1])) {
                $before = $n;
                break;
            }
        }
        $row->insertBefore($c, $before);

        return $c;
    }

    private static function reset(\DOMElement $c): void
    {
        while ($c->firstChild) {
            $c->removeChild($c->firstChild);
        }
        $c->removeAttribute('t');
    }

    private function setString(string $ref, string $v): void
    {
        $c = $this->cell($ref);
        self::reset($c);
        $c->setAttribute('t', 'inlineStr');
        $is = $this->doc->createElementNS(self::NS, 'is');
        $t = $this->doc->createElementNS(self::NS, 't');
        $t->setAttribute('xml:space', 'preserve');
        $t->appendChild($this->doc->createTextNode($v));
        $is->appendChild($t);
        $c->appendChild($is);
    }

    /** Updates only the cached value of a string formula (A22 = Z1) so viewers that skip recalculation show the requisite. */
    private function setCachedString(string $ref, string $v): void
    {
        $c = $this->cell($ref);
        $old = $this->xp->query('m:v', $c)->item(0);
        $nv = $this->doc->createElementNS(self::NS, 'v');
        $nv->setAttribute('xml:space', 'preserve');
        $nv->appendChild($this->doc->createTextNode($v));
        if ($old) {
            $c->replaceChild($nv, $old);
        } else {
            $c->appendChild($nv);
        }
    }

    private function setNumber(string $ref, int|float $v, ?\DOMDocument $hourStyles = null): void
    {
        $c = $this->cell($ref);
        self::reset($c);
        if ($hourStyles !== null) {
            $this->applyHourStyle($c, $hourStyles);
        }
        $c->appendChild($this->doc->createElementNS(self::NS, 'v', self::num($v)));
    }

    private function setFormula(string $ref, string $f, int|float $cached, \DOMDocument $styles): void
    {
        $c = $this->cell($ref);
        self::reset($c);
        $this->applyHourStyle($c, $styles);
        $c->appendChild($this->doc->createElementNS(self::NS, 'f', $f));
        $c->appendChild($this->doc->createElementNS(self::NS, 'v', self::num($cached)));
    }

    private static function num(int|float $v): string
    {
        if (is_int($v) || floor($v) === $v) {
            return (string) (int) $v;
        }

        return rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.');
    }

    /** Hour cells: same look as the template style, but General number format (shows 7.75 and 8). */
    private function applyHourStyle(\DOMElement $c, \DOMDocument $styles): void
    {
        $s = (int) $c->getAttribute('s');
        if (!isset($this->hourStyle[$s])) {
            $sx = new \DOMXPath($styles);
            $sx->registerNamespace('m', self::NS);
            $xfs = $sx->query('/m:styleSheet/m:cellXfs')->item(0);
            $list = $sx->query('m:xf', $xfs);
            $src = $list->item($s);
            if (!$src instanceof \DOMElement || $src->getAttribute('numFmtId') === '0') {
                $this->hourStyle[$s] = $s;
            } else {
                $copy = $src->cloneNode(true);
                $copy->setAttribute('numFmtId', '0');
                $copy->setAttribute('applyNumberFormat', '1');
                $xfs->appendChild($copy);
                $xfs->setAttribute('count', (string) ($list->length + 1));
                $this->hourStyle[$s] = $list->length;
            }
        }
        $c->setAttribute('s', (string) $this->hourStyle[$s]);
    }

    private function clear(string $ref): void
    {
        $c = $this->xp->query("//m:sheetData/m:row/m:c[@r='{$ref}']")->item(0);
        if ($c instanceof \DOMElement) {
            self::reset($c);
        }
    }

    /** Copies row $src (empty values, same styles) $n times after it; shifts later rows, merges, filter and dimension. */
    private function insertRows(int $src, int $n): void
    {
        $shiftRef = static fn (string $ref): string => (string) preg_replace_callback('/([A-Z]+)(\d+)/', static fn (array $m): string => $m[1] . ((int) $m[2] > $src ? (int) $m[2] + $n : $m[2]), $ref);
        foreach (iterator_to_array($this->xp->query('//m:sheetData/m:row')) as $row) {
            $r = (int) $row->getAttribute('r');
            if ($r <= $src) {
                continue;
            }
            $row->setAttribute('r', (string) ($r + $n));
            foreach ($this->xp->query('m:c', $row) as $c) {
                $c->setAttribute('r', $shiftRef($c->getAttribute('r')));
            }
            foreach ($this->xp->query('m:c/m:f', $row) as $f) {
                $f->nodeValue = $shiftRef($f->nodeValue);
            }
        }
        $srcRow = $this->xp->query("//m:sheetData/m:row[@r='{$src}']")->item(0);
        $after = $srcRow;
        for ($k = 1; $k <= $n; $k++) {
            $copy = $srcRow->cloneNode(true);
            $copy->setAttribute('r', (string) ($src + $k));
            foreach ($this->xp->query('m:c', $copy) as $c) {
                $c->setAttribute('r', (string) preg_replace('/\d+$/', (string) ($src + $k), $c->getAttribute('r')));
                self::reset($c);
            }
            $after->parentNode->insertBefore($copy, $after->nextSibling);
            $after = $copy;
        }
        foreach ($this->xp->query('//m:mergeCells/m:mergeCell') as $mc) {
            $mc->setAttribute('ref', $shiftRef($mc->getAttribute('ref')));
        }
        $af = $this->xp->query('//m:autoFilter')->item(0);
        if ($af instanceof \DOMElement) {
            $af->setAttribute('ref', 'A7:AR' . ($src + $n));
        }
        $dim = $this->xp->query('//m:dimension')->item(0);
        if ($dim instanceof \DOMElement) {
            $dim->setAttribute('ref', $shiftRef($dim->getAttribute('ref')));
        }
    }

    private static function hasIncomplete(array $employees, int $dim): bool
    {
        foreach ($employees as $e) {
            foreach ($e['cells'] as $d => $v) {
                if ($v === self::INCOMPLETE && $d <= $dim) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function patchWorkbook(string $xml, string $sheetName, int $lastRow): string
    {
        $esc = htmlspecialchars($sheetName, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $xml = (string) preg_replace('#(<sheet [^>]*name=")[^"]*(")#u', '${1}' . $esc . '${2}', $xml, 1);
        $range = "'" . $esc . "'!\$A\$7:\$AR\$" . $lastRow;
        $xml = (string) preg_replace_callback("#'[^']*'!\\\$A\\\$7:\\\$AR\\\$\\d+#u", static fn (): string => $range, $xml);
        if (!preg_match('#<calcPr[^>]*fullCalcOnLoad=#', $xml)) {
            $xml = (string) preg_replace('#<calcPr([^>]*?)\s*/>#', '<calcPr$1 fullCalcOnLoad="1"/>', $xml, 1);
        }

        // Drop the author's personal absolute path (x15ac:absPath / its AlternateContent wrapper) from the
        // GENERATED workbook only — the template on disk stays byte-identical.
        return self::stripAbsPath($xml);
    }

    /** Removes x15ac:absPath and any mc:AlternateContent that exists only to wrap it. */
    private static function stripAbsPath(string $xml): string
    {
        $doc = new \DOMDocument();
        $doc->preserveWhiteSpace = true;
        if (!$doc->loadXML($xml)) {
            throw new \RuntimeException('workbook.xml is not well-formed XML');
        }
        $xp = new \DOMXPath($doc);
        $xp->registerNamespace('x15ac', 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/ac');
        $xp->registerNamespace('mc', 'http://schemas.openxmlformats.org/markup-compatibility/2006');
        foreach (iterator_to_array($xp->query('//x15ac:absPath') ?: []) as $node) {
            $parent = $node->parentNode;
            $grand = $parent?->parentNode;
            // Choice that only holds absPath → drop the whole AlternateContent when it has no Fallback/siblings.
            if (
                $parent instanceof \DOMElement
                && $parent->localName === 'Choice'
                && $grand instanceof \DOMElement
                && $grand->localName === 'AlternateContent'
                && $parent->childNodes->length === 1
                && $grand->childNodes->length === 1
            ) {
                $grand->parentNode?->removeChild($grand);
            } else {
                $parent?->removeChild($node);
            }
        }
        $out = $doc->saveXML();
        if ($out === false) {
            throw new \RuntimeException('failed to serialize workbook.xml');
        }

        return $out;
    }

    private static function patchCore(string $xml, \DateTimeImmutable $now): string
    {
        $iso = $now->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
        $xml = (string) preg_replace('#(<dc:creator>)[^<]*(</dc:creator>)#u', '${1}Demo CRM${2}', $xml);
        $xml = (string) preg_replace('#(<cp:lastModifiedBy>)[^<]*(</cp:lastModifiedBy>)#u', '${1}Demo CRM${2}', $xml);

        return (string) preg_replace('#(<dcterms:(?:created|modified)[^>]*>)[^<]*(<)#', '${1}' . $iso . '${2}', $xml);
    }
}
