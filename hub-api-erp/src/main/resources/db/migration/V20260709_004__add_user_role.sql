ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'USER';

UPDATE users
SET role = 'USER'
WHERE role IS NULL OR role = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_users_role'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT chk_users_role CHECK (role IN ('USER', 'SYSTEM_ADMIN'));
    END IF;
END $$;