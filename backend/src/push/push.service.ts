import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { DocStore } from '../db/doc-store.service';

const COLLECTION = 'pushTokens';

export type PushMessage = {
  title: string;
  body: string;
  /** Плоские строки: FCM data принимает только string-значения. */
  data?: Record<string, string>;
  /** Android-канал, созданный приложением (у «послушать» — высокий приоритет). */
  channelId?: string;
};

/**
 * Push на телефоны через FCM HTTP v1 (firebase-admin).
 *
 * Ключ сервисного аккаунта Firebase лежит на сервере, путь — в
 * FCM_SERVICE_ACCOUNT_FILE. Без него push молча выключен: запросы
 * «послушать» по-прежнему видны ребёнку, пока приложение открыто.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private messaging: any | null | undefined;

  constructor(private db: DocStore) {}

  private getMessaging(): any | null {
    if (this.messaging !== undefined) return this.messaging;
    const file = process.env.FCM_SERVICE_ACCOUNT_FILE;
    if (!file || !existsSync(file)) {
      this.logger.warn('FCM_SERVICE_ACCOUNT_FILE не задан или не найден — push выключен');
      this.messaging = null;
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const admin = require('firebase-admin');
      const credential = admin.credential.cert(JSON.parse(readFileSync(file, 'utf8')));
      const app = admin.apps.find((a: any) => a?.name === 'push') ?? admin.initializeApp({ credential }, 'push');
      this.messaging = app.messaging();
    } catch (error: any) {
      this.logger.error(`FCM init failed: ${error?.message}`);
      this.messaging = null;
    }
    return this.messaging;
  }

  private static idOf(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Токен привязан к последнему вошедшему: телефон мог перейти к другому ребёнку. */
  async register(userId: string, familyId: string, token: string, platform: 'android' | 'ios') {
    await this.db.set(COLLECTION, PushService.idOf(token), {
      userId,
      familyId,
      token,
      platform,
      updatedAt: new Date(),
    });
    return { ok: true };
  }

  async remove(userId: string, token: string) {
    const id = PushService.idOf(token);
    const row = await this.db.get(COLLECTION, id);
    if (row && row.userId === userId) await this.db.delete(COLLECTION, id);
    return { ok: true };
  }

  /** Не бросает: push — подсказка, а не условие работы запроса. */
  async sendToUser(userId: string, message: PushMessage): Promise<number> {
    const messaging = this.getMessaging();
    if (!messaging) return 0;
    const rows = await this.db.findMany(COLLECTION, { userId });
    let sent = 0;
    for (const row of rows) {
      try {
        await messaging.send({
          token: row.token,
          notification: { title: message.title, body: message.body },
          data: message.data ?? {},
          android: {
            priority: 'high',
            ttl: 5 * 60 * 1000,
            notification: { channelId: message.channelId ?? 'default', sound: 'default' },
          },
          apns: { payload: { aps: { sound: 'default' } } },
        });
        sent++;
      } catch (error: any) {
        const code = error?.errorInfo?.code ?? error?.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          await this.db.delete(COLLECTION, row.id).catch(() => {});
        } else {
          this.logger.warn(`push to ${userId} failed: ${code ?? error?.message}`);
        }
      }
    }
    return sent;
  }
}
