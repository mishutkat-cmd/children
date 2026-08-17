import { Module, Global } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { CleanupService } from './cleanup.service';
import { IntegrityCheckService } from './integrity-check.service';
import { BadgesModule } from '../badges/badges.module';

@Global()
@Module({
  imports: [BadgesModule],
  controllers: [LedgerController],
  providers: [LedgerService, CleanupService, IntegrityCheckService],
  exports: [LedgerService, CleanupService],
})
export class LedgerModule {}
