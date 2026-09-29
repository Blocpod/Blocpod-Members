CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, monthly_price INTEGER, annual_price INTEGER, description TEXT NOT NULL DEFAULT '', entitlements JSONB NOT NULL DEFAULT '{}', active BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','moderator','staff','admin')),
 organization_id TEXT REFERENCES organizations(id), plan_id TEXT NOT NULL DEFAULT 'operator' REFERENCES plans(id),
 membership_status TEXT NOT NULL DEFAULT 'inactive', onboarded BOOLEAN NOT NULL DEFAULT false,
 profile JSONB NOT NULL DEFAULT '{}', entitlement_overrides JSONB NOT NULL DEFAULT '{}',
 stripe_customer_id TEXT UNIQUE, stripe_subscription_id TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL DEFAULT now(), hits INTEGER NOT NULL DEFAULT 1);
CREATE TABLE stripe_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, processed_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE email_outbox (id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),recipient TEXT NOT NULL,subject TEXT NOT NULL,html TEXT NOT NULL,purpose TEXT NOT NULL DEFAULT 'transactional',status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),sent_at TIMESTAMPTZ);
