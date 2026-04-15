'use strict';

/**
 * Production entry point for children.evolvenext.net.
 * 1. Loads env from .env or .secrets/children.env (never crash if missing).
 * 2. Logs only presence of env keys (never values).
 * 3. Bootstraps NestJS (dist/main.js).
 * ISPmanager sets process.env.PORT (Unix socket or port); we listen on it.
 */

const path = require('path');
const fs = require('fs');

const ENV_KEYS_TO_LOG = [
  'STORAGE_API_KEY',
  'FIREBASE_SA_PATH',
  'FIREBASE_SERVICE_ACCOUNT_PATH',
  'FIREBASE_SA_JSON',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FRONTEND_ENABLED',
  'FRONTEND_BUILD_PATH',
  'PORT',
  'NODE_ENV',
];

function loadDotenv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"');
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
    return true;
  } catch (err) {
    return false;
  }
}

function envLoader() {
  const cwd = process.cwd();
  const tried = [];
  let used = null;

  // 1) backend/.env (or symlink)
  const localEnv = path.join(cwd, '.env');
  if (loadDotenv(localEnv)) {
    tried.push(localEnv);
    used = localEnv;
  }

  // 2) /home/pf246008/evolvenext.net/.secrets/children.env
  const secretsEnv = '/home/pf246008/evolvenext.net/.secrets/children.env';
  if (loadDotenv(secretsEnv)) {
    tried.push(secretsEnv);
    if (!used) used = secretsEnv;
  }

  if (!used) {
    console.warn('[server.js] No .env file loaded. Tried: ' + tried.join(', ') || 'backend/.env and ' + secretsEnv);
  } else {
    console.log('[server.js] Loaded env from: ' + used);
  }

  // Log only presence of keys (never values)
  const present = ENV_KEYS_TO_LOG.filter(function (k) {
    return process.env[k] !== undefined && process.env[k] !== '';
  });
  if (present.length) {
    console.log('[server.js] Env keys present: ' + present.join(', '));
  }
}

envLoader();

// Bootstrap NestJS (listens on process.env.PORT)
require('./dist/main.js');
