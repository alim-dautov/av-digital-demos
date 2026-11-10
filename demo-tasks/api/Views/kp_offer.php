<?php
/**
 * КП PDF template. Replace this one file to change how the PDF looks.
 *
 * Variables (all already escaped-safe via $e()):
 *   $kp      array  — number, client_name, client_company, client_phone, items[{name,qty,unit,price,sum}],
 *                     subtotal, discount, discount_label, amount, notes, valid_until (d.m.Y|null), created (d.m.Y)
 *   $company array  — name, details (multi-line requisites), phone, email, site
 *   $author  array  — name, phone, email, position
 *   $e       callable(string): string — HTML escape
 *   $money   callable(float): string  — "1 250 000 ₸"
 * Font: DejaVu Sans (ships with dompdf, has Cyrillic). Keep CSS simple: dompdf supports CSS 2.1 + a bit.
 */
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 18mm 16mm 18mm 16mm; }
  body { font-family: "DejaVu Sans", sans-serif; font-size: 10pt; color: #111; }
  .head { border-bottom: 3px solid #f97316; padding-bottom: 8px; }
  .logo { font-size: 26pt; font-weight: bold; color: #f97316; letter-spacing: 1px; }
  .logo span { color: #111; }
  .company { font-size: 8.5pt; color: #444; text-align: right; line-height: 1.35; }
  h1 { font-size: 15pt; margin: 18px 0 2px; }
  .muted { color: #666; }
  .box { background: #f6f6f6; border-left: 3px solid #111; padding: 8px 10px; margin: 12px 0; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 10px; }
  table.items th { background: #111; color: #fff; font-weight: bold; padding: 6px; text-align: left; font-size: 9pt; }
  table.items td { border-bottom: 1px solid #ddd; padding: 6px; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .totals { width: 45%; margin-left: 55%; margin-top: 8px; border-collapse: collapse; }
  .totals td { padding: 4px 6px; }
  .grand td { border-top: 2px solid #f97316; font-size: 12pt; font-weight: bold; }
  .notes { margin-top: 16px; }
  .foot { margin-top: 26px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 9pt; }
</style>
</head>
<body>
  <table width="100%" class="head"><tr>
    <td><div class="logo">DEMO<span>.</span></div><div class="muted"><?= $e($company['name']) ?></div></td>
    <td class="company"><?= nl2br($e($company['details'])) ?><?php
      foreach (['phone', 'email', 'site'] as $k) { if ($company[$k] !== '') { echo '<br>' . $e($company[$k]); } } ?></td>
  </tr></table>

  <h1>Коммерческое предложение № <?= $e($kp['number']) ?></h1>
  <div class="muted">от <?= $e($kp['created']) ?></div>

  <div class="box">
    <b>Клиент:</b> <?= $e($kp['client_name']) ?>
    <?php if ($kp['client_company'] !== '') { ?><br><b>Компания:</b> <?= $e($kp['client_company']) ?><?php } ?>
    <?php if ($kp['client_phone'] !== '') { ?><br><b>Телефон:</b> <?= $e($kp['client_phone']) ?><?php } ?>
  </div>

  <table class="items">
    <thead><tr><th style="width:5%">№</th><th>Наименование</th><th class="r" style="width:10%">Кол-во</th><th style="width:8%">Ед.</th><th class="r" style="width:16%">Цена</th><th class="r" style="width:18%">Сумма</th></tr></thead>
    <tbody>
    <?php foreach ($kp['items'] as $i => $it) { ?>
      <tr>
        <td><?= $i + 1 ?></td>
        <td><?= $e($it['name']) ?></td>
        <td class="r"><?= $e(rtrim(rtrim(number_format($it['qty'], 3, ',', ' '), '0'), ',')) ?></td>
        <td><?= $e($it['unit']) ?></td>
        <td class="r"><?= $e($money($it['price'])) ?></td>
        <td class="r"><?= $e($money($it['sum'])) ?></td>
      </tr>
    <?php } ?>
    </tbody>
  </table>

  <table class="totals">
    <?php if ($kp['discount'] > 0) { ?>
      <tr><td>Сумма</td><td class="r"><?= $e($money($kp['subtotal'])) ?></td></tr>
      <tr><td>Скидка <?= $e($kp['discount_label']) ?></td><td class="r">− <?= $e($money($kp['discount'])) ?></td></tr>
    <?php } ?>
    <tr class="grand"><td>Итого</td><td class="r"><?= $e($money($kp['amount'])) ?></td></tr>
  </table>

  <?php if ($kp['notes'] !== '') { ?>
    <div class="notes"><b>Условия и примечания</b><br><?= nl2br($e($kp['notes'])) ?></div>
  <?php } ?>
  <?php if ($kp['valid_until'] !== null) { ?>
    <p><b>Предложение действительно до <?= $e($kp['valid_until']) ?>.</b></p>
  <?php } ?>

  <div class="foot">
    <b>Ваш менеджер:</b> <?= $e($author['name']) ?><?php if ($author['position'] !== '') { echo ', ' . $e($author['position']); } ?>
    <?php if ($author['phone'] !== '') { ?><br>Тел.: <?= $e($author['phone']) ?><?php } ?>
    <?php if ($author['email'] !== '') { ?><br>Email: <?= $e($author['email']) ?><?php } ?>
  </div>
</body>
</html>
