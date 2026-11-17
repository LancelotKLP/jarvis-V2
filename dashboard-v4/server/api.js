// ============================================================
// API v4 — Multi-user avec auth
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const auth = require('./auth');
const agents = require('./agents');
const history = require('./history');
const userdata = require('./userdata');
const router = require('./router');
const ws = require('./ws');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  const url = req.url.split('?')[0];
  let filepath = path.join(config.PUBLIC_DIR, url === '/' ? 'index.html' : url);
  if (!filepath.startsWith(config.PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (!fs.existsSync(filepath)) {
    res.writeHead(404); return res.end('Not found');
  }
  const ext = path.extname(filepath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  fs.createReadStream(filepath).pipe(res);
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { resolve({}); }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    cookies[k] = v.join('=');
  }
  return cookies;
}

function getCurrentUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[config.SESSION_COOKIE];
  if (!token) return { user: null, token: null };
  return { user: auth.getUserBySession(token), token };
}

function requireAuth(req, res) {
  const { user } = getCurrentUser(req);
  if (!user) {
    json(res, { error: 'Non authentifié' }, 401);
    return null;
  }
  return user;
}

function setCookie(res, token, expires) {
  const expDate = new Date(expires).toUTCString();
  res.setHeader('Set-Cookie', `${config.SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expDate}`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${config.SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

const routes = {
  // === AUTH ===
  'GET /api/me': (req, res) => {
    const { user } = getCurrentUser(req);
    if (!user) return json(res, { user: null });
    return json(res, { user });
  },

  'POST /api/login': async (req, res) => {
    const b = await readBody(req);
    if (!b.username || !b.password) return json(res, { error: 'Username + password requis' }, 400);
    try {
      const { token, user, expires } = auth.login(b.username, b.password);
      setCookie(res, token, expires);
      json(res, { user });
    } catch (e) { json(res, { error: e.message }, 401); }
  },

  'POST /api/logout': (req, res) => {
    const { token } = getCurrentUser(req);
    if (token) auth.logout(token);
    clearCookie(res);
    json(res, { ok: true });
  },

  'POST /api/register': async (req, res) => {
    const b = await readBody(req);
    if (!b.username || !b.password) return json(res, { error: 'Username + password requis' }, 400);

    // Pas d'auto-register si déjà des users (sauf admin)
    const isFirstUser = auth.userCount() === 0;
    if (!isFirstUser) {
      const u = requireAuth(req, res);
      if (!u) return;
      if (u.role !== 'admin') return json(res, { error: 'Seul un admin peut créer un user' }, 403);
    }
    try {
      const user = auth.createUser({
        username: b.username,
        password: b.password,
        displayName: b.displayName,
        color: b.color || '#4a9eff',
        role: isFirstUser ? 'admin' : (b.role || 'user'),
      });
      userdata.seedDefaultTemplates(user.id);

      // Si c'est le premier user, on le connecte direct
      if (isFirstUser) {
        const { token, expires } = auth.login(b.username, b.password);
        setCookie(res, token, expires);
      }
      json(res, { user });
    } catch (e) { json(res, { error: e.message }, 400); }
  },

  // === USERS ===
  'GET /api/users': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, auth.getAllUsers());
  },

  'POST /api/users/update': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    const updated = auth.updateUser(u.id, b);
    json(res, updated);
  },

  'POST /api/users/password': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    if (!b.newPassword || b.newPassword.length < 4) return json(res, { error: 'Password trop court' }, 400);
    auth.changePassword(u.id, b.newPassword);
    json(res, { ok: true });
  },

  // === AGENTS ===
  'GET /api/agents': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    // Tous les agents (visibilité d'équipe)
    const all = agents.getAllAgents();
    // On enrichit avec online live (websocket) — plus précis que la DB
    const onlineIds = new Set(ws.getOnlineAgentIds());
    const enriched = all.map(a => ({
      ...a,
      apiToken: a.userId === u.id ? a.apiToken : undefined, // on ne révèle le token qu'au owner
      online: onlineIds.has(a.id),
    }));
    json(res, enriched);
  },

  'POST /api/agents': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    if (!b.name) return json(res, { error: 'Nom requis' }, 400);
    const agent = agents.createAgent(u.id, b.name);
    userdata.recordAudit(u.id, 'agent_create', { agentId: agent.id, name: agent.name });
    json(res, agent);
  },

  'POST /api/agents/update': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    const a = agents.getAgent(b.id);
    if (!a || a.userId !== u.id) return json(res, { error: 'Non autorisé' }, 403);
    const updated = agents.updateAgent(b.id, b);
    json(res, updated);
  },

  'POST /api/agents/delete': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    const a = agents.getAgent(b.id);
    if (!a || a.userId !== u.id) return json(res, { error: 'Non autorisé' }, 403);
    agents.deleteAgent(b.id);
    userdata.recordAudit(u.id, 'agent_delete', { agentId: b.id });
    json(res, { ok: true });
  },

  'POST /api/agents/regenerate-token': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    const a = agents.getAgent(b.id);
    if (!a || a.userId !== u.id) return json(res, { error: 'Non autorisé' }, 403);
    const newToken = agents.regenerateToken(b.id);
    json(res, { apiToken: newToken });
  },

  // === SEND MESSAGE TO AGENT ===
  'POST /api/send': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    if (!b.message?.trim()) return json(res, { error: 'Empty' }, 400);
    if (!b.targetAgentId) return json(res, { error: 'targetAgentId requis' }, 400);
    const target = agents.getAgent(b.targetAgentId);
    if (!target) return json(res, { error: 'Agent introuvable' }, 404);

    router.send({
      targetAgentId: b.targetAgentId,
      authorId: u.id,
      message: b.message,
      delay: b.delay || 0,
    });
    userdata.recordAudit(u.id, 'send', {
      targetAgent: target.name,
      targetUser: target.userId,
      message: b.message.substring(0, 100),
    });
    json(res, { ok: true });
  },

  'POST /api/send-batch': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    if (!Array.isArray(b.messages)) return json(res, { error: 'messages array requis' }, 400);
    if (!b.targetAgentId) return json(res, { error: 'targetAgentId requis' }, 400);
    const delay = b.delay || 3000;
    for (let i = 0; i < b.messages.length; i++) {
      router.send({
        targetAgentId: b.targetAgentId,
        authorId: u.id,
        message: b.messages[i],
        delay: i === 0 ? 0 : delay,
      });
    }
    json(res, { ok: true, count: b.messages.length });
  },

  'GET /api/queue': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const url = new URL(req.url, 'http://localhost');
    const agentId = url.searchParams.get('agentId');
    if (!agentId) return json(res, { queue: [] });
    json(res, { queue: router.getAgentQueue(agentId) });
  },

  'POST /api/queue/clear': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    router.clearAgentQueue(b.agentId);
    json(res, { ok: true });
  },

  // === HISTORY ===
  'GET /api/history': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const url = new URL(req.url, 'http://localhost');
    const targetUserId = url.searchParams.get('userId') || u.id;
    const limit = parseInt(url.searchParams.get('limit') || '500', 10);
    json(res, history.getUserHistory(targetUserId, { limit }));
  },

  'GET /api/history/team': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, history.getTeamHistory({ limit: 500 }));
  },

  'POST /api/history/clear': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    history.clearUserHistory(u.id);
    json(res, { ok: true });
  },

  'POST /api/history/clear-old': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    history.clearOldUserHistory(u.id, b.days || 7);
    json(res, { ok: true });
  },

  // === SETTINGS ===
  'GET /api/settings': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, userdata.getSettings(u.id));
  },

  'POST /api/settings': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    json(res, userdata.updateSettings(u.id, b));
  },

  // === TEMPLATES ===
  'GET /api/templates': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, userdata.getTemplates(u.id));
  },

  'POST /api/templates': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, userdata.addTemplate(u.id, await readBody(req)));
  },

  'POST /api/templates/update': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    userdata.updateTemplate(u.id, b.id, b);
    json(res, { ok: true });
  },

  'POST /api/templates/delete': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    userdata.removeTemplate(u.id, b.id);
    json(res, { ok: true });
  },

  // === WORKFLOWS ===
  'GET /api/workflows': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, userdata.getWorkflows(u.id));
  },

  'POST /api/workflows': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, userdata.addWorkflow(u.id, await readBody(req)));
  },

  'POST /api/workflows/delete': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    userdata.removeWorkflow(u.id, b.id);
    json(res, { ok: true });
  },

  'POST /api/workflows/run': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    if (!b.targetAgentId) return json(res, { error: 'targetAgentId requis' }, 400);
    const wf = userdata.getWorkflow(u.id, b.id);
    if (!wf) return json(res, { error: 'Workflow introuvable' }, 404);
    for (let i = 0; i < wf.steps.length; i++) {
      router.send({
        targetAgentId: b.targetAgentId,
        authorId: u.id,
        message: wf.steps[i],
        delay: i === 0 ? 0 : (wf.delay || 5000),
      });
    }
    userdata.recordAudit(u.id, 'workflow_run', { workflow: wf.name });
    json(res, { ok: true, count: wf.steps.length });
  },

  // === SCHEDULES ===
  'GET /api/schedules': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, userdata.getSchedules(u.id));
  },

  'POST /api/schedules': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, userdata.addSchedule(u.id, await readBody(req)));
  },

  'POST /api/schedules/toggle': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    json(res, userdata.toggleSchedule(u.id, b.id));
  },

  'POST /api/schedules/delete': async (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    userdata.removeSchedule(u.id, b.id);
    json(res, { ok: true });
  },

  // === AUDIT ===
  'GET /api/audit': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    json(res, userdata.getAudit(u.id, 100));
  },

  'POST /api/audit/clear': (req, res) => {
    const u = requireAuth(req, res); if (!u) return;
    userdata.clearAudit(u.id);
    json(res, { ok: true });
  },

  // === STATUS / PUBLIC ===
  'GET /api/status': (req, res) => {
    json(res, {
      version: '4.0',
      hasUsers: auth.userCount() > 0,
    });
  },

  // === AGENT API (auth par token, pas par cookie) ===
  'GET /api/agent-info': (req, res) => {
    const token = req.headers['x-agent-token'];
    if (!token) return json(res, { error: 'Token manquant' }, 401);
    const agent = agents.getAgentByToken(token);
    if (!agent) return json(res, { error: 'Token invalide' }, 401);
    json(res, agent);
  },

  'POST /api/agent-notify': async (req, res) => {
    const token = req.headers['x-agent-token'];
    if (!token) return json(res, { error: 'Token manquant' }, 401);
    const agent = agents.getAgentByToken(token);
    if (!agent) return json(res, { error: 'Token invalide' }, 401);
    const b = await readBody(req);
    if (!b.message) return json(res, { error: 'Message requis' }, 400);
    const entry = router.handleAgentNotification({
      agentId: agent.id,
      message: b.message,
      title: b.title || '',
    });
    json(res, { ok: true, entry });
  },
};

