import { readFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import { seedDatabase } from "./seed.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
const defaultPath = join(dataDir, "unmapped.db");

let db;

export function getDb() {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  return db;
}

/** Node 22.5+ ships `node:sqlite` (no native addon) — avoids better-sqlite3 ABI mismatches across Node upgrades. */
function preferBuiltinSqlite() {
  const [maj, min = 0] = process.versions.node.split(".").map(Number);
  return maj > 22 || (maj === 22 && min >= 5);
}

/** Match better-sqlite3's `db.transaction(fn)()` contract for DatabaseSync. */
function attachTransactionShim(database) {
  if (typeof database.transaction === "function") return;
  database.transaction = (fn) =>
    function runInTransaction(...args) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const out = fn(...args);
        database.exec("COMMIT");
        return out;
      } catch (err) {
        try {
          database.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    };
}

function openDatabase(path) {
  if (preferBuiltinSqlite()) {
    try {
      const { DatabaseSync } = require("node:sqlite");
      const d = new DatabaseSync(path);
      attachTransactionShim(d);
      d.exec("PRAGMA journal_mode = WAL;");
      d.exec("PRAGMA foreign_keys = ON;");
      return d;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[unmapped] node:sqlite failed, falling back to better-sqlite3:",
        err && err.message ? err.message : err
      );
    }
  }

  const Database = require("better-sqlite3");
  const d = new Database(path);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  return d;
}

function runMigrations(database) {
  const tryAlter = (sql) => {
    try {
      database.exec(sql);
    } catch {
      /* idempotent alters */
    }
  };

  tryAlter("ALTER TABLE inferred_skills ADD COLUMN tier TEXT DEFAULT 'claimed'");
  tryAlter("ALTER TABLE inferred_skills ADD COLUMN skill_id_canonical TEXT");
  tryAlter("ALTER TABLE awarded_badges ADD COLUMN evaluator_source TEXT DEFAULT 'mock'");
  tryAlter("ALTER TABLE awarded_badges ADD COLUMN badge_level INTEGER DEFAULT 1");
  tryAlter("ALTER TABLE awarded_badges ADD COLUMN proof_strength REAL");
  tryAlter("ALTER TABLE talent_profiles ADD COLUMN availability_status TEXT DEFAULT 'open'");
  tryAlter("ALTER TABLE submissions ADD COLUMN status TEXT DEFAULT 'evaluated'");
  tryAlter("ALTER TABLE submissions ADD COLUMN integrity_risk TEXT DEFAULT 'medium'");
  tryAlter("ALTER TABLE skill_verification_tests ADD COLUMN candidate_output TEXT");
  tryAlter("ALTER TABLE skill_verification_tests ADD COLUMN evaluation_json TEXT");
  tryAlter("ALTER TABLE skill_verification_tests ADD COLUMN badge_stage TEXT DEFAULT 'detected'");
  tryAlter("ALTER TABLE skill_verification_tests ADD COLUMN test_spec_json TEXT");

  database.exec(`
    CREATE TABLE IF NOT EXISTS skill_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
      alias TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS match_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER REFERENCES jobs(id),
      talent_id INTEGER REFERENCES users(id),
      initial_match_score REAL,
      initial_rank INTEGER,
      action TEXT CHECK(action IN ('viewed','shortlisted','challenge_sent','challenge_completed','hired','rejected','ignored')),
      rejection_reason TEXT,
      performance_rating INTEGER,
      action_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shortlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER REFERENCES jobs(id),
      talent_id INTEGER REFERENCES users(id),
      company_id INTEGER REFERENCES companies(id),
      notes TEXT,
      stage TEXT DEFAULT 'saved' CHECK(stage IN ('saved','shortlisted','interviewing','offered','hired','rejected')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(job_id, talent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_shortlists_job ON shortlists(job_id);
    CREATE INDEX IF NOT EXISTS idx_match_outcomes_job ON match_outcomes(job_id);

    CREATE TABLE IF NOT EXISTS skill_verification_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      talent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      skill_name TEXT NOT NULL,
      badge_title TEXT NOT NULL,
      challenge_prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','passed','failed')),
      score REAL DEFAULT 0,
      badge_stage TEXT NOT NULL DEFAULT 'detected',
      test_spec_json TEXT,
      candidate_output TEXT,
      evaluation_json TEXT,
      result_notes TEXT,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_skill_verification_submission ON skill_verification_tests(submission_id);

    CREATE TABLE IF NOT EXISTS candidate_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      talent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      embedding_text TEXT NOT NULL,
      embedding_vector TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(talent_id, model)
    );

    CREATE TABLE IF NOT EXISTS candidate_negative_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      talent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
      flags_json TEXT NOT NULL DEFAULT '[]',
      total_penalty INTEGER NOT NULL DEFAULT 0,
      high_risk_count INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      computed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_talent ON candidate_embeddings(talent_id);
    CREATE INDEX IF NOT EXISTS idx_candidate_neg_talent ON candidate_negative_evidence(talent_id);
  `);
}

export function initDb() {
  if (db) return db;
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const path = process.env.SQLITE_PATH || defaultPath;
  db = openDatabase(path);
  db.exec(readFileSync(join(__dirname, "db", "schema.sql"), "utf8"));
  runMigrations(db);
  seedDatabase(db);
  return db;
}
