INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'calls' AND p.action = 'view'
WHERE r.slug = 'rop';
