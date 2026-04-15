import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

// Env is loaded once in main.ts first line (import './config/env'). Do not duplicate here.

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
