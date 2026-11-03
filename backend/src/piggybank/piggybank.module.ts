import { Module } from '@nestjs/common';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { PiggybankController } from './piggybank.controller';
import { PiggybankService } from './piggybank.service';

@Module({
  imports: [ExchangesModule],
  controllers: [PiggybankController],
  providers: [PiggybankService],
})
export class PiggybankModule {}
