import { Global, Module } from '@nestjs/common';
import { DocStore } from './doc-store.service';

/**
 * Global so every feature module can inject DocStore without importing this
 * module explicitly — same ergonomics FirestoreModule had.
 */
@Global()
@Module({
  providers: [DocStore],
  exports: [DocStore],
})
export class DbModule {}
