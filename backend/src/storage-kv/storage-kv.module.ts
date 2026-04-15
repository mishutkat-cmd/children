import { Module } from '@nestjs/common';
import { FirebaseModule } from '../firebase/firebase.module';
import { StorageKvController } from './storage-kv.controller';

@Module({
  imports: [FirebaseModule],
  controllers: [StorageKvController],
})
export class StorageKvModule {}
