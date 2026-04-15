import { Module, Global } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [FirebaseService, StorageService],
  exports: [FirebaseService, StorageService],
})
export class FirebaseModule {}
