import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse } from 'dotenv';

/**
 * Load environment variables with priority:
 * 1. backend/.env (local dev)
 * 2. /home/<user>/<site>/.secrets/<project>.env (production)
 * 3. process.env (system environment)
 */
export function loadEnvFiles(): Record<string, string> {
  const env: Record<string, string> = {};

  // Priority 1: backend/.env (local development)
  const localEnvPath = join(process.cwd(), '.env');
  if (existsSync(localEnvPath)) {
    try {
      const localEnv = parse(readFileSync(localEnvPath, 'utf8'));
      Object.assign(env, localEnv);
      console.log('[EnvLoader] Loaded local .env from:', localEnvPath);
    } catch (error) {
      console.warn('[EnvLoader] Failed to load local .env:', error.message);
    }
  }

  // Priority 2: /home/<user>/<site>/.secrets/<project>.env (production)
  const projectName = process.env.PROJECT_NAME || 'kids-motivation';
  const homeDir = process.env.HOME || process.env.HOMEPATH || '/home';
  const siteName = process.env.SITE_NAME || process.env.DOMAIN || 'default';
  const secretsPath = join(homeDir, siteName, '.secrets', `${projectName}.env`);

  if (existsSync(secretsPath)) {
    try {
      const secretsEnv = parse(readFileSync(secretsPath, 'utf8'));
      Object.assign(env, secretsEnv);
      console.log('[EnvLoader] Loaded secrets .env from:', secretsPath);
    } catch (error) {
      console.warn('[EnvLoader] Failed to load secrets .env:', error.message);
    }
  } else {
    const altPaths = [
      join(homeDir, '.secrets', `${projectName}.env`),
      join('/home', process.env.USER || 'user', '.secrets', `${projectName}.env`),
    ];

    for (const altPath of altPaths) {
      if (existsSync(altPath)) {
        try {
          const secretsEnv = parse(readFileSync(altPath, 'utf8'));
          Object.assign(env, secretsEnv);
          console.log('[EnvLoader] Loaded secrets .env from:', altPath);
          break;
        } catch (error) {
          // Continue to next path
        }
      }
    }
  }

  // Priority 3: process.env (already set, will override previous values)
  Object.assign(env, process.env);

  return env;
}

/**
 * Mask sensitive values in logs
 */
export function maskSecrets(value: string): string {
  if (!value || value.length < 4) {
    return '***MASKED***';
  }
  const start = value.substring(0, 2);
  const end = value.substring(value.length - 2);
  return `${start}***MASKED***${end}`;
}

/**
 * Get Firebase service account path with priority:
 * 1. FIREBASE_SA_PATH env var
 * 2. /home/<user>/<site>/.secrets/firebase-sa.json
 * 3. FIREBASE_SA_JSON (JSON string in env)
 */
export function getFirebaseCredentialsPath(): string | null {
  // Priority 1: Explicit path
  if (process.env.FIREBASE_SA_PATH) {
    const path = resolve(process.env.FIREBASE_SA_PATH);
    if (existsSync(path)) {
      return path;
    }
    console.warn('[EnvLoader] FIREBASE_SA_PATH specified but file not found:', path);
  }

  // Priority 2: Standard secrets location
  const homeDir = process.env.HOME || process.env.HOMEPATH || '/home';
  const siteName = process.env.SITE_NAME || process.env.DOMAIN || 'default';
  const defaultPath = join(homeDir, siteName, '.secrets', 'firebase-sa.json');

  if (existsSync(defaultPath)) {
    return defaultPath;
  }

  const altPaths = [
    join(homeDir, '.secrets', 'firebase-sa.json'),
    join('/home', process.env.USER || 'user', '.secrets', 'firebase-sa.json'),
  ];

  for (const altPath of altPaths) {
    if (existsSync(altPath)) {
      return altPath;
    }
  }

  // Priority 3: FIREBASE_SA_JSON (JSON string) - handled separately
  if (process.env.FIREBASE_SA_JSON) {
    return null; // Signal that JSON is in env var
  }

  return null;
}

/**
 * Get Firebase service account JSON (from env var or file)
 */
export function getFirebaseCredentials(): any | null {
  // Try env var first
  if (process.env.FIREBASE_SA_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SA_JSON);
    } catch (error) {
      console.warn('[EnvLoader] Failed to parse FIREBASE_SA_JSON:', error.message);
      return null;
    }
  }

  // Try file path
  const path = getFirebaseCredentialsPath();
  if (path && existsSync(path)) {
    try {
      const content = readFileSync(path, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.warn('[EnvLoader] Failed to read Firebase credentials file:', error.message);
      return null;
    }
  }

  // Try serviceAccountKey.json in backend root (multiple possible locations)
  const possiblePaths = [
    join(process.cwd(), 'serviceAccountKey.json'), // Current working directory
    join(process.cwd(), 'backend', 'serviceAccountKey.json'), // If cwd is project root
    join(__dirname, '..', '..', 'serviceAccountKey.json'), // Relative to this file
    resolve(join(__dirname, '..', '..', 'serviceAccountKey.json')), // Absolute path
  ];
  
  for (const serviceAccountKeyPath of possiblePaths) {
    if (existsSync(serviceAccountKeyPath)) {
      try {
        const content = readFileSync(serviceAccountKeyPath, 'utf8');
        const parsed = JSON.parse(content);
        console.log('[EnvLoader] ✅ Loaded Firebase credentials from:', serviceAccountKeyPath);
        return parsed;
      } catch (error) {
        console.warn('[EnvLoader] Failed to read serviceAccountKey.json from', serviceAccountKeyPath, ':', error.message);
        // Continue to next path
      }
    }
  }

  return null;
}
