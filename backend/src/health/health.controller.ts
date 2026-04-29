import { Controller, Get } from '@nestjs/common';
import { FirebaseService, FirebaseStatus } from '../firebase/firebase.service';
import { envFileUsed } from '../config/env';
import { existsSync } from 'fs';
import { join } from 'path';

interface HealthResponse {
  ok: boolean;
  ts: string;
  uptime: number;
  env: { firebaseEnabled: boolean; frontendEnabled: boolean };
}

interface HealthResponseLegacy {
  ok: boolean;
  status: string;
  timestamp: string;
  firebase?: FirebaseStatus & { reason?: string };
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
  constructor(private readonly firebaseService: FirebaseService) {}

  @Get('health')
  getHealth(): HealthResponse & HealthResponseLegacy {
    const firebaseStatus = this.firebaseService.getStatus();
    const frontendStatus = this.getFrontendStatusInternal();
    const ts = new Date().toISOString();
    return {
      ok: true,
      ts,
      uptime: process.uptime(),
      env: {
        firebaseEnabled: firebaseStatus.enabled,
        frontendEnabled: frontendStatus.enabled,
      },
      firebase: { ...firebaseStatus },
      frontend: { enabled: frontendStatus.enabled, found: frontendStatus.found },
      nodeVersion: process.version,
      status: 'ok',
      timestamp: ts,
      ...(firebaseStatus.reason && { firebaseReason: firebaseStatus.reason }),
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
    let firebaseAdminResolvable: string | { error: string } = '';
    try {
      firebaseAdminResolvable = require.resolve('firebase-admin');
    } catch (e: any) {
      firebaseAdminResolvable = { error: e?.message || 'not found' };
    }
    const firebaseSaConfigured = process.env.FIREBASE_SA_PATH;
    const secretsPathsExist = {
      backendEnv: fs.existsSync(join(cwd, '.env')),
      firebaseSa: firebaseSaConfigured ? fs.existsSync(firebaseSaConfigured) : null,
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
      firebaseAdminResolvable,
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
