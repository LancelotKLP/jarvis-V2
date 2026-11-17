#!/usr/bin/env node
// ============================================================
// CLAUDE DASHBOARD v4 — Multi-user / Raspberry Pi
// ============================================================

const config = require('./config');
const api = require('./server/api');
const scheduler = require('./server/scheduler');

const server = api.createServer();

server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Claude Dashboard v4 — Multi-user\n`);
  console.log(`   📊 Dashboard    : http://localhost:${config.PORT}`);
  console.log(`   🌐 Réseau       : http://0.0.0.0:${config.PORT}`);
  console.log(`   💾 DB           : ${config.DB_FILE}\n`);
  scheduler.start();
});
