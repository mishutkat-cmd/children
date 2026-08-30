import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { LocalStorageService } from '../files/local-storage.service';
import { getChildProfileId } from '../db/doc-helpers';

const COLLECTION = 'audioRequests';
const CONSENT_COLLECTION = 'audioConsent';

/** Сколько ребёнку даётся на ответ, прежде чем запрос считается просроченным. */
const CONSENT_WINDOW_MS = 3 * 60 * 1000;
/** Сколько хранится сама запись, потом её убирает retention-свип. */
const AUDIO_RETENTION_DAYS = 7;
export const DEFAULT_DURATION_SEC = 30;
/** Стоячее согласие по умолчанию действует месяц, затем само истекает. */
export const DEFAULT_CONSENT_DAYS = 30;
const MAX_CONSENT_DAYS = 90;

export type AudioStatus = 'PENDING' | 'DENIED' | 'READY' | 'EXPIRED';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(
    private db: DocStore,
    private storage: LocalStorageService,
  ) {}

  // ── Родитель ────────────────────────────────────────────────

  /** Попросить ребёнка записать, что вокруг. Микрофон включится только после его согласия. */
  async createRequest(familyId: string, requestedByUserId: string, childIdOrUserId: string, durationSec: number) {
    const resolved = await getChildProfileId(this.db, childIdOrUserId, familyId);
    if (!resolved) throw new NotFoundException('Child not found in this family');

    const id = crypto.randomUUID();
    const now = new Date();
    await this.db.create(
      COLLECTION,
      {
        id,
        familyId,
        childId: resolved.childProfileId,
        childUserId: resolved.userId,
        requestedByUserId,
        status: 'PENDING' as AudioStatus,
        durationSec,
        audioUrl: null,
        respondedAt: null,
        expiresAt: new Date(now.getTime() + AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      },
      id,
    );

    return this.present(await this.db.get(COLLECTION, id));
  }

  /** Последние запросы семьи — статусы и ссылки на готовые записи. */
  async listForParent(familyId: string) {
    const rows = await this.db.findMany(COLLECTION, { familyId }, { createdAt: 'desc' }, 30);
    return rows.map((r: any) => this.present(r));
  }

  async getOne(familyId: string, id: string) {
    const row = await this.db.get(COLLECTION, id);
    if (!row || row.familyId !== familyId) throw new NotFoundException('Request not found');
    return this.present(row);
  }

  // ── Ребёнок ─────────────────────────────────────────────────

  /** Активный запрос для этого ребёнка — устройство опрашивает его, пока приложение открыто. */
  async pendingForChild(userId: string, familyId: string) {
    const resolved = await getChildProfileId(this.db, userId, familyId);
    if (!resolved) return null;

    const rows = await this.db.findMany(
      COLLECTION,
      { childId: resolved.childProfileId, status: 'PENDING' },
      { createdAt: 'desc' },
      1,
    );
    const row = rows[0];
    if (!row) return null;
    if (this.isExpired(row)) {
      await this.db.update(COLLECTION, row.id, { status: 'EXPIRED' });
      return null;
    }
    return this.present(row);
  }

  async deny(userId: string, familyId: string, id: string) {
    const row = await this.assertOwnPending(userId, familyId, id);
    await this.db.update(COLLECTION, row.id, { status: 'DENIED', respondedAt: new Date() });
    return { ok: true };
  }

  /**
   * Ребёнок согласился и записал: сохраняем аудио в приватную папку и помечаем
   * запрос готовым. Приватную ссылку интерсептор подпишет в ответе родителю.
   */
  async fulfil(userId: string, familyId: string, id: string, file: Express.Multer.File) {
    const row = await this.assertOwnPending(userId, familyId, id);
    if (!file?.buffer?.length) throw new NotFoundException('No audio uploaded');

    const objectPath = `audio/${id}.m4a`;
    await this.storage.save(objectPath, file.buffer);

    await this.db.update(COLLECTION, row.id, {
      status: 'READY',
      audioUrl: `/api/v1/files/${objectPath}`,
      respondedAt: new Date(),
    });
    return { ok: true };
  }

  // ── Стоячее согласие ребёнка ────────────────────────────────

  /**
   * Ребёнок один раз разрешает записывать без отдельного согласия каждый раз.
   * Включает и выключает это ТОЛЬКО сам ребёнок — иначе это была бы слежка,
   * а не функция безопасности. Даже при включённом согласии каждая запись
   * ребёнку видна (плашка и обратный отсчёт) и может быть отменена.
   */
  async setConsent(userId: string, familyId: string, enabled: boolean, days?: number) {
    const resolved = await getChildProfileId(this.db, userId, familyId);
    if (!resolved) throw new NotFoundException('Child profile not found');

    // Согласие всегда с истечением — бессрочного «слушать когда угодно» быть
    // не должно. По умолчанию месяц; ребёнок в любой момент выключает раньше.
    const window = Math.min(Math.max(days ?? DEFAULT_CONSENT_DAYS, 1), MAX_CONSENT_DAYS);
    const expiresAt = enabled ? new Date(Date.now() + window * 24 * 60 * 60 * 1000) : null;

    await this.db.set(
      CONSENT_COLLECTION,
      resolved.childProfileId,
      { childId: resolved.childProfileId, familyId, autoConsent: enabled, expiresAt, updatedAt: new Date() },
      { merge: true },
    );
    return { enabled, expiresAt };
  }

  async getConsent(userId: string, familyId: string) {
    const resolved = await getChildProfileId(this.db, userId, familyId);
    if (!resolved) return { enabled: false, expiresAt: null };
    const doc = this.db.getSync(CONSENT_COLLECTION, resolved.childProfileId);
    return {
      enabled: this.consentFor(resolved.childProfileId),
      expiresAt: doc?.expiresAt ?? null,
    };
  }

  private consentFor(childId: string): boolean {
    const doc = this.db.getSync(CONSENT_COLLECTION, childId);
    if (doc?.autoConsent !== true) return false;
    // Истёкшее согласие больше не действует — снова спросят разрешение.
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) return false;
    return true;
  }

  // ── Общее ───────────────────────────────────────────────────

  private async assertOwnPending(userId: string, familyId: string, id: string) {
    const row = await this.db.get(COLLECTION, id);
    if (!row || row.familyId !== familyId) throw new NotFoundException('Request not found');

    const resolved = await getChildProfileId(this.db, userId, familyId);
    // Отвечать на запрос может только тот ребёнок, которому он адресован.
    if (!resolved || resolved.childProfileId !== row.childId) {
      throw new ForbiddenException('Not your request');
    }
    if (row.status !== 'PENDING' || this.isExpired(row)) {
      throw new NotFoundException('Request is no longer pending');
    }
    return row;
  }

  private isExpired(row: any): boolean {
    const created = new Date(row.createdAt).getTime();
    return Number.isFinite(created) && Date.now() - created > CONSENT_WINDOW_MS;
  }

  private present(row: any) {
    const status: AudioStatus = row.status === 'PENDING' && this.isExpired(row) ? 'EXPIRED' : row.status;
    return {
      id: row.id,
      childId: row.childId,
      status,
      autoConsent: this.consentFor(row.childId),
      durationSec: row.durationSec ?? DEFAULT_DURATION_SEC,
      audioUrl: row.audioUrl ?? null,
      createdAt: row.createdAt,
      respondedAt: row.respondedAt ?? null,
    };
  }
}
