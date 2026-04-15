import { Module, Global } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { CleanupService } from './cleanup.service';
import { FirestoreModule } from '../firestore/firestore.module';
import { BadgesModule } from '../badges/badges.module';

@Global()
@Module({
  imports: [FirestoreModule, BadgesModule],
  controllers: [LedgerController],
  providers: [LedgerService, CleanupService],
  exports: [LedgerService, CleanupService],
})
export class LedgerModule {}
