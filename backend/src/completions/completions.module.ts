import { Module } from '@nestjs/common';
import { CompletionsController } from './completions.controller';
import { CompletionsService } from './completions.service';
import { FirestoreModule } from '../firestore/firestore.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MotivationModule } from '../motivation/motivation.module';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [FirestoreModule, LedgerModule, MotivationModule, BadgesModule],
  controllers: [CompletionsController],
  providers: [CompletionsService],
  exports: [CompletionsService],
})
export class CompletionsModule {}
