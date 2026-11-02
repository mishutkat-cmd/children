import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DocStore } from '../db/doc-store.service';
import { PairingService } from './pairing.service';

export interface JwtPayload {
  sub: string; // userId
  email?: string;
  role: string;
  familyId: string;
  scope?: string;
  /** Сессия подключённого устройства (телефон ребёнка, семейный компьютер) — её можно отозвать. */
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private db: DocStore,
    private pairing: PairingService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('[JwtStrategy] JWT_SECRET is required (refusing to boot with a default secret)');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    try {
      // Скоуповые токены (токен устройства для геоточек) — не логин.
      if (payload.scope) {
        throw new UnauthorizedException('Scoped token is not accepted here');
      }

      if (payload.sid && !(await this.pairing.checkSession(payload.sid, payload.sub, payload.familyId))) {
        throw new UnauthorizedException('Device session revoked');
      }

      const user = await this.db.findFirst('users', { id: payload.sub });

      if (!user) {
        console.error('[JwtStrategy] User not found:', payload.sub);
        throw new UnauthorizedException('User not found');
      }

      return {
        userId: user.id,
        role: user.role,
        familyId: user.familyId,
        email: user.email,
      };
    } catch (error: any) {
      console.error('[JwtStrategy] Error validating token:', error.message);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
