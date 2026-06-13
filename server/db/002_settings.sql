-- ========== ADMIN + SETTINGS ==========
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- defaults
INSERT INTO app_settings(key, value) VALUES
  ('signup_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- promote first user (oldest by created_at) to admin if no admin exists
DO $$
DECLARE first_user UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE is_admin = TRUE) THEN
    SELECT id INTO first_user FROM users ORDER BY created_at ASC LIMIT 1;
    IF first_user IS NOT NULL THEN
      UPDATE users SET is_admin = TRUE WHERE id = first_user;
    END IF;
  END IF;
END $$;
