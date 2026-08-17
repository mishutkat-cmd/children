import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsIngestController } from './locations.ingest.controller';
import { LocationsService } from './locations.service';
import { DeviceTokenGuard } from '../common/guards/device-token.guard';
import { FirestoreModule } from '../firestore/firestore.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [FirestoreModule, AuthModule],
  controllers: [LocationsController, LocationsIngestController],
  providers: [LocationsService, DeviceTokenGuard],
  exports: [LocationsService],
})
export class LocationsModule {}
