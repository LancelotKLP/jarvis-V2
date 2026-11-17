// ============================================================
// AGENTS — Gère les PC connectés (1 user → N agents)
// ============================================================

const crypto = require('crypto');
const { db, uuid } = require('./db');

function createAgent(userId, name) {
  const id = uuid();
  const apiToken = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO agents (id, user_id, name, api_token, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, name, apiToken, Date.now());
  return getAgent(id);
}

function getAgent(id) {
  const a = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  return a ? mapAgent(a) : null;
}

function getAgentByToken(token) {
  const a = db.prepare('SELECT * FROM agents WHERE api_token = ?').get(token);
  return a ? mapAgent(a) : null;
}

function getUserAgents(userId) {
  return db.prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(mapAgent);
}

function getAllAgents() {
  return db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all().map(mapAgent);
}

function getOnlineAgents() {
  return db.prepare('SELECT * FROM agents WHERE online = 1').all().map(mapAgent);
}

function updateAgent(id, patch) {
  const allowed = ['name', 'chatbox_x', 'chatbox_y', 'send_x', 'send_y', 'online', 'last_ping'];
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(patch)) {
    let col = k;
    if (k === 'chatboxX') col = 'chatbox_x';
    if (k === 'chatboxY') col = 'chatbox_y';
    if (k === 'sendX') col = 'send_x';
    if (k === 'sendY') col = 'send_y';
    if (k === 'lastPing') col = 'last_ping';
    if (allowed.includes(col)) {
      fields.push(`${col} = ?`);
      values.push(v);
    }
  }
  if (fields.length === 0) return getAgent(id);
  values.push(id);
  db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getAgent(id);
}

function setAgentOnline(id, online = true) {
  db.prepare('UPDATE agents SET online = ?, last_ping = ? WHERE id = ?').run(online ? 1 : 0, Date.now(), id);
}

function deleteAgent(id) {
  db.prepare('DELETE FROM agents WHERE id = ?').run(id);
}

function regenerateToken(id) {
  const newToken = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE agents SET api_token = ? WHERE id = ?').run(newToken, id);
  return newToken;
}

function mapAgent(a) {
  return {
    id: a.id,
    userId: a.user_id,
    name: a.name,
    apiToken: a.api_token,
    online: !!a.online,
    lastPing: a.last_ping,
    chatboxX: a.chatbox_x,
    chatboxY: a.chatbox_y,
    sendX: a.send_x,
    sendY: a.send_y,
    createdAt: a.created_at,
  };
}

// Marque "offline" les agents qui n'ont pas pingé depuis 2 minutes
setInterval(() => {
  try {
    const cutoff = Date.now() - 2 * 60 * 1000;
    db.prepare('UPDATE agents SET online = 0 WHERE last_ping < ? AND online = 1').run(cutoff);
  } catch (e) {}
}, 30 * 1000);

module.exports = {
  createAgent, getAgent, getAgentByToken,
  getUserAgents, getAllAgents, getOnlineAgents,
  updateAgent, setAgentOnline, deleteAgent,
  regenerateToken,
};
