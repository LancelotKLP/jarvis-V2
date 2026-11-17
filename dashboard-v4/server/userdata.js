// ============================================================
// USER DATA — Settings, Templates, Workflows par user
// ============================================================

const { db, uuid } = require('./db');

// === SETTINGS ===
function getSettings(userId) {
  const row = db.prepare('SELECT data FROM user_settings WHERE user_id = ?').get(userId);
  return row ? JSON.parse(row.data) : {};
}

function updateSettings(userId, patch) {
  const current = getSettings(userId);
  const merged = { ...current, ...patch };
  db.prepare(`
    INSERT INTO user_settings (user_id, data) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data
  `).run(userId, JSON.stringify(merged));
  return merged;
}

// === TEMPLATES ===
function getTemplates(userId) {
  return db.prepare('SELECT * FROM user_templates WHERE user_id = ? ORDER BY sort_order, label').all(userId).map(t => ({
    id: t.id,
    label: t.label,
    message: t.message,
    project: t.project,
    order: t.sort_order,
  }));
}

function addTemplate(userId, { label, message, project = null }) {
  const id = uuid();
  const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM user_templates WHERE user_id = ?').get(userId).next;
  db.prepare('INSERT INTO user_templates (id, user_id, label, message, project, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, userId, label, message, project, order
  );
  return { id, label, message, project, order };
}

function updateTemplate(userId, id, patch) {
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(patch)) {
    if (['label', 'message', 'project'].includes(k)) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
  }
  if (fields.length === 0) return;
  values.push(id, userId);
  db.prepare(`UPDATE user_templates SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
}

function removeTemplate(userId, id) {
  db.prepare('DELETE FROM user_templates WHERE id = ? AND user_id = ?').run(id, userId);
}

function seedDefaultTemplates(userId) {
  const defaults = [
    { label: '⏭️ continue', message: 'continue' },
    { label: '📋 résume', message: 'résume ce que tu as fait' },
    { label: '💾 commit', message: 'commit les changements' },
    { label: '🧪 tests', message: 'lance les tests' },
  ];
  for (const t of defaults) addTemplate(userId, t);
}

// === WORKFLOWS ===
function getWorkflows(userId) {
  return db.prepare('SELECT * FROM user_workflows WHERE user_id = ? ORDER BY created_at').all(userId).map(w => ({
    id: w.id,
    name: w.name,
    description: w.description,
    steps: JSON.parse(w.steps || '[]'),
    delay: w.delay,
    createdAt: w.created_at,
  }));
}

function addWorkflow(userId, { name, description = '', steps = [], delay = 5000 }) {
  const id = uuid();
  db.prepare('INSERT INTO user_workflows (id, user_id, name, description, steps, delay, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, userId, name, description, JSON.stringify(steps), delay, Date.now()
  );
  return { id, name, description, steps, delay };
}

function getWorkflow(userId, id) {
  const w = db.prepare('SELECT * FROM user_workflows WHERE id = ? AND user_id = ?').get(id, userId);
  if (!w) return null;
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    steps: JSON.parse(w.steps || '[]'),
    delay: w.delay,
  };
}

function removeWorkflow(userId, id) {
  db.prepare('DELETE FROM user_workflows WHERE id = ? AND user_id = ?').run(id, userId);
}

// === SCHEDULES ===
function getSchedules(userId) {
  return db.prepare('SELECT * FROM user_schedules WHERE user_id = ? ORDER BY created_at').all(userId).map(mapSchedule);
}

function getAllEnabledSchedules() {
  return db.prepare('SELECT * FROM user_schedules WHERE enabled = 1').all().map(mapSchedule);
}

function addSchedule(userId, schedule) {
  const id = uuid();
  db.prepare(`
    INSERT INTO user_schedules (id, user_id, target_agent_id, message, type, pattern, time, weekdays, interval_minutes, datetime, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, schedule.targetAgentId || null,
    schedule.message, schedule.type, schedule.pattern || null,
    schedule.time || null,
    schedule.weekdays ? JSON.stringify(schedule.weekdays) : null,
    schedule.intervalMinutes || null,
    schedule.datetime || null,
    1, Date.now()
  );
  return { id, ...schedule, enabled: true };
}

function toggleSchedule(userId, id) {
  const s = db.prepare('SELECT enabled FROM user_schedules WHERE id = ? AND user_id = ?').get(id, userId);
  if (!s) return null;
  const newVal = s.enabled ? 0 : 1;
  db.prepare('UPDATE user_schedules SET enabled = ? WHERE id = ?').run(newVal, id);
  return { id, enabled: !!newVal };
}

function setScheduleLastRun(id, ts) {
  db.prepare('UPDATE user_schedules SET last_run = ? WHERE id = ?').run(ts, id);
}

function disableSchedule(id) {
  db.prepare('UPDATE user_schedules SET enabled = 0 WHERE id = ?').run(id);
}

function removeSchedule(userId, id) {
  db.prepare('DELETE FROM user_schedules WHERE id = ? AND user_id = ?').run(id, userId);
}

function mapSchedule(s) {
  return {
    id: s.id,
    userId: s.user_id,
    targetAgentId: s.target_agent_id,
    message: s.message,
    type: s.type,
    pattern: s.pattern,
    time: s.time,
    weekdays: s.weekdays ? JSON.parse(s.weekdays) : null,
    intervalMinutes: s.interval_minutes,
    datetime: s.datetime,
    enabled: !!s.enabled,
    lastRun: s.last_run,
    createdAt: s.created_at,
  };
}

// === AUDIT ===
function recordAudit(userId, action, details = {}) {
  const id = uuid();
  db.prepare('INSERT INTO audit_log (id, user_id, timestamp, action, details) VALUES (?, ?, ?, ?, ?)').run(
    id, userId, Date.now(), action, JSON.stringify(details)
  );
}

function getAudit(userId, limit = 100) {
  return db.prepare('SELECT * FROM audit_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?').all(userId, limit).map(a => ({
    id: a.id,
    userId: a.user_id,
    timestamp: a.timestamp,
    action: a.action,
    details: a.details ? JSON.parse(a.details) : {},
  }));
}

function clearAudit(userId) {
  db.prepare('DELETE FROM audit_log WHERE user_id = ?').run(userId);
}

module.exports = {
  getSettings, updateSettings,
  getTemplates, addTemplate, updateTemplate, removeTemplate, seedDefaultTemplates,
  getWorkflows, addWorkflow, getWorkflow, removeWorkflow,
  getSchedules, getAllEnabledSchedules, addSchedule, toggleSchedule,
  setScheduleLastRun, disableSchedule, removeSchedule,
  recordAudit, getAudit, clearAudit,
};