function createServer() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const key = `${req.method} ${url}`;

    // Sert le fichier agent.js publiquement (pas besoin d'auth pour le télécharger)
    if (req.method === 'GET' && url === '/agent.js') {
      const agentPath = path.join(__dirname, '..', 'agent', 'agent.js');
      if (fs.existsSync(agentPath)) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        fs.createReadStream(agentPath).pipe(res);
        return;
      }
    }

    if (routes[key]) {
      try { return routes[key](req, res); }
      catch (e) { console.error(e); return json(res, { error: e.message }, 500); }
    }
    if (req.method === 'GET') return serveStatic(req, res);

    res.writeHead(404);
    res.end('Not found');
  });

  // WebSocket upgrade
  server.on('upgrade', (req, socket, head) => {
    const url = req.url.split('?')[0];
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.end(); return; }

    if (url === '/ws') {
      // Connexion dashboard (user authenticated)
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies[config.SESSION_COOKIE];
      const user = auth.getUserBySession(token);
      if (!user) { socket.end(); return; }
      ws.handleHandshake(socket, key);
      ws.addUserClient(user.id, socket);
    } else if (url.startsWith('/agent-ws')) {
      // Connexion agent
      const urlObj = new URL(req.url, 'http://localhost');
      const agentToken = urlObj.searchParams.get('token');
      if (!agentToken) { socket.end(); return; }
      const agent = agents.getAgentByToken(agentToken);
      if (!agent) { socket.end(); return; }
      ws.handleHandshake(socket, key);
      agents.setAgentOnline(agent.id, true);
      ws.addAgentClient(agent.id, socket, (agentId, data) => {
        // Reçoit les messages de l'agent (notifs Claude → user)
        if (data.event === 'notification') {
          router.handleAgentNotification({
            agentId,
            message: data.message || '',
            title: data.title || '',
          });
        } else if (data.event === 'pong') {
          agents.updateAgent(agentId, { lastPing: Date.now() });
        }
      });
      socket.on('close', () => {
        agents.setAgentOnline(agent.id, false);
        // Notifie les users que l'agent est offline
        ws.broadcastToAll('agentStatusChange', { agentId: agent.id, online: false });
      });
      // Notifie online
      ws.broadcastToAll('agentStatusChange', { agentId: agent.id, online: true });
    } else {
      socket.end();
    }
  });

  return server;
}

module.exports = { createServer };
