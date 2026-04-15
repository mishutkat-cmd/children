import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { FirestoreService } from '../firestore/firestore.service';

export interface JwtPayload {
  sub: string; // userId
  email?: string;
  role: string;
  familyId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private firestore: FirestoreService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production';
    if (!configService.get<string>('JWT_SECRET')) {
      console.warn('[JwtStrategy] JWT_SECRET not found in environment, using default. Please set JWT_SECRET in .env file!');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    try {
      const user = await this.firestore.findFirst('users', { id: payload.sub });

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
