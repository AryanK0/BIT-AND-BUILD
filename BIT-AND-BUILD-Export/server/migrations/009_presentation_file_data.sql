-- Render service disks are ephemeral. Persist private PPT bytes with their
-- existing presentation metadata so protected downloads survive redeploys.
ALTER TABLE presentations
  ADD COLUMN file_data BYTEA,
  ADD COLUMN file_size INTEGER,
  ADD COLUMN file_checksum TEXT;

ALTER TABLE presentations
  ADD CONSTRAINT presentations_file_size_check CHECK (file_size IS NULL OR file_size BETWEEN 1 AND 20971520),
  ADD CONSTRAINT presentations_file_checksum_check CHECK (file_checksum IS NULL OR file_checksum ~ '^[a-f0-9]{64}$');
