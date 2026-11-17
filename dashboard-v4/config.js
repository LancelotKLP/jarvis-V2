// ============================================================
// CONFIG v4 — Multi-user
// ============================================================

const path = require('path');

module.exports = {
  PORT: 3000,

  // Base de données SQLite
  DB_FILE: path.join(__dirname, 'data', 'dashboard.db'),

  // Sessions
  SESSION_COOKIE: 'cdash_session',
  SESSION_DURATION_DAYS: 30,

  // Auth
  PBKDF2_ITERATIONS: 100000,
  PBKDF2_KEYLEN: 64,
  PBKDF2_DIGEST: 'sha512',

  // Hot reload
  PUBLIC_DIR: path.join(__dirname, 'public'),

  // Limites
  MAX_HISTORY_PER_USER: 5000,

  // Premier user créé automatiquement si DB vide
  // (pour que le premier qui lance le serveur se crée un compte admin)
  ALLOW_INITIAL_REGISTER: true,
};
