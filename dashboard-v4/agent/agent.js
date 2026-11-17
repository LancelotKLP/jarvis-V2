#!/usr/bin/env node
// ============================================================
// CLAUDE DASHBOARD AGENT — Tourne sur chaque PC
// ============================================================
//
// Usage :
//   node agent.js
//
// Configuration via variables d'env ou ~/.claude-dashboard-agent.json :
//   SERVER_URL  = http://192.168.1.42:3000  (URL du serveur central)
//   AGENT_TOKEN = abc123...                 (token donné à la création)
//
// Le fichier de config est au format JSON :
// {
//   "serverUrl": "http://...",
//   "agentToken": "..."
// }
// ============================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const crypto = require('crypto');

const CONFIG_FILE = path.join(process.env.HOME, '.claude-dashboard-agent.json');

// === LOAD CONFIG ===
function loadConfig() {
  let cfg = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) {}
  }
  if (process.env.SERVER_URL) cfg.serverUrl = process.env.SERVER_URL;
  if (process.env.AGENT_TOKEN) cfg.agentToken = process.env.AGENT_TOKEN;
  return cfg;
}

const config = loadConfig();
if (!config.serverUrl || !config.agentToken) {
  console.error('❌ Config incomplète.');
  console.error(`   Crée ${CONFIG_FILE} avec :`);
  console.error(`   { "serverUrl": "http://IP_DU_SERVEUR:3000", "agentToken": "TOKEN" }`);
  console.error(`   Ou utilise les variables d'env SERVER_URL et AGENT_TOKEN.`);
  process.exit(1);
}

const SERVER_URL = config.serverUrl.replace(/\/$/, '');
const AGENT_TOKEN = config.agentToken;

console.log(`\n🤖 Claude Dashboard Agent`);
console.log(`   📡 Serveur : ${SERVER_URL}`);
console.log(`   🔑 Token   : ${AGENT_TOKEN.substring(0, 8)}...`);
console.log('');

// === CHATBOX SETTINGS ===
// Récupérés du serveur après connexion
let CHATBOX = { x: 4555, y: 1122, sx: 4906, sy: 1156 };

