// ============================================================
// ROUTER — Route les instructions vers le bon agent
// ============================================================

const ws = require('./ws');
const agents = require('./agents');
const history = require('./history');
const userdata = require('./userdata');

// File d'attente par agent : { agentId: [{message, authorId, ...}] }
const queues = new Map();
const processing = new Set();

function getQueue(agentId) {
  if (!queues.has(agentId)) queues.set(agentId, []);
  return queues.get(agentId);
}

/**
 * Envoie un message vers l'agent cible.
 * @param {Object} opts
 * @param {string} opts.targetAgentId - L'agent qui doit exécuter
 * @param {string} opts.authorId - User qui a envoyé (peut être différent du owner de l'agent)
 * @param {string} opts.message - Le contenu
 * @param {number} opts.delay - Délai avant exécution (ms)
 */
function send({ targetAgentId, authorId, message, delay = 0 }) {
  const queue = getQueue(targetAgentId);
  queue.push({ message, authorId, delay, queuedAt: Date.now() });

  // Notification au dashboard pour mise à jour de la queue
  notifyQueueUpdate(targetAgentId);

  processQueue(targetAgentId);
}

async function processQueue(agentId) {
  if (processing.has(agentId)) return;
  processing.add(agentId);

  const queue = getQueue(agentId);
  while (queue.length > 0) {
    const item = queue.shift();
    if (item.delay > 0) {
      await new Promise(r => setTimeout(r, item.delay));
    }

    // Envoie au PC distant via WebSocket
    const sent = ws.sendToAgent(agentId, 'execute', {
      message: item.message,
      authorId: item.authorId,
    });

    if (!sent) {
      // Agent offline : on ne renvoie pas en queue (drop), on log
      console.warn(`⚠️  Agent ${agentId} offline — message perdu : ${item.message.substring(0, 60)}`);
    }

    // Log dans l'historique du target user
    const agent = agents.getAgent(agentId);
    if (agent) {
      history.addEntry({
        authorId: item.authorId,
        targetUserId: agent.userId,
        targetAgentId: agentId,
        message: `→ ${item.message}`,
        direction: 'sent',
        knownProjects: userdata.getSettings(agent.userId).knownProjects || [],
      });
      ws.sendToUser(agent.userId, 'newEntry');
    }

    notifyQueueUpdate(agentId);
  }

  processing.delete(agentId);
}

function notifyQueueUpdate(agentId) {
  const agent = agents.getAgent(agentId);
  if (!agent) return;
  const queue = getQueue(agentId).map(q => ({
    message: q.message,
    authorId: q.authorId,
  }));
  ws.sendToUser(agent.userId, 'queueUpdate', { agentId, queue });
}

function getAgentQueue(agentId) {
  return getQueue(agentId).map(q => ({
    message: q.message,
    authorId: q.authorId,
  }));
}

function clearAgentQueue(agentId) {
  queues.set(agentId, []);
  notifyQueueUpdate(agentId);
}

/**
 * Réception d'une notif depuis un agent (Claude → user).
 * On la stocke dans l'historique de l'owner de l'agent.
 */
function handleAgentNotification({ agentId, message, title }) {
  const agent = agents.getAgent(agentId);
  if (!agent) return;

  const settings = userdata.getSettings(agent.userId);
  const entry = history.addEntry({
    targetUserId: agent.userId,
    targetAgentId: agentId,
    message,
    title,
    direction: 'received',
    knownProjects: settings.knownProjects || [],
  });

  // Notifie tous les clients du user (web)
  ws.sendToUser(agent.userId, 'newEntry', { entry });
  return entry;
}

module.exports = {
  send,
  getAgentQueue,
  clearAgentQueue,
  handleAgentNotification,
};
