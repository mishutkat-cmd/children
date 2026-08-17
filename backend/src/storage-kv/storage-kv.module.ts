import { Module } from '@nestjs/common';
import { StorageKvController } from './storage-kv.controller';

@Module({
  controllers: [StorageKvController],
})
export class StorageKvModule {}
