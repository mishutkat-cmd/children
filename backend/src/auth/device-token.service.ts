import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FirestoreService } from '../firestore/firestore.service';

/**
 * Долгоживущий токен устройства для фоновой отправки геолокации.
 *
 * Обычный JWT живёт JWT_EXPIRES_IN (по умолчанию 1d). Фоновому таску на
 * телефоне ребёнка этого не хватает: приложение может неделями не
 * открываться, а координаты слать обязано. Поэтому при включении шеринга
 * ребёнок обменивает свой обычный токен на device-токен на 180 дней.
 *
 * Компенсация за долгую жизнь — узкий скоуп: DeviceTokenGuard пускает такой
 * токен ТОЛЬКО на приём геоточек. Родитель может отозвать его в любой момент
 * (revokedAt), и проверка идёт по БД на каждом запросе, а не только по подписи.
 */

export const DEVICE_TOKEN_SCOPE = 'location';
export const DEVICE_TOKEN_TTL = '180d';

/** Как часто обновляем lastUsedAt. Каждый батч писать не нужно — это лишние записи. */
const LAST_USED_THROTTLE_MS = 15 * 60 * 1000;

export interface DeviceTokenPayload {
  sub: string; // userId
  familyId: string;
  childId: string; // childProfileId — кладём в токен, чтобы не резолвить на каждом батче
  deviceId: string;
  scope: typeof DEVICE_TOKEN_SCOPE;
  jti: string; // id документа в deviceTokens
}

export interface DeviceContext {
  userId: string;
  familyId: string;
  childId: string;
  deviceId: string;
  tokenId: string;
}

@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);

  constructor(
    private jwtService: JwtService,
    private firestore: FirestoreService,
  ) {}

  /**
   * Выдать (или перевыдать) токен устройства. Один активный токен на пару
   * (userId, deviceId): повторный вызов с того же устройства отзывает старый,
   * поэтому переустановка приложения не плодит вечных токенов.
   */
  async issue(
    userId: string,
    familyId: string,
    deviceId: string,
    platform?: string,
  ): Promise<{ token: string; expiresInDays: number; childId: string }> {
    const profiles = await this.firestore.findMany('childProfiles', { userId });
    const childProfile = profiles[0];
    if (!childProfile) {
      throw new UnauthorizedException('Child profile not found');
    }

    const existing = await this.firestore.findMany('deviceTokens', { userId, deviceId });
    for (const old of existing) {
      if (!old.revokedAt) {
        await this.firestore.update('deviceTokens', old.id, { revokedAt: new Date() });
      }
    }

    const tokenId = crypto.randomUUID();
    await this.firestore.create(
      'deviceTokens',
      {
        id: tokenId,
        userId,
        familyId,
        childId: childProfile.id,
        deviceId,
        platform: platform || 'unknown',
        purpose: DEVICE_TOKEN_SCOPE,
        revokedAt: null,
        lastUsedAt: null,
      },
      tokenId,
    );

    const payload: DeviceTokenPayload = {
      sub: userId,
      familyId,
      childId: childProfile.id,
      deviceId,
      scope: DEVICE_TOKEN_SCOPE,
      jti: tokenId,
    };

    const token = await this.jwtService.signAsync(payload, { expiresIn: DEVICE_TOKEN_TTL });
    this.logger.log(`[DeviceToken] issued for child=${childProfile.id} device=${deviceId}`);

    return { token, expiresInDays: 180, childId: childProfile.id };
  }

  /**
   * Проверить токен: подпись, скоуп и что он не отозван в БД.
   * Возвращает контекст устройства для контроллера приёма точек.
   */
  async verify(token: string): Promise<DeviceContext> {
    let payload: DeviceTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<DeviceTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid device token');
    }

    if (payload.scope !== DEVICE_TOKEN_SCOPE || !payload.jti) {
      throw new UnauthorizedException('Token is not a device token');
    }

    const record = await this.firestore.findFirst('deviceTokens', { id: payload.jti });
    if (!record) {
      throw new UnauthorizedException('Device token not found');
    }
    if (record.revokedAt) {
      throw new UnauthorizedException('Device token revoked');
    }

    this.touch(record).catch(() => {});

    return {
      userId: payload.sub,
      familyId: payload.familyId,
      childId: payload.childId,
      deviceId: payload.deviceId,
      tokenId: payload.jti,
    };
  }

  /** Отозвать все токены ребёнка — например, когда родитель выключил шеринг. */
  async revokeAllForUser(userId: string): Promise<number> {
    const tokens = await this.firestore.findMany('deviceTokens', { userId });
    let revoked = 0;
    for (const t of tokens) {
      if (!t.revokedAt) {
        await this.firestore.update('deviceTokens', t.id, { revokedAt: new Date() });
        revoked++;
      }
    }
    return revoked;
  }

  /** Отметить активность устройства, но не чаще раза в 15 минут. */
  private async touch(record: any): Promise<void> {
    const last = record.lastUsedAt ? new Date(record.lastUsedAt).getTime() : 0;
    if (Date.now() - last < LAST_USED_THROTTLE_MS) return;
    await this.firestore.update('deviceTokens', record.id, { lastUsedAt: new Date() });
  }
}
