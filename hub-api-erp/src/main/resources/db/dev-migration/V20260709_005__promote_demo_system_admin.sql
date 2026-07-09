-- Development-only admin account for operations screens.
UPDATE users
SET role = 'SYSTEM_ADMIN'
WHERE username = 'demo';