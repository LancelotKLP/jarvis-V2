// ============================================================
// AUTH — Sessions, password hashing
// ============================================================

const crypto = require('crypto');
const { db, uuid } = require('./db');
const config = require('../config');

// === HASHING ===
function hashPassword(password, salt = null) {
  if (!salt) salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    config.PBKDF2_ITERATIONS,
    config.PBKDF2_KEYLEN,
    config.PBKDF2_DIGEST
  ).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const computed = hashPassword(password, salt);
  return crypto.timingSafeEqual(
    Buffer.from(computed.hash, 'hex'),
    Buffer.from(hash, 'hex')
  );
}

// === USERS ===
function createUser({ username, password, displayName, color = '#4a9eff', role = 'user' }) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) throw new Error('Username déjà utilisé');

  const { hash, salt } = hashPassword(password);
  const id = uuid();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, password_salt, display_name, color, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, hash, salt, displayName || username, color, role, Date.now());

  // Init settings
  db.prepare('INSERT INTO user_settings (user_id, data) VALUES (?, ?)').run(
    id,
    JSON.stringify({
      theme: 'dark',
      autoTagging: true,
      knownProjects: ['renard blanc', 'auto_test', 'sample-app', 'cci', 'sav'],
      projectColors: {
        'renard blanc': '#ef4444',
        'auto_test': '#4a9eff',
        'sample-app': '#a855f7',
        'cci': '#4ade80',
        'sav': '#f59e0b',
        'autre': '#7a8599',
      },
      streak: { current: 0, longest: 0, lastDay: null },
      badges: {},
    })
  );

  return getUser(id);
}

function getUser(id) {
  const u = db.prepare('SELECT id, username, display_name, color, avatar, role, created_at, last_seen FROM users WHERE id = ?').get(id);
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    color: u.color,
    avatar: u.avatar,
    role: u.role,
    createdAt: u.created_at,
    lastSeen: u.last_seen,
  };
}

function getUserByUsername(username) {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  return u || null;
}

function getAllUsers() {
  return db.prepare('SELECT id, username, display_name, color, avatar, role, last_seen FROM users ORDER BY username').all().map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    color: u.color,
    avatar: u.avatar,
    role: u.role,
    lastSeen: u.last_seen,
  }));
}

function updateUser(id, patch) {
  const allowed = ['display_name', 'color', 'avatar'];
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = k === 'displayName' ? 'display_name' : k;
    if (allowed.includes(col)) {
      fields.push(`${col} = ?`);
      values.push(v);
    }
  }
  if (fields.length === 0) return getUser(id);
  values.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getUser(id);
}

function changePassword(id, newPassword) {
  const { hash, salt } = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, id);
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// === LOGIN / SESSIONS ===
function login(username, password) {
  const user = getUserByUsername(username);
  if (!user) throw new Error('Identifiants invalides');
  if (!verifyPassword(password, user.password_hash, user.password_salt)) {
    throw new Error('Identifiants invalides');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expires = now + config.SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token, user.id, now, expires
  );
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, user.id);

  return { token, user: getUser(user.id), expires };
}

function logout(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function getUserBySession(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now());
  if (!session) return null;
  // Refresh last_seen
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), session.user_id);
  return getUser(session.user_id);
}

// === COUNT ===
function userCount() {
  return db.prepare('SELECT COUNT(*) as n FROM users').get().n;
}

module.exports = {
  hashPassword, verifyPassword,
  createUser, getUser, getUserByUsername, getAllUsers, updateUser, changePassword, deleteUser,
  login, logout, getUserBySession,
  userCount,
};
