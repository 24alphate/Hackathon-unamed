-- Unmapped core schema (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  country TEXT,
  role TEXT NOT NULL CHECK (role IN ('talent', 'company', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS talent_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  headline TEXT,
  country TEXT,
  bio TEXT,
  portfolio_links TEXT -- JSON array
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  industry TEXT,
  country TEXT
);

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  rubric_json TEXT,
  required_outputs TEXT, -- JSON
  skill_targets TEXT     -- JSON
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
  talent_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_description TEXT,
  github_url TEXT,
  live_url TEXT,
  explanation TEXT,
  video_url TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evidence_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions (id) ON DELETE CASCADE,
  project_type TEXT,
  detected_features_json TEXT,
  file_structure_json TEXT,
  readme_signal TEXT,
  authenticity_risk TEXT,
  confidence_score REAL,
  full_eval_json TEXT -- full structured payload for UI (evidenceObject, graph, etc.)
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  description TEXT,
  ontology_source TEXT
);

CREATE TABLE IF NOT EXISTS inferred_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  talent_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  submission_id INTEGER NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  confidence REAL,
  evidence_json TEXT,
  level TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced'))
);

CREATE TABLE IF NOT EXISTS badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  skill_id INTEGER REFERENCES skills (id) ON DELETE SET NULL,
  level TEXT,
  threshold_rules_json TEXT
);

CREATE TABLE IF NOT EXISTS awarded_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  talent_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  badge_id INTEGER NOT NULL REFERENCES badges (id) ON DELETE CASCADE,
  submission_id INTEGER NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  confidence REAL,
  proof_strength_score REAL,
  awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (talent_id, badge_id, submission_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  raw_description TEXT,
  parsed_job_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  talent_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  match_score REAL,
  must_have_score REAL,
  semantic_score REAL,
  risk_score REAL,
  explanation_json TEXT,
  UNIQUE (job_id, talent_id)
);

CREATE TABLE IF NOT EXISTS final_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  talent_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  challenge_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  talent_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount REAL,
  status TEXT,
  payout_method TEXT
);

CREATE TABLE IF NOT EXISTS audit_trail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id INTEGER,
  step_index INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_talent ON submissions (talent_id);
CREATE INDEX IF NOT EXISTS idx_inferred_talent ON inferred_skills (talent_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_matches_job ON matches (job_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_trail (entity_type, entity_id);
