import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsIngestController } from './locations.ingest.controller';
import { LocationsService } from './locations.service';
import { DeviceTokenGuard } from '../common/guards/device-token.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LocationsController, LocationsIngestController],
  providers: [LocationsService, DeviceTokenGuard],
  exports: [LocationsService],
})
export class LocationsModule {}
