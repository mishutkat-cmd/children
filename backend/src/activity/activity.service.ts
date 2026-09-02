import { Injectable, NotFoundException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { getChildProfileId } from '../db/doc-helpers';
import { ReportUsageDto } from './dto/activity.dto';

const COLLECTION = 'appUsage';
/** Сколько дней держим срезы использования. */
const RETENTION_DAYS = 30;

@Injectable()
export class ActivityService {
  constructor(private db: DocStore) {}

  // ── Устройство ребёнка ──────────────────────────────────────

  /**
   * Принять дневной срез экранного времени по приложениям.
   *
   * Идемпотентно: id документа детерминирован (`${childId}_${date}_${package}`),
   * поэтому повторная отправка за тот же день перезаписывает, а не задваивает.
   * UsageStatsManager отдаёт кумулятивные суммы за день, так что перезапись — то,
   * что нужно.
   */
  async report(userId: string, familyId: string, dto: ReportUsageDto) {
    const resolved = await getChildProfileId(this.db, userId, familyId);
    if (!resolved) throw new NotFoundException('Child profile not found');
    const childId = resolved.childProfileId;

    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let accepted = 0;
    for (const app of dto.apps) {
      if (!app.packageName || app.totalMs <= 0) continue;
      const id = `${childId}_${dto.date}_${app.packageName}`;
      await this.db.set(
        COLLECTION,
        id,
        {
          id,
          familyId,
          childId,
          date: dto.date,
          packageName: app.packageName,
          appLabel: app.appLabel || app.packageName,
          totalMs: app.totalMs,
          expiresAt,
        },
        { merge: true },
      );
      accepted++;
    }
    return { accepted };
  }

  // ── Родитель ────────────────────────────────────────────────

  /** Разбивка по приложениям за день для одного ребёнка. */
  async forChild(familyId: string, childIdOrUserId: string, date: string) {
    const resolved = await getChildProfileId(this.db, childIdOrUserId, familyId);
    if (!resolved) throw new NotFoundException('Child not found in this family');
    const childId = resolved.childProfileId;

    const rows = await this.db.findMany(COLLECTION, { childId, date });
    const apps = rows
      .map((r: any) => ({
        packageName: r.packageName,
        appLabel: r.appLabel || r.packageName,
        totalMs: r.totalMs || 0,
      }))
      .sort((a, b) => b.totalMs - a.totalMs);
    const totalMs = apps.reduce((sum, a) => sum + a.totalMs, 0);
    return { childId, date, totalMs, apps };
  }

  /** Итог за день по всем детям — сколько всего экранного времени у каждого. */
  async summary(familyId: string, date: string) {
    const users = await this.db.findMany('users', { familyId, role: 'CHILD' });
    const rows = await Promise.all(
      users.map(async (user: any) => {
        const profiles = await this.db.findMany('childProfiles', { userId: user.id });
        const profile = profiles[0];
        if (!profile) return null;
        const usage = await this.db.findMany(COLLECTION, { childId: profile.id, date });
        const totalMs = usage.reduce((sum: number, r: any) => sum + (r.totalMs || 0), 0);
        const top = usage
          .map((r: any) => ({ appLabel: r.appLabel || r.packageName, totalMs: r.totalMs || 0 }))
          .sort((a, b) => b.totalMs - a.totalMs)[0];
        return {
          childId: profile.id,
          userId: user.id,
          name: profile.name || user.login,
          avatarUrl: profile.avatarUrl || null,
          totalMs,
          topApp: top ? top.appLabel : null,
          hasData: usage.length > 0,
        };
      }),
    );
    return rows.filter(Boolean);
  }
}
