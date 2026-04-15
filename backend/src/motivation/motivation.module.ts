import { Module } from '@nestjs/common';
import { MotivationController } from './motivation.controller';
import { MotivationService } from './motivation.service';
import { StreakService } from './streak.service';
import { DecayService } from './decay.service';
import { ChallengesService } from './challenges.service';
import { FirestoreModule } from '../firestore/firestore.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [FirestoreModule, LedgerModule],
  controllers: [MotivationController],
  providers: [MotivationService, StreakService, DecayService, ChallengesService],
  exports: [MotivationService, StreakService, DecayService, ChallengesService],
})
export class MotivationModule {}