// === ENVOI VS CODE LOCAL ===
function sendToVSCode(message) {
  const escaped = message.replace(/'/g, "'\\''");
  const script = `
    echo '${escaped}' | pbcopy
    cliclick c:${CHATBOX.x},${CHATBOX.y}
    sleep 0.3
    osascript -e 'tell application "System Events" to keystroke "v" using command down'
    sleep 0.3
    cliclick c:${CHATBOX.sx},${CHATBOX.sy}
  `;
  exec(script, (err) => {
    if (err) console.error('❌ Envoi VS Code échoué:', err.message);
    else console.log(`✅ Envoyé : ${message.substring(0, 60)}`);
  });
}

// === CHARGE CONFIG CHATBOX DEPUIS LE SERVEUR ===
function fetchAgentInfo() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SERVER_URL}/api/agent-info`);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: { 'X-Agent-Token': AGENT_TOKEN },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// === WEBSOCKET MINIMAL CLIENT ===
function connectWebSocket() {
  const url = new URL(SERVER_URL);
  const useTLS = url.protocol === 'https:';
  const port = url.port || (useTLS ? 443 : 80);
  const host = url.hostname;
  const wsKey = crypto.randomBytes(16).toString('base64');

  const path = `/agent-ws?token=${encodeURIComponent(AGENT_TOKEN)}`;
  const headers = [
    `GET ${path} HTTP/1.1`,
    `Host: ${host}:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${wsKey}`,
    'Sec-WebSocket-Version: 13',
    '\r\n'
  ].join('\r\n');

  const lib = useTLS ? require('tls') : require('net');
  const socket = useTLS
    ? lib.connect({ host, port, rejectUnauthorized: false }, () => socket.write(headers))
    : lib.connect({ host, port }, () => socket.write(headers));

  let handshakeDone = false;
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    if (!handshakeDone) {
      const idx = buffer.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const head = buffer.slice(0, idx).toString();
      if (!head.includes('101')) {
        console.error('❌ Handshake échoué:', head.split('\r\n')[0]);
        socket.destroy();
        return;
      }
      buffer = buffer.slice(idx + 4);
      handshakeDone = true;
      console.log('🟢 Connecté au serveur');
    }

    while (true) {
      const frame = parseFrame(buffer);
      if (!frame) break;
      buffer = buffer.slice(frame.bytesRead);
      try {
        const data = JSON.parse(frame.payload);
        handleMessage(socket, data);
      } catch (e) {}
    }
  });

  socket.on('close', () => {
    console.log('🔴 Connexion fermée — reconnexion dans 3s...');
    setTimeout(connectWebSocket, 3000);
  });

  socket.on('error', (err) => {
    console.error('❌ Socket erreur:', err.message);
    try { socket.destroy(); } catch (e) {}
  });
}

function parseFrame(buffer) {
  if (buffer.length < 2) return null;
  const second = buffer[1];
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
  if (buffer.length < offset + payloadLen) return null;
  const payload = buffer.slice(offset, offset + payloadLen);
  return { payload: payload.toString('utf8'), bytesRead: offset + payloadLen };
}

function sendFrame(socket, message) {
  const data = Buffer.from(message);
  const len = data.length;
  // On masque depuis le client (RFC websocket)
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];

  let header;
  if (len < 126) {
    header = Buffer.from([0x81, 0x80 | len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header.writeUInt8(0x81, 0);
    header.writeUInt8(0x80 | 126, 1);
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header.writeUInt8(0x81, 0);
    header.writeUInt8(0x80 | 127, 1);
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try { socket.write(Buffer.concat([header, mask, masked])); } catch (e) {}
}

function handleMessage(socket, data) {
  if (data.event === 'execute') {
    const message = data.message;
    if (message) sendToVSCode(message);
  } else if (data.event === 'ping') {
    sendFrame(socket, JSON.stringify({ event: 'pong', t: Date.now() }));
  } else if (data.event === 'updateChatbox') {
    if (data.x) CHATBOX.x = data.x;
    if (data.y) CHATBOX.y = data.y;
    if (data.sx) CHATBOX.sx = data.sx;
    if (data.sy) CHATBOX.sy = data.sy;
    console.log(`🎯 Chatbox mise à jour : ${CHATBOX.x},${CHATBOX.y} → ${CHATBOX.sx},${CHATBOX.sy}`);
  }
}

// === ENVOI DE NOTIFS AU SERVEUR ===
// L'agent peut envoyer des notifs (ex: si Claude termine une tâche)
// Via API HTTP : POST /api/agent-notify
function sendNotificationToServer(message, title = '') {
  const url = new URL(`${SERVER_URL}/api/agent-notify`);
  const data = JSON.stringify({ message, title });
  const lib = url.protocol === 'https:' ? https : http;
  const req = lib.request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'X-Agent-Token': AGENT_TOKEN,
    },
  });
  req.on('error', () => {});
  req.write(data);
  req.end();
}

// === START ===
async function start() {
  // Récupère info agent (chatbox coords)
  try {
    const info = await fetchAgentInfo();
    if (info.chatboxX) CHATBOX.x = info.chatboxX;
    if (info.chatboxY) CHATBOX.y = info.chatboxY;
    if (info.sendX) CHATBOX.sx = info.sendX;
    if (info.sendY) CHATBOX.sy = info.sendY;
    console.log(`🎯 Chatbox : ${CHATBOX.x},${CHATBOX.y} → ${CHATBOX.sx},${CHATBOX.sy}`);
  } catch (e) {
    console.warn('⚠️  Impossible de récupérer agent-info, utilisation des défauts');
  }

  connectWebSocket();
}

start();

// Expose la fonction pour des intégrations futures (hooks Claude Code)
module.exports = { sendNotificationToServer };
