-- Nullable so existing team credentials are preserved and are never reset.
ALTER TABLE team_credentials
  ADD COLUMN IF NOT EXISTS encrypted_password TEXT;
