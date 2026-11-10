<?php

declare(strict_types=1);

namespace Trx\Domain;

/**
 * Minimal .xlsx writer (no extensions needed): stored ZIP + SpreadsheetML.
 * Numbers become numeric cells, everything else inline strings. First row of each sheet is bold.
 */
final class XlsxWriter
{
    /** @param array<string, list<list<scalar|null>>> $sheets */
    public static function build(array $sheets): string
    {
        $files = [];
        $sheetEntries = '';
        $rels = '';
        $types = '';
        $i = 0;
        foreach ($sheets as $name => $rows) {
            $i++;
            $files["xl/worksheets/sheet{$i}.xml"] = self::sheet($rows);
            $sheetEntries .= '<sheet name="' . self::esc(mb_substr(preg_replace('/[\\\\\/?*\[\]:]/u', ' ', (string) $name) ?? 'Лист', 0, 31)) . "\" sheetId=\"{$i}\" r:id=\"rId{$i}\"/>";
            $rels .= "<Relationship Id=\"rId{$i}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{$i}.xml\"/>";
            $types .= "<Override PartName=\"/xl/worksheets/sheet{$i}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>";
        }
        $n = $i + 1;
        $rels .= "<Relationship Id=\"rId{$n}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>";
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
        $files['[Content_Types].xml'] = $xml . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' . $types . '</Types>';
        $files['_rels/.rels'] = $xml . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
        $files['xl/workbook.xml'] = $xml . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' . $sheetEntries . '</sheets></workbook>';
        $files['xl/_rels/workbook.xml.rels'] = $xml . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $rels . '</Relationships>';
        $files['xl/styles.xml'] = $xml . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>';

        return self::zipFiles($files);
    }

    /** @param list<list<scalar|null>> $rows */
    private static function sheet(array $rows): string
    {
        $out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
        foreach ($rows as $r => $row) {
            $out .= '<row r="' . ($r + 1) . '">';
            foreach (array_values($row) as $c => $value) {
                $ref = self::col($c) . ($r + 1);
                $style = $r === 0 ? ' s="1"' : '';
                if ($value === null || $value === '') {
                    continue;
                }
                if (is_int($value) || is_float($value)) {
                    $out .= "<c r=\"{$ref}\"{$style}><v>{$value}</v></c>";
                } else {
                    $out .= "<c r=\"{$ref}\"{$style} t=\"inlineStr\"><is><t xml:space=\"preserve\">" . self::esc((string) $value) . '</t></is></c>';
                }
            }
            $out .= '</row>';
        }

        return $out . '</sheetData></worksheet>';
    }

    public static function col(int $index): string
    {
        $s = '';
        for ($n = $index + 1; $n > 0; $n = intdiv($n - 1, 26)) {
            $s = chr(65 + ($n - 1) % 26) . $s;
        }

        return $s;
    }

    private static function esc(string $s): string
    {
        $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s) ?? '';

        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    /** @param array<string, string> $files */
    public static function zipFiles(array $files): string
    {
        $data = '';
        $central = '';
        $count = 0;
        foreach ($files as $name => $content) {
            $crc = crc32($content);
            $len = strlen($content);
            $offset = strlen($data);
            $head = pack('vvvvvVVVvv', 20, 0x0800, 0, 0, 0x21, $crc, $len, $len, strlen($name), 0);
            $data .= "PK\x03\x04" . $head . $name . $content;
            $central .= "PK\x01\x02" . pack('vvvvvvVVVvvvvvVV', 20, 20, 0x0800, 0, 0, 0x21, $crc, $len, $len, strlen($name), 0, 0, 0, 0, 0, $offset) . $name;
            $count++;
        }

        return $data . $central . "PK\x05\x06" . pack('vvvvVVv', 0, 0, $count, $count, strlen($central), strlen($data), 0);
    }
}
