import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocStore } from '../db/doc-store.service';
import { DeviceTokenService, DeviceContext } from '../auth/device-token.service';
import { getChildProfileId } from '../db/doc-helpers';
import { hasCoordinates, sanitizePoints, type PreparedPoint } from './location-rules';
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
    private db: DocStore,
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

    const last = this.db.getSync(LAST_COLLECTION, ctx.childId);

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
    const newest = points[points.length - 1];
    const lastTs = this.toMillis(last?.capturedAt);

    // One transaction for the whole batch: the history rows and the
    // last-known point either all land or none do, so a failure mid-batch
    // cannot leave the map showing a position with no track behind it.
    this.db.transaction(() => {
      for (const p of points) {
        // Deterministic id — a retry after a timeout re-writes the same row
        // instead of duplicating the track.
        const docId = `${ctx.childId}_${p.ts}`;
        this.db.setSync(HISTORY_COLLECTION, docId, {
          ...this.toDocument(p, ctx),
          expiresAt: new Date(p.ts + historyDays * 24 * 60 * 60 * 1000),
        });
      }

      // Batches can arrive out of order (a queue flushed after being offline).
      // Only overwrite the last-known point when it is genuinely newer.
      if (newest.ts > lastTs) {
        this.db.setSync(
          LAST_COLLECTION,
          ctx.childId,
          {
            ...this.toDocument(newest, ctx),
            receivedAt: new Date(),
            permissionState: dto.permissionState || last?.permissionState || 'always',
            servicesEnabled: dto.servicesEnabled !== false,
            appVersion: dto.appVersion || last?.appVersion || null,
            // The "refresh now" request has been served — clear the flag.
            refreshRequestedAt: null,
          },
          { merge: true },
        );
      }
    });

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
      capturedAt: new Date(p.ts),
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
      this.db.findMany('users', { familyId, role: 'CHILD' }),
      this.getSettings(familyId),
    ]);

    const rows = await Promise.all(
      users.map(async (user: any) => {
        const profiles = await this.db.findMany('childProfiles', { userId: user.id });
        const profile = profiles[0];
        if (!profile) return null;

        const doc = this.db.getSync(LAST_COLLECTION, profile.id);
        const childCfg = settings.perChild?.[profile.id] || {};

        return {
          childId: profile.id,
          userId: user.id,
          name: profile.name || user.login,
          login: user.login,
          avatarUrl: profile.avatarUrl || null,
          trackingEnabled: settings.enabled !== false && childCfg.enabled !== false,
          location: hasCoordinates(doc) ? this.toLocationResponse(doc) : null,
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

    const rows = await this.db.findMany(
      HISTORY_COLLECTION,
      { childId, capturedAt: { gte: fromDate, lte: toDate } },
      { capturedAt: 'desc' },
      limit,
    );

    // Newest-first with the limit applied gives the most recent `limit`
    // points; the track itself is then drawn oldest-first.
    const points = rows
      .map((row: any) => this.toLocationResponse(row))
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
    await this.db.set(
      LAST_COLLECTION,
      childId,
      { childId, familyId, refreshRequestedAt: new Date() },
      { merge: true },
    );
    return { ok: true, childId };
  }

  /** Ребёнок видит, что именно о нём известно — требование прозрачности. */
  async getMyStatus(userId: string, familyId: string) {
    const profiles = await this.db.findMany('childProfiles', { userId });
    const profile = profiles[0];
    if (!profile) throw new NotFoundException('Child profile not found');

    const settings = await this.getSettings(familyId);
    const childCfg = settings.perChild?.[profile.id] || {};
    const doc = this.db.getSync(LAST_COLLECTION, profile.id);

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
    // Was a paged read/delete loop capped at 300 per batch to stay under
    // Firestore's 500-operation batch limit. One statement now, and it is
    // atomic: a parent erasing their child's location history no longer risks
    // stopping half-way.
    const deleted = await this.db.deleteMany(HISTORY_COLLECTION, { childId });
    return { childId, deleted };
  }

  /**
   * Retention sweep for location history.
   *
   * Firestore expired these rows through a TTL policy on `expiresAt`; SQLite
   * has no equivalent, so without this the table is the one thing in the
   * database that grows without bound — a child reporting every 60 s adds
   * ~1440 rows a day, forever. Each row still carries the `expiresAt` its
   * family's `historyDays` setting implied when it was written, so the sweep
   * honours per-family retention without re-reading settings.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredPoints(): Promise<number> {
    try {
      const removed = await this.db.deleteMany(HISTORY_COLLECTION, { expiresAt: { lt: new Date() } });
      if (removed > 0) {
        this.logger.log(`[retention] removed ${removed} expired location point(s)`);
      }
      return removed;
    } catch (error: any) {
      this.logger.error(`[retention] sweep failed: ${error?.message}`);
      return 0;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Настройки
  // ─────────────────────────────────────────────────────────────

  async getSettings(familyId: string) {
    const stored = this.db.getSync(SETTINGS_COLLECTION, familyId) || {};
    return { ...DEFAULT_LOCATION_SETTINGS, ...stored, perChild: stored?.perChild || {} };
  }

  async updateSettings(familyId: string, dto: UpdateFamilyLocationSettingsDto) {
    await this.db.set(SETTINGS_COLLECTION, familyId, { ...dto, familyId }, { merge: true });

    if (dto.enabled === false) {
      await this.revokeFamilyDevices(familyId);
    }

    return this.getSettings(familyId);
  }

  async updateChildSettings(familyId: string, childIdOrUserId: string, dto: UpdateChildLocationSettingsDto) {
    const childId = await this.resolveChildId(familyId, childIdOrUserId);

    const childPatch: Record<string, any> = {};
    if (dto.enabled !== undefined) childPatch.enabled = dto.enabled;
    if (dto.historyDays !== undefined) childPatch.historyDays = dto.historyDays;

    // mergeNested is what keeps the other children's settings alive: a plain
    // merge would replace the whole `perChild` map with a single-entry one,
    // silently resetting every sibling to defaults.
    await this.db.set(
      SETTINGS_COLLECTION,
      familyId,
      { familyId, perChild: { [childId]: childPatch } },
      { merge: true, mergeNested: true },
    );

    if (dto.enabled === false) {
      const profile = await this.db.findFirst('childProfiles', { id: childId });
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
    const resolved = await getChildProfileId(this.db, childIdOrUserId, familyId);
    if (!resolved) {
      throw new NotFoundException('Child not found in this family');
    }
    return resolved.childProfileId;
  }

  private async revokeFamilyDevices(familyId: string): Promise<void> {
    const users = await this.db.findMany('users', { familyId, role: 'CHILD' });
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
