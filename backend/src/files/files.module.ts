import { Global, Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { LocalStorageService } from './local-storage.service';

/**
 * Global because several feature services delete files alongside the rows
 * that reference them — the same reach FirebaseModule's StorageService had.
 */
@Global()
@Module({
  controllers: [FilesController],
  providers: [LocalStorageService],
  exports: [LocalStorageService],
})
export class FilesModule {}
