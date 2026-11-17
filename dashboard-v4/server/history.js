// ============================================================
// HISTORY — Entries multi-user/multi-agent
// ============================================================

const { db, uuid } = require('./db');
const config = require('../config');

function classifyMessage(message) {
  const msg = (message || '').trim();
  if (/^\s*(✅|✓|🎉)/.test(msg)) return 'success';
  if (/^\s*(❌|🚨|⚠️)/.test(msg)) return 'error';
  if (/\b(échec|failed|crash|exception non gérée|fatal error)\b/i.test(msg)) return 'error';
  if (/^(corrigé|terminé|fini|done|ajouté|créé|implémenté|refactorisé)/i.test(msg)) return 'success';
  return 'info';
}

function detectProject(msg, knownProjects = []) {
  const lower = (msg || '').toLowerCase();
  for (const p of knownProjects) {
    if (lower.includes(p.toLowerCase())) return p;
  }
  return 'autre';
}

function autoTag(message) {
  const tags = [];
  const m = (message || '').toLowerCase();
  if (/\b(bug|fix|fixed|corrigé|patch)\b/i.test(m)) tags.push('#bug');
  if (/\b(feature|feat|nouveau|added|ajouté)\b/i.test(m)) tags.push('#feature');
  if (/\b(refactor|refactorisé|cleanup|refonte)\b/i.test(m)) tags.push('#refactor');
  if (/\b(test|tests|spec|tdd)\b/i.test(m)) tags.push('#test');
  if (/\b(commit|push|pull|merge|branch)\b/i.test(m)) tags.push('#git');
  if (/\b(perf|performance|optim|fast|speed)\b/i.test(m)) tags.push('#perf');
  if (/\b(doc|docs|readme|comment)\b/i.test(m)) tags.push('#docs');
  if (/\b(security|secure|auth|password|token)\b/i.test(m)) tags.push('#security');
  if (/\b(ui|ux|design|css|style)\b/i.test(m)) tags.push('#ui');
  if (/\b(api|endpoint|route|http)\b/i.test(m)) tags.push('#api');
  return tags;
}

/**
 * Ajoute une entrée à l'historique.
 * direction = 'received' (notif Claude) ou 'sent' (instruction envoyée)
 */
function addEntry({
  authorId = null,
  targetUserId,
  targetAgentId = null,
  message,
  title = '',
  direction = 'received',
  knownProjects = [],
}) {
  const id = uuid();
  const timestamp = Date.now();
  const status = classifyMessage(message);
  const project = detectProject(message, knownProjects);
  const tags = JSON.stringify(autoTag(message));

  db.prepare(`
    INSERT INTO entries (id, author_id, target_user_id, target_agent_id, timestamp, message, title, status, project, auto_tags, direction)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, authorId, targetUserId, targetAgentId, timestamp, message, title, status, project, tags, direction);

  // Cleanup au-dessus de la limite par user
  const count = db.prepare('SELECT COUNT(*) as n FROM entries WHERE target_user_id = ?').get(targetUserId).n;
  if (count > config.MAX_HISTORY_PER_USER) {
    db.prepare(`
      DELETE FROM entries WHERE id IN (
        SELECT id FROM entries WHERE target_user_id = ? ORDER BY timestamp ASC LIMIT ?
      )
    `).run(targetUserId, count - config.MAX_HISTORY_PER_USER);
  }

  return getEntry(id);
}

function getEntry(id) {
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
  return e ? mapEntry(e) : null;
}

function getUserHistory(userId, { limit = 500 } = {}) {
  return db.prepare(`
    SELECT * FROM entries WHERE target_user_id = ?
    ORDER BY timestamp DESC LIMIT ?
  `).all(userId, limit).reverse().map(mapEntry);
}

function getTeamHistory({ limit = 500 } = {}) {
  return db.prepare(`
    SELECT * FROM entries ORDER BY timestamp DESC LIMIT ?
  `).all(limit).reverse().map(mapEntry);
}

function clearUserHistory(userId) {
  db.prepare('DELETE FROM entries WHERE target_user_id = ?').run(userId);
}

function clearOldUserHistory(userId, days = 7) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM entries WHERE target_user_id = ? AND timestamp < ?').run(userId, cutoff);
}

function mapEntry(e) {
  return {
    id: e.id,
    authorId: e.author_id,
    targetUserId: e.target_user_id,
    targetAgentId: e.target_agent_id,
    timestamp: e.timestamp,
    message: e.message,
    title: e.title,
    status: e.status,
    project: e.project,
    autoTags: e.auto_tags ? JSON.parse(e.auto_tags) : [],
    direction: e.direction,
  };
}

module.exports = {
  addEntry, getEntry, getUserHistory, getTeamHistory,
  clearUserHistory, clearOldUserHistory,
  classifyMessage, detectProject, autoTag,
};
