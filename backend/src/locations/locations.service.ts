import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../firestore/firestore.service';
import { DeviceTokenService, DeviceContext } from '../auth/device-token.service';
import { getChildProfileId } from '../firestore/firestore.helpers';
import { sanitizePoints, type PreparedPoint } from './location-rules';
import {
  IngestBatchDto,
  UpdateChildLocationSettingsDto,
  UpdateFamilyLocationSettingsDto,
} from './dto/locations.dto';

/** Последняя известная точка: один документ на ребёнка, id = childProfileId. */
const LAST_COLLECTION = 'childLocations';
/** История: TTL-политика Firestore навешивается на поле expiresAt. */
const HISTORY_COLLECTION = 'locationPoints';
const SETTINGS_COLLECTION = 'locationSettings';

export const DEFAULT_LOCATION_SETTINGS = {
  enabled: true,
  movingIntervalSec: 60,
  idleIntervalSec: 300,
  historyDays: 7,
};

/** После этого возраста точка на карте показывается серой. */
export const STALE_AFTER_SEC = 15 * 60;
/** Сколько живёт родительский запрос «обновить сейчас». */
const REFRESH_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private firestore: FirestoreService,
    private deviceTokenService: DeviceTokenService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Приём точек с устройства ребёнка
  // ─────────────────────────────────────────────────────────────

  /**
   * Принять батч точек. Идемпотентно: id документа истории детерминирован
   * (`${childId}_${capturedAt}`), поэтому ретрай после таймаута не задваивает трек.
   */
  async ingest(ctx: DeviceContext, dto: IngestBatchDto) {
    const settings = await this.getSettings(ctx.familyId);
    const childCfg = settings.perChild?.[ctx.childId] || {};
    const trackingEnabled = settings.enabled !== false && childCfg.enabled !== false;

    if (!trackingEnabled) {
      // Родитель выключил шеринг. Отвечаем 200 и говорим устройству остановиться —
      // так фоновый таск гасит сам себя, не дожидаясь перезапуска приложения.
      // Читать последнюю точку здесь незачем: ничего писать мы не будем.
      return {
        accepted: 0,
        rejected: dto.points.length,
        trackingEnabled: false,
        nextIntervalSec: 0,
        highAccuracy: false,
      };
    }

    const lastRef = this.firestore.collection(LAST_COLLECTION).doc(ctx.childId);
    const lastSnap = await lastRef.get();
    const last = lastSnap.exists ? (lastSnap.data() as any) : null;

    const { points, rejected } = sanitizePoints(dto.points, {
      lat: last?.lat,
      lng: last?.lng,
      ts: this.toMillis(last?.capturedAt),
    });

    if (rejected > 0) {
      // Ненулевой rejected на живом устройстве — сигнал: часы уехали, клиент
      // шлёт мусор или кто-то подделывает координаты.
      this.logger.debug(
        `[ingest] child=${ctx.childId} accepted=${points.length} rejected=${rejected}`,
      );
    }

    if (points.length === 0) {
      return {
        accepted: 0,
        rejected,
        trackingEnabled: true,
        nextIntervalSec: settings.idleIntervalSec,
        highAccuracy: this.isRefreshRequested(last),
      };
    }

    const historyDays = childCfg.historyDays ?? settings.historyDays;
    const batch = this.firestore.batch();
    const historyCol = this.firestore.collection(HISTORY_COLLECTION);

    for (const p of points) {
      const docId = `${ctx.childId}_${p.ts}`;
      batch.set(historyCol.doc(docId), {
        ...this.toDocument(p, ctx),
        expiresAt: admin.firestore.Timestamp.fromMillis(p.ts + historyDays * 24 * 60 * 60 * 1000),
      });
    }

    const newest = points[points.length - 1];
    const lastTs = this.toMillis(last?.capturedAt);

    // Батчи могут прийти не по порядку (очередь после офлайна). Последнюю точку
    // перезаписываем только если она реально свежее сохранённой.
    if (newest.ts > lastTs) {
      batch.set(
        lastRef,
        {
          ...this.toDocument(newest, ctx),
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          permissionState: dto.permissionState || last?.permissionState || 'always',
          servicesEnabled: dto.servicesEnabled !== false,
          appVersion: dto.appVersion || last?.appVersion || null,
          // Запрос «обновить сейчас» отработан — снимаем флаг.
          refreshRequestedAt: null,
        },
        { merge: true },
      );
    }

    await batch.commit();

    const isMoving = newest.isMoving === true;
    return {
      accepted: points.length,
      rejected,
      trackingEnabled: true,
      nextIntervalSec: isMoving ? settings.movingIntervalSec : settings.idleIntervalSec,
      highAccuracy: this.isRefreshRequested(last),
    };
  }

  private toDocument(p: PreparedPoint, ctx: DeviceContext) {
    return {
      familyId: ctx.familyId,
      childId: ctx.childId,
      userId: ctx.userId,
      deviceId: ctx.deviceId,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      altitude: typeof p.altitude === 'number' ? p.altitude : null,
      // iOS отдаёт -1 вместо null, когда значение недоступно.
      speed: typeof p.speed === 'number' && p.speed >= 0 ? p.speed : null,
      heading: typeof p.heading === 'number' && p.heading >= 0 ? p.heading : null,
      isMoving: p.isMoving === true,
      mocked: p.mocked === true,
      battery: typeof p.battery === 'number' ? p.battery : null,
      isCharging: p.isCharging === true,
      source: p.source || 'background',
      capturedAt: admin.firestore.Timestamp.fromMillis(p.ts),
    };
  }

  private isRefreshRequested(last: any): boolean {
    const requestedAt = this.toMillis(last?.refreshRequestedAt);
    return requestedAt > 0 && Date.now() - requestedAt < REFRESH_WINDOW_MS;
  }

  // ─────────────────────────────────────────────────────────────
  // Родительские чтения
  // ─────────────────────────────────────────────────────────────

  /** Последние точки всех детей семьи — то, из чего рисуется карта. */
  async getFamilyLocations(familyId: string) {
    const [users, settings] = await Promise.all([
      this.firestore.findMany('users', { familyId, role: 'CHILD' }),
      this.getSettings(familyId),
    ]);

    const rows = await Promise.all(
      users.map(async (user: any) => {
        const profiles = await this.firestore.findMany('childProfiles', { userId: user.id });
        const profile = profiles[0];
        if (!profile) return null;

        const snap = await this.firestore.collection(LAST_COLLECTION).doc(profile.id).get();
        const doc = snap.exists ? (snap.data() as any) : null;
        const childCfg = settings.perChild?.[profile.id] || {};

        return {
          childId: profile.id,
          userId: user.id,
          name: profile.name || user.login,
          login: user.login,
          avatarUrl: profile.avatarUrl || null,
          trackingEnabled: settings.enabled !== false && childCfg.enabled !== false,
          location: doc ? this.toLocationResponse(doc) : null,
        };
      }),
    );

    return rows.filter(Boolean);
  }

  /** История за период — для трека на карте. */
  async getHistory(familyId: string, childIdOrUserId: string, from?: string, to?: string, limit = 500) {
    const childId = await this.resolveChildId(familyId, childIdOrUserId);

    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 24 * 60 * 60 * 1000);

    const snapshot = await this.firestore
      .collection(HISTORY_COLLECTION)
      .where('childId', '==', childId)
      .where('capturedAt', '>=', admin.firestore.Timestamp.fromDate(fromDate))
      .where('capturedAt', '<=', admin.firestore.Timestamp.fromDate(toDate))
      .orderBy('capturedAt', 'desc')
      .limit(limit)
      .get();

    const points = snapshot.docs
      .map((d) => this.toLocationResponse(d.data()))
      .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));

    return { childId, from: fromDate.toISOString(), to: toDate.toISOString(), count: points.length, points };
  }

  /**
   * Родитель просит свежую точку. Пуш-канала пока нет, поэтому ставим флаг:
   * устройство увидит highAccuracy=true в ответе на ближайший батч и на минуту
   * переключится в режим высокой точности.
   */
  async requestRefresh(familyId: string, childIdOrUserId: string) {
    const childId = await this.resolveChildId(familyId, childIdOrUserId);
    await this.firestore
      .collection(LAST_COLLECTION)
      .doc(childId)
      .set(
        { childId, familyId, refreshRequestedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    return { ok: true, childId };
  }

  /** Ребёнок видит, что именно о нём известно — требование прозрачности. */
  async getMyStatus(userId: string, familyId: string) {
    const profiles = await this.firestore.findMany('childProfiles', { userId });
    const profile = profiles[0];
    if (!profile) throw new NotFoundException('Child profile not found');

    const settings = await this.getSettings(familyId);
    const childCfg = settings.perChild?.[profile.id] || {};
    const snap = await this.firestore.collection(LAST_COLLECTION).doc(profile.id).get();
    const doc = snap.exists ? (snap.data() as any) : null;

    return {
      childId: profile.id,
      trackingEnabled: settings.enabled !== false && childCfg.enabled !== false,
      historyDays: childCfg.historyDays ?? settings.historyDays,
      movingIntervalSec: settings.movingIntervalSec,
      idleIntervalSec: settings.idleIntervalSec,
      lastReportedAt: doc ? this.toIso(doc.capturedAt) : null,
    };
  }

  async deleteHistory(familyId: string, childIdOrUserId: string) {
    const childId = await this.resolveChildId(familyId, childIdOrUserId);
    let deleted = 0;

    // Пакетами по 300, чтобы не упереться в лимит батча (500 операций).
    for (;;) {
      const snapshot = await this.firestore
        .collection(HISTORY_COLLECTION)
        .where('childId', '==', childId)
        .limit(300)
        .get();
      if (snapshot.empty) break;

      const batch = this.firestore.batch();
      snapshot.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snapshot.size;
      if (snapshot.size < 300) break;
    }

    return { childId, deleted };
  }

  // ─────────────────────────────────────────────────────────────
  // Настройки
  // ─────────────────────────────────────────────────────────────

  async getSettings(familyId: string) {
    const snap = await this.firestore.collection(SETTINGS_COLLECTION).doc(familyId).get();
    const stored = snap.exists ? (snap.data() as any) : {};
    return { ...DEFAULT_LOCATION_SETTINGS, ...stored, perChild: stored?.perChild || {} };
  }

  async updateSettings(familyId: string, dto: UpdateFamilyLocationSettingsDto) {
    await this.firestore
      .collection(SETTINGS_COLLECTION)
      .doc(familyId)
      .set({ ...dto, familyId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    if (dto.enabled === false) {
      await this.revokeFamilyDevices(familyId);
    }

    return this.getSettings(familyId);
  }

  async updateChildSettings(familyId: string, childIdOrUserId: string, dto: UpdateChildLocationSettingsDto) {
    const childId = await this.resolveChildId(familyId, childIdOrUserId);

    // Именно вложенный объект, а не точечный путь: `set({'perChild.x.enabled': …})`
    // создал бы поле с точками в имени — dot-notation понимает только update(),
    // а он падает, если документа настроек ещё нет. merge:true доливает
    // вложенные map'ы, не затирая настройки других детей.
    const childPatch: Record<string, any> = {};
    if (dto.enabled !== undefined) childPatch.enabled = dto.enabled;
    if (dto.historyDays !== undefined) childPatch.historyDays = dto.historyDays;

    await this.firestore
      .collection(SETTINGS_COLLECTION)
      .doc(familyId)
      .set(
        {
          familyId,
          perChild: { [childId]: childPatch },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    if (dto.enabled === false) {
      const profile = await this.firestore.findFirst('childProfiles', { id: childId });
      if (profile?.userId) {
        await this.deviceTokenService.revokeAllForUser(profile.userId);
      }
    }

    return this.getSettings(familyId);
  }

  // ─────────────────────────────────────────────────────────────
  // Общее
  // ─────────────────────────────────────────────────────────────

  /**
   * Принимает и childProfileId, и userId (мобильные экраны оперируют разными
   * идентификаторами) и заодно проверяет, что ребёнок из этой семьи.
   */
  private async resolveChildId(familyId: string, childIdOrUserId: string): Promise<string> {
    const resolved = await getChildProfileId(this.firestore, childIdOrUserId, familyId);
    if (!resolved) {
      throw new NotFoundException('Child not found in this family');
    }
    return resolved.childProfileId;
  }

  private async revokeFamilyDevices(familyId: string): Promise<void> {
    const users = await this.firestore.findMany('users', { familyId, role: 'CHILD' });
    await Promise.all(users.map((u: any) => this.deviceTokenService.revokeAllForUser(u.id)));
  }

  private toLocationResponse(doc: any) {
    const capturedAt = this.toMillis(doc.capturedAt);
    const ageSec = capturedAt > 0 ? Math.round((Date.now() - capturedAt) / 1000) : null;
    return {
      lat: doc.lat,
      lng: doc.lng,
      accuracy: doc.accuracy,
      altitude: doc.altitude ?? null,
      speed: doc.speed ?? null,
      heading: doc.heading ?? null,
      isMoving: doc.isMoving === true,
      mocked: doc.mocked === true,
      battery: doc.battery ?? null,
      isCharging: doc.isCharging === true,
      source: doc.source || 'background',
      permissionState: doc.permissionState || null,
      servicesEnabled: doc.servicesEnabled !== false,
      capturedAt: this.toIso(doc.capturedAt),
      receivedAt: this.toIso(doc.receivedAt),
      ageSec,
      isStale: ageSec === null || ageSec > STALE_AFTER_SEC,
    };
  }

  private toMillis(value: any): number {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toIso(value: any): string | null {
    const ms = this.toMillis(value);
    return ms > 0 ? new Date(ms).toISOString() : null;
  }
}
