import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { FilesController } from './files.controller';
import { LocalStorageService } from './local-storage.service';
import { SignPrivateUrlsInterceptor } from './sign-private-urls.interceptor';

/**
 * Global because several feature services delete files alongside the rows that
 * reference them — the same reach FirebaseModule's StorageService had.
 *
 * The interceptor is registered application-wide on purpose: private file URLs
 * must be signed on every response that can carry one, and there are a dozen
 * such endpoints.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [FilesController],
  providers: [
    LocalStorageService,
    { provide: APP_INTERCEPTOR, useClass: SignPrivateUrlsInterceptor },
  ],
  exports: [LocalStorageService],
})
export class FilesModule {}
