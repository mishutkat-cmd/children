/**
 * Env loader BEFORE Nest bootstrap. Import as the first line in main.ts.
 * Order: 1) backend/.env  2) /home/<user>/<domain>/.secrets/<project>.env
 * Merge: second overrides first. Never log secret values. Export envFileUsed for /diagnostics.
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

// 1) backend/.env (or symlink)  2) .secrets/<project>.env
const BACKEND_ENV = join(process.cwd(), '.env');
const SECRETS_ENV = '/home/pf246008/evolvenext.net/.secrets/children.env';

let envFileUsed: string | null = null;

function loadOne(path: string, merge = true): boolean {
  if (!existsSync(path)) return false;
  try {
    const content = readFileSync(path, 'utf8');
    const parsed = dotenvParse ? dotenvParse(content) : parseEnvFile(content);
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined) {
        if (merge || process.env[key] === undefined) {
          process.env[key] = String(value);
        }
      }
    }
    envFileUsed = path;
    return true;
  } catch (err: any) {
    console.warn('[EnvLoader] Failed to load', path, err?.message || err);
    return false;
  }
}

const loaded1 = loadOne(BACKEND_ENV);
const loaded2 = loadOne(SECRETS_ENV);
if (loaded1) console.log('[EnvLoader] Loaded:', BACKEND_ENV);
if (loaded2) console.log('[EnvLoader] Loaded:', SECRETS_ENV);
if (!loaded1 && !loaded2) {
  console.warn('[EnvLoader] No .env files found, using process.env only');
}

export { envFileUsed };
