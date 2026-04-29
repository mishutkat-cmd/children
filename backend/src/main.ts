import './config/env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, chmodSync, unlinkSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug', 'verbose'],
  });


  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        console.error('[Validation Error]', JSON.stringify(errors, null, 2));
        const messages = errors
          .map((e) => Object.values(e.constraints || {}).join(', '))
          .filter(Boolean)
          .join('; ');
        return new BadRequestException(messages || 'Validation failed');
      },
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Файлы теперь хранятся в Firebase Storage, локальное хранение не нужно
  // const uploadsDir = join(process.cwd(), 'uploads');
  // if (existsSync(uploadsDir)) {
  //   app.useStaticAssets(uploadsDir, {
  //     prefix: '/uploads/',
  //   });
  //   console.log('[Server] Serving uploads from:', uploadsDir);
  // }

  // SPA serving only if FRONTEND_ENABLED and build dir + index.html exist
  const frontendEnabled = process.env.FRONTEND_ENABLED === 'true' || process.env.FRONTEND_ENABLED === '1';
  let buildPath: string | null = null;

  if (frontendEnabled) {
    // Priority 1: Explicit path
    if (process.env.FRONTEND_BUILD_PATH) {
      const explicitPath = process.env.FRONTEND_BUILD_PATH;
      if (existsSync(explicitPath) && existsSync(join(explicitPath, 'index.html'))) {
        buildPath = explicitPath;
      }
    }

    // Priority 2: Discovery paths (backend must NOT assume frontend folder exists)
    if (!buildPath) {
      const projectRoot = process.cwd();
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
        if (existsSync(p) && existsSync(join(p, 'index.html'))) {
          buildPath = p;
          break;
        }
      }
    }

    if (buildPath) {
      // All backend route prefixes (must be kept in sync with controllers)
      const backendPrefixes = [
        '/api',
        '/auth',
        '/children',
        '/badges',
        '/tasks',
        '/completions',
        '/rewards',
        '/exchanges',
        '/ledger',
        '/motivation',
        '/wishlist',
        '/notifications',
        '/upload',
        '/health',
        '/diagnostics',
        '/frontend',
      ];

      app.useStaticAssets(buildPath, { index: false });
      app.use((req, res, next) => {
        const isBackendRoute = backendPrefixes.some((prefix) => req.path.startsWith(prefix));
        if (!isBackendRoute) {
          const indexPath = join(buildPath!, 'index.html');
          if (existsSync(indexPath)) {
            res.sendFile(indexPath);
            return;
          }
        }
        next();
      });
      console.log('[Frontend] Serving SPA from:', buildPath);
    } else {
      console.warn('[Frontend] FRONTEND_ENABLED=true but no build found (build path missing).');
    }
  }

  // When frontend not served: / returns backend status page (HTML) with links to health/diagnostics
  const backendStatusHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Backend</title></head>
<body><h1>Backend</h1>
<ul><li><a href="/health">/health</a></li><li><a href="/diagnostics">/diagnostics</a></li><li><a href="/frontend/status">/frontend/status</a></li><li><a href="/api/v1/storage/health">/api/v1/storage/health</a></li></ul>
</body></html>`;
  if (!buildPath) {
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get('/', (_req: any, res: any) => res.type('html').send(backendStatusHtml));
  }

  // PORT: Unix socket path (starts with "/" or ends with ".sock") or TCP port number
  const portRaw = process.env.PORT && String(process.env.PORT).trim() !== '' ? process.env.PORT : '3000';
  const portStr = String(portRaw).trim();
  const isSocket = portStr.startsWith('/') || portStr.endsWith('.sock');
  const listenTarget = isSocket ? portStr : Number(portStr) || 3000;

  console.log('[Server] process.env.PORT:', process.env.PORT ?? '(not set)');
  console.log('[Server] listen type:', isSocket ? 'socket' : 'tcp', '| target:', listenTarget);

  // Безопасный listen: НЕ удаляем сокет «на всякий случай», иначе тестовый
  // запуск рядом с боевым процессом убивает inode прод-листенера.
  // Удаляем файл только если bind упал с EADDRINUSE — тогда он точно stale
  // (ни один процесс на нём не слушает, иначе bind не дошёл бы до этой ошибки
  // через файл — он бы залип на kernel-уровне). Повторяем listen один раз.
  const tryListen = async (): Promise<void> => {
    await app.listen(listenTarget);
  };

  try {
    await tryListen();
  } catch (err: any) {
    if (isSocket && err?.code === 'EADDRINUSE') {
      console.warn('[Server] Socket EADDRINUSE — removing stale file and retrying:', portStr);
      try {
        unlinkSync(portStr);
      } catch (unlinkErr: any) {
        console.error('[Server] Failed to remove stale socket:', unlinkErr?.message || unlinkErr);
        process.exit(1);
      }
      try {
        await tryListen();
      } catch (retryErr: any) {
        console.error('[Server] Listen retry failed:', retryErr?.message || retryErr);
        process.exit(1);
      }
    } else {
      console.error('[Server] Listen failed:', err?.message || err);
      process.exit(1);
    }
  }

  if (isSocket) {
    try {
      // 0o775 needed: unix-socket connect requires execute permission
      // for the connecting process. Without it nginx returns 502.
      chmodSync(portStr, 0o775);
    } catch (_) {}
    console.log('[Server] Listening on socket:', portStr);
  } else {
    console.log('[Server] Listening on port:', listenTarget);
  }
}

process.on('unhandledRejection', (reason: any) => {
  console.error('[Server] unhandledRejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err: Error) => {
  console.error('[Server] uncaughtException:', err?.message || err);
  process.exit(1);
});

bootstrap().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});
