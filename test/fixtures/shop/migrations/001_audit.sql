CREATE TABLE audit_log (
  id BIGINT PRIMARY KEY,
  action TEXT NOT NULL
);

ALTER TABLE audit_log ADD COLUMN created_at TIMESTAMP;
