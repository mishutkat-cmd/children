import { Controller, Get } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { envFileUsed } from '../config/env';
import { existsSync } from 'fs';
import { join } from 'path';

interface DatabaseStatus {
  enabled: boolean;
  path: string;
  documents: number;
  reason?: string;
}

interface HealthResponse {
  ok: boolean;
  ts: string;
  uptime: number;
  env: { databaseEnabled: boolean; frontendEnabled: boolean };
}

interface HealthResponseLegacy {
  ok: boolean;
  status: string;
  timestamp: string;
  database?: DatabaseStatus;
  frontend?: { enabled: boolean; found: boolean };
  nodeVersion: string;
  uptime: number;
}

interface FrontendStatusResponse {
  enabled: boolean;
  found: boolean;
  buildPath?: string;
  indexPath?: string;
  reason?: string;
  searchedPaths: Array<{
    path: string;
    existsDir: boolean;
    existsIndex: boolean;
  }>;
}

@Controller()
export class HealthController {
  constructor(private readonly db: DocStore) {}

  @Get('health')
  getHealth(): HealthResponse & HealthResponseLegacy {
    const databaseStatus = this.db.getStatus();
    const frontendStatus = this.getFrontendStatusInternal();
    const ts = new Date().toISOString();

    // `ok` now actually means something. It used to be hardcoded true even
    // when Firestore was unreachable, so a monitor watching it could not tell
    // a healthy process from one that could not read a single document.
    const ok = databaseStatus.enabled;

    return {
      ok,
      ts,
      uptime: process.uptime(),
      env: {
        databaseEnabled: databaseStatus.enabled,
        frontendEnabled: frontendStatus.enabled,
      },
      database: databaseStatus,
      frontend: { enabled: frontendStatus.enabled, found: frontendStatus.found },
      nodeVersion: process.version,
      status: ok ? 'ok' : 'degraded',
      timestamp: ts,
      ...(databaseStatus.reason && { databaseReason: databaseStatus.reason }),
      ...(frontendStatus.reason && { frontendReason: frontendStatus.reason }),
    };
  }

  private getFrontendStatusInternal(): FrontendStatusResponse {
    const enabled = process.env.FRONTEND_ENABLED === 'true' || process.env.FRONTEND_ENABLED === '1';

    if (!enabled) {
      return {
        enabled: false,
        found: false,
        searchedPaths: [],
      };
    }

    const projectRoot = process.cwd();
    const searchedPaths: FrontendStatusResponse['searchedPaths'] = [];

    // Priority 1: Explicit path
    let buildPath: string | null = null;
    if (process.env.FRONTEND_BUILD_PATH) {
      buildPath = process.env.FRONTEND_BUILD_PATH;
      const indexPath = join(buildPath, 'index.html');
      searchedPaths.push({
        path: buildPath,
        existsDir: existsSync(buildPath),
        existsIndex: existsSync(indexPath),
      });
    } else {
      const discoveryPaths = [
        join(projectRoot, '..', 'frontend', 'build'),
        join(projectRoot, '..', 'frontend', 'dist'),
        join(projectRoot, '..', 'web', 'build'),
        join(projectRoot, '..', 'web', 'dist'),
        join(projectRoot, 'frontend', 'build'),
        join(projectRoot, 'frontend', 'dist'),
        join(projectRoot, 'backend', 'frontend', 'build'),
        join(projectRoot, 'backend', 'frontend', 'dist'),
      ];

      for (const p of discoveryPaths) {
        const indexPath = join(p, 'index.html');
        const existsDir = existsSync(p);
        const existsIndex = existsSync(indexPath);

        searchedPaths.push({
          path: p,
          existsDir,
          existsIndex,
        });

        if (existsIndex && !buildPath) {
          buildPath = p;
        }
      }
    }

    const found = buildPath !== null && existsSync(join(buildPath, 'index.html'));
    const reason = !found
      ? 'build path missing'
      : undefined;

    return {
      enabled: true,
      found,
      buildPath: found ? buildPath : undefined,
      indexPath: found ? join(buildPath!, 'index.html') : undefined,
      reason,
      searchedPaths,
    };
  }

  @Get('diagnostics')
  getDiagnostics(): Record<string, unknown> {
    const fs = require('fs');
    const cwd = process.cwd();
    const portPresent = process.env.PORT !== undefined && process.env.PORT !== '';

    const databaseStatus = this.db.getStatus();
    // Writability is worth checking separately: the file can exist and open
    // read-only if the deploy user's permissions drift, and every write would
    // then fail at request time with nothing in the health output to explain it.
    let databaseWritable: boolean | { error: string };
    try {
      fs.accessSync(databaseStatus.path, fs.constants.W_OK);
      databaseWritable = true;
    } catch (e: any) {
      databaseWritable = { error: e?.message || 'not writable' };
    }

    const uploadsPath = process.env.UPLOADS_PATH || join(cwd, 'uploads');
    const secretsPathsExist = {
      backendEnv: fs.existsSync(join(cwd, '.env')),
    };
    const configuredPath = process.env.FRONTEND_BUILD_PATH;
    const frontendConfiguredPathExists =
      configuredPath !== undefined && configuredPath !== '' ? fs.existsSync(configuredPath) : null;
    const port = process.env.PORT ?? '';
    const mode = typeof port === 'string' && port.includes('/') ? 'socket' : 'port';

    return {
      cwd,
      portPresent,
      envFileUsed: envFileUsed ?? null,
      database: {
        ...databaseStatus,
        writable: databaseWritable,
      },
      uploads: {
        path: uploadsPath,
        exists: fs.existsSync(uploadsPath),
      },
      secretsPathsExist,
      frontendConfiguredPathExists,
      mode,
    };
  }

  @Get('frontend/status')
  getFrontendStatus(): FrontendStatusResponse {
    return this.getFrontendStatusInternal();
  }
}
