// ============================================================
// DATABASE — SQLite avec migrations
// ============================================================

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');

// Crée le dossier data si besoin
const dataDir = path.dirname(config.DB_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(config.DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// === MIGRATIONS ===
function migrate() {
  // Users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      display_name TEXT,
      color TEXT DEFAULT '#4a9eff',
      avatar TEXT,
      role TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL,
      last_seen INTEGER
    );
  `);

  // Sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  // Agents (un PC = un agent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      api_token TEXT UNIQUE NOT NULL,
      online INTEGER DEFAULT 0,
      last_ping INTEGER,
      chatbox_x INTEGER DEFAULT 4555,
      chatbox_y INTEGER DEFAULT 1122,
      send_x INTEGER DEFAULT 4906,
      send_y INTEGER DEFAULT 1156,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
    CREATE INDEX IF NOT EXISTS idx_agents_token ON agents(api_token);
  `);

  // History (entries) — multi-user, multi-agent
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      author_id TEXT,
      target_user_id TEXT,
      target_agent_id TEXT,
      timestamp INTEGER NOT NULL,
      message TEXT NOT NULL,
      title TEXT,
      status TEXT DEFAULT 'info',
      project TEXT,
      auto_tags TEXT,
      direction TEXT DEFAULT 'received',
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (target_agent_id) REFERENCES agents(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entries_target_user ON entries(target_user_id);
    CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp);
  `);

  // Per-user data
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL,
      message TEXT NOT NULL,
      project TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_workflows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      steps TEXT NOT NULL,
      delay INTEGER DEFAULT 5000,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_schedules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      target_agent_id TEXT,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      pattern TEXT,
      time TEXT,
      weekdays TEXT,
      interval_minutes INTEGER,
      datetime INTEGER,
      enabled INTEGER DEFAULT 1,
      last_run INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      timestamp INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
  `);
}

migrate();

// Helper UUID-like
function uuid() {
  return Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
}

// === Cleanup périodique des sessions expirées ===
setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  } catch (e) {}
}, 60 * 60 * 1000); // 1h

module.exports = { db, uuid };
