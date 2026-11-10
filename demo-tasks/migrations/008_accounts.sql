-- Working accounts. INSERT IGNORE keeps existing rows untouched, so passwords changed by employees survive.
-- The owner password is set later by scripts/seed_owner.php from the environment, never from this file.
-- Staff rows keep the role slug that exists when this migration runs; 010 moves them to employee.
INSERT IGNORE INTO users (email, username, password_hash, must_change_password, name, initials, phone, role_id, department_id, is_active)
SELECT a.email, a.username, a.password_hash, a.must_change_password, a.name, a.initials, a.phone, r.id, d.id, 1
FROM (
  SELECT 'aidar@demo.local' AS email, 'aidar' AS username, '$2y$10$baUci0UbUN2u2pvwCQvSQebFg7mVEaHsyNmteUbqhOQHlglA.3OaC' AS password_hash, 0 AS must_change_password, 'Айдар' AS name, 'АД' AS initials, NULL AS phone, 'owner' AS role, 'management' AS dept
  UNION ALL SELECT 'daniyar@demo.local', 'daniyar', '$2y$10$S5Niax1/lgbQC39ap5zj.uZo9DD07DMdxKm2QRs4NyvsfYLn.ruW2', 0, 'Данияр', 'ДН', '+7 700 000 00 01', 'manager', 'sales'
  UNION ALL SELECT 'timur@demo.local', 'timur', '$2y$10$S5Niax1/lgbQC39ap5zj.uZo9DD07DMdxKm2QRs4NyvsfYLn.ruW2', 0, 'Тимур', 'ТМ', '+7 700 000 00 02', 'manager', 'sales'
  UNION ALL SELECT 'erlan@demo.local', 'erlan', '$2y$10$S5Niax1/lgbQC39ap5zj.uZo9DD07DMdxKm2QRs4NyvsfYLn.ruW2', 0, 'Ерлан', 'ЕР', '+7 700 000 00 03', 'manager', 'sales'
  UNION ALL SELECT 'arman@demo.local', 'arman', '$2y$10$S5Niax1/lgbQC39ap5zj.uZo9DD07DMdxKm2QRs4NyvsfYLn.ruW2', 0, 'Арман', 'АР', '+7 700 000 00 04', 'manager', 'sales'
  UNION ALL SELECT 'dinara@demo.local', 'dinara', '$2y$10$S5Niax1/lgbQC39ap5zj.uZo9DD07DMdxKm2QRs4NyvsfYLn.ruW2', 0, 'Динара', 'ДИ', '+7 700 000 00 05', 'manager', 'sales'
) a
JOIN roles r ON r.slug = a.role
LEFT JOIN departments d ON d.slug = a.dept;
