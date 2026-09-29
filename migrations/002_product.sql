CREATE TABLE resources (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL, tags JSONB NOT NULL DEFAULT '[]', level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 4),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','scheduled','published','archived')),
 approved BOOLEAN NOT NULL DEFAULT FALSE, publish_at TIMESTAMPTZ, external_url TEXT,
 reading_minutes INTEGER NOT NULL DEFAULT 5, version INTEGER NOT NULL DEFAULT 1, demo BOOLEAN NOT NULL DEFAULT FALSE,
 ai_provider TEXT, ai_model TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE resource_versions (id TEXT PRIMARY KEY,resource_id TEXT REFERENCES resources(id),version INTEGER NOT NULL,body TEXT NOT NULL,editor_id TEXT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE resource_saves (user_id TEXT REFERENCES users(id) ON DELETE CASCADE,resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,resource_id));
CREATE TABLE build_requests (
 id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),title TEXT NOT NULL,summary TEXT NOT NULL,context JSONB NOT NULL DEFAULT '{}',
 classification TEXT NOT NULL DEFAULT 'new_community_tool',cluster TEXT,status TEXT NOT NULL DEFAULT 'submitted',priority INTEGER NOT NULL DEFAULT 0,
 assigned_to TEXT,resource_id TEXT REFERENCES resources(id),update_note TEXT NOT NULL DEFAULT '',merged_into TEXT REFERENCES build_requests(id),
 ai_state TEXT NOT NULL DEFAULT 'pending',ai_analysis TEXT,demo BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE request_votes (request_id TEXT REFERENCES build_requests(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(request_id,user_id));
CREATE TABLE rooms (id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 4),is_private BOOLEAN NOT NULL DEFAULT FALSE,organization_id TEXT REFERENCES organizations(id),archived BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE room_members (room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(room_id,user_id));
CREATE TABLE messages (id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES rooms(id),user_id TEXT REFERENCES users(id),author_name TEXT NOT NULL,body TEXT NOT NULL,parent_id TEXT REFERENCES messages(id),hidden BOOLEAN NOT NULL DEFAULT FALSE,demo BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX messages_room_time ON messages(room_id,created_at);
CREATE TABLE message_reactions (message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,emoji TEXT NOT NULL,PRIMARY KEY(message_id,user_id,emoji));
CREATE TABLE room_reads (room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(room_id,user_id));
CREATE TABLE reports (id TEXT PRIMARY KEY,message_id TEXT REFERENCES messages(id),user_id TEXT REFERENCES users(id),reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE projects (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,goal TEXT NOT NULL DEFAULT '',resource_ids JSONB NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE notifications (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT NOT NULL,href TEXT NOT NULL,read_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE opportunities (id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),request_id TEXT REFERENCES build_requests(id),company TEXT NOT NULL DEFAULT '',goal TEXT NOT NULL,scope TEXT NOT NULL DEFAULT '',budget TEXT NOT NULL DEFAULT '',timeline TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'new',notes TEXT NOT NULL DEFAULT '',value_estimate INTEGER,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE workflows (id TEXT PRIMARY KEY,name TEXT NOT NULL,prompt TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Intelligence',level INTEGER NOT NULL DEFAULT 1,provider TEXT NOT NULL DEFAULT 'openai',model TEXT NOT NULL DEFAULT '',schedule_minutes INTEGER NOT NULL DEFAULT 10080 CHECK(schedule_minutes>=15),enabled BOOLEAN NOT NULL DEFAULT FALSE,next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),lease_until TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE job_runs (id TEXT PRIMARY KEY,workflow_id TEXT REFERENCES workflows(id),status TEXT NOT NULL DEFAULT 'running',provider TEXT,model TEXT,artifact_id TEXT REFERENCES resources(id),error TEXT,tokens INTEGER,started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ);
CREATE TABLE product_events (id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),event TEXT NOT NULL,entity_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE admin_audit (id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),action TEXT NOT NULL,entity_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX notifications_user ON notifications(user_id,created_at);
CREATE INDEX requests_user ON build_requests(user_id,created_at);
CREATE INDEX jobs_workflow ON job_runs(workflow_id,started_at);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
