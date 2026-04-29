/**
 * Env loader BEFORE Nest bootstrap. Import as the first line in main.ts.
 * Loads backend/.env (typically a symlink to a secrets store outside the repo).
 * Never log secret values. Export envFileUsed for /diagnostics.
 *
 * IMPORTANT: dotenv is optional — if not installed (production --omit=dev), we parse manually.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Try to load dotenv.parse, fallback to manual parsing if not available
let dotenvParse: ((src: string) => Record<string, string>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  dotenvParse = require('dotenv').parse;
} catch {
  // dotenv not installed — will use manual parser
}

/**
 * Simple .env parser (fallback if dotenv not installed)
 * Handles: KEY=value, KEY="value", KEY='value', comments, empty lines
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

const BACKEND_ENV = join(process.cwd(), '.env');

let envFileUsed: string | null = null;

function loadOne(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const content = readFileSync(path, 'utf8');
    const parsed = dotenvParse ? dotenvParse(content) : parseEnvFile(content);
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined) process.env[key] = String(value);
    }
    envFileUsed = path;
    return true;
  } catch (err: any) {
    console.warn('[EnvLoader] Failed to load', path, err?.message || err);
    return false;
  }
}

if (loadOne(BACKEND_ENV)) {
  console.log('[EnvLoader] Loaded:', BACKEND_ENV);
} else {
  console.warn('[EnvLoader] No .env file at', BACKEND_ENV, '— using process.env only');
}

export { envFileUsed };
