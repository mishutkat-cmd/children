import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { FirestoreModule } from '../firestore/firestore.module';
import { MotivationModule } from '../motivation/motivation.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [
    FirestoreModule,
    PassportModule,
    MotivationModule,
    LedgerModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwtSecret = config.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production';
        if (!config.get<string>('JWT_SECRET')) {
          console.warn('[AuthModule] JWT_SECRET not found in environment, using default. Please set JWT_SECRET in .env file!');
        }
        return {
          secret: jwtSecret,
          signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '1d') },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
