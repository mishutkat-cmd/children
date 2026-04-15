import { Module } from '@nestjs/common';
import { ExchangesController } from './exchanges.controller';
import { ExchangesService } from './exchanges.service';
import { FirestoreModule } from '../firestore/firestore.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [FirestoreModule, LedgerModule],
  controllers: [ExchangesController],
  providers: [ExchangesService],
  exports: [ExchangesService],
})
export class ExchangesModule {}
