ALTER TABLE job_runs ADD COLUMN queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX job_runs_queue ON job_runs(status,queued_at);
UPDATE notifications SET href='/app/build' WHERE href='/app/build-queue';
