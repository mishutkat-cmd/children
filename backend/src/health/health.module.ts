import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
