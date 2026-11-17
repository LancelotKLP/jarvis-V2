// ============================================================
// WEBSOCKETS — Channels par user et par agent
// ============================================================

const crypto = require('crypto');

// Map: userId → Set<socket>  (clients dashboard)
const userClients = new Map();
// Map: agentId → socket  (agent unique par PC)
const agentClients = new Map();

function handleHandshake(socket, key) {
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
}

function sendFrame(socket, message) {
  if (!socket || socket.destroyed) return;
  const data = Buffer.from(message);
  const len = data.length;
  let frame;
  if (len < 126) {
    frame = Buffer.concat([Buffer.from([0x81, len]), data]);
  } else if (len < 65536) {
    const buf = Buffer.alloc(4);
    buf.writeUInt8(0x81, 0);
    buf.writeUInt8(126, 1);
    buf.writeUInt16BE(len, 2);
    frame = Buffer.concat([buf, data]);
  } else {
    const buf = Buffer.alloc(10);
    buf.writeUInt8(0x81, 0);
    buf.writeUInt8(127, 1);
    buf.writeBigUInt64BE(BigInt(len), 2);
    frame = Buffer.concat([buf, data]);
  }
  try { socket.write(frame); } catch (e) {}
}

function parseFrame(buffer) {
  if (buffer.length < 2) return null;
  const second = buffer[1];
  const masked = (second & 0x80) === 0x80;
  let payloadLen = second & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  if (masked) {
    if (buffer.length < offset + 4 + payloadLen) return null;
    const mask = buffer.slice(offset, offset + 4);
    offset += 4;
    const payload = buffer.slice(offset, offset + payloadLen);
    const result = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) result[i] = payload[i] ^ mask[i % 4];
    return { payload: result.toString('utf8'), bytesRead: offset + payloadLen };
  } else {
    if (buffer.length < offset + payloadLen) return null;
    const payload = buffer.slice(offset, offset + payloadLen);
    return { payload: payload.toString('utf8'), bytesRead: offset + payloadLen };
  }
}

// === USER DASHBOARD CONNECTIONS ===
function addUserClient(userId, socket) {
  if (!userClients.has(userId)) userClients.set(userId, new Set());
  userClients.get(userId).add(socket);

  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const frame = parseFrame(buffer);
      if (!frame) break;
      buffer = buffer.slice(frame.bytesRead);
      // On peut traiter les messages entrants si besoin (ping, etc.)
    }
  });

  const cleanup = () => {
    const set = userClients.get(userId);
    if (set) {
      set.delete(socket);
      if (set.size === 0) userClients.delete(userId);
    }
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

function sendToUser(userId, event, data = {}) {
  const set = userClients.get(userId);
  if (!set) return;
  const message = JSON.stringify({ event, ...data });
  for (const s of set) sendFrame(s, message);
}

function broadcastToAll(event, data = {}) {
  const message = JSON.stringify({ event, ...data });
  for (const set of userClients.values()) {
    for (const s of set) sendFrame(s, message);
  }
}

// === AGENT CONNECTIONS ===
function addAgentClient(agentId, socket, onMessage) {
  // Si déjà un agent connecté, on déconnecte l'ancien
  const old = agentClients.get(agentId);
  if (old && old !== socket) {
    try { old.destroy(); } catch (e) {}
  }
  agentClients.set(agentId, socket);

  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const frame = parseFrame(buffer);
      if (!frame) break;
      buffer = buffer.slice(frame.bytesRead);
      try {
        const data = JSON.parse(frame.payload);
        if (onMessage) onMessage(agentId, data);
      } catch (e) {}
    }
  });

  const cleanup = () => {
    if (agentClients.get(agentId) === socket) agentClients.delete(agentId);
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

function sendToAgent(agentId, event, data = {}) {
  const socket = agentClients.get(agentId);
  if (!socket) return false;
  const message = JSON.stringify({ event, ...data });
  sendFrame(socket, message);
  return true;
}

function isAgentOnline(agentId) {
  return agentClients.has(agentId);
}

function getOnlineAgentIds() {
  return Array.from(agentClients.keys());
}

// Heartbeat ping toutes les 30s pour garder les connexions vivantes
setInterval(() => {
  const ping = JSON.stringify({ event: 'ping', t: Date.now() });
  for (const set of userClients.values()) {
    for (const s of set) sendFrame(s, ping);
  }
  for (const s of agentClients.values()) sendFrame(s, ping);
}, 30000);

module.exports = {
  handleHandshake,
  addUserClient, sendToUser, broadcastToAll,
  addAgentClient, sendToAgent, isAgentOnline, getOnlineAgentIds,
};
