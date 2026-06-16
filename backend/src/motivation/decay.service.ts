import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class DecayService {
  constructor(
    private firestore: FirestoreService,
    private ledgerService: LedgerService,
  ) {}

  /**
   * Проверяет и применяет decay (паук) для всех детей в семье
   * Вызывается при логине или по расписанию.
   *
   * Pre-Phase 2 this was a sequential per-child loop with multiple
   * full-completions scans per child. The per-child block is now driven
   * by the denormalized childProfiles.lastCompletionAt field (set in
   * LedgerService.createEntry for every COMPLETION-refType entry), so
   * hasActivityToday / getMissedDays are O(1) reads from the profile
   * instead of full-history scans. The loop itself is parallelized.
   */
  async processDecayForFamily(familyId: string) {
    const decayRule = await this.firestore.findFirst('decayRules', { familyId });
    if (!decayRule || !decayRule.enabled || decayRule.mode === 'OFF') return;

    // Parallel: list of children + their profiles in two batched reads.
    const children = await this.firestore.findMany('users', { familyId, role: 'CHILD' });
    if (children.length === 0) return;
    const profiles = await this.firestore.findMany('childProfiles', {
      userId: { in: children.map((c: any) => c.id) },
    });
    const profileByUser = new Map<string, any>();
    for (const p of profiles) profileByUser.set(p.userId, p);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await Promise.all(
      children.map(async (child: any) => {
        const childProfile = profileByUser.get(child.id);
        if (!childProfile) return;
        await this.processDecayForChild(familyId, child.id, childProfile, decayRule, today);
      }),
    );
  }

  /**
   * Проверяет и применяет decay для конкретного ребенка.
   * Both hasActivityToday and getMissedDays now read the denormalized
   * childProfiles.lastCompletionAt; they're O(1) and run in parallel.
   */
  async processDecayForChild(
    familyId: string,
    childId: string,
    childProfile: any,
    decayRule: any,
    today: Date,
  ) {
    const lastCompletionAt = this.extractLastCompletionAt(childProfile);

    if (this.isLastCompletionToday(lastCompletionAt, today)) {
      // активность сегодня — паук не применяется
      return;
    }

    const missedDays = this.computeMissedDays(lastCompletionAt, childProfile, today);
    if (missedDays < decayRule.startAfterMissedDays) {
      return;
    }

    // Вычисляем штраф
    const penalty = this.calculatePenalty(
      missedDays,
      decayRule,
      childProfile.pointsBalance,
      childProfile.pointsProtected,
    );

    if (penalty <= 0) {
      return;
    }

    // Применяем штраф в зависимости от режима
    if (decayRule.mode === 'WARN_ONLY') {
      // Только предупреждение - не списываем баллы
      return;
    }

    if (decayRule.mode === 'SOFT') {
      // Мягкий режим - списываем баллы
      await this.ledgerService.createEntry(
        familyId,
        childId,
        'PENALTY',
        'DECAY',
        -penalty,
        null,
        {
          missedDays,
          decayType: decayRule.decayType,
          decayValue: decayRule.decayValue,
        },
      );
    }
  }

  /**
   * Pull the denormalized lastCompletionAt off a childProfile, normalize
   * Firestore Timestamp / Date / null. Returns null only if the field is
   * truly absent (never completed anything; or the field hasn't been
   * backfilled yet — backfill-totalearned-lastcompletion.js handles it
   * after deploy).
   */
  private extractLastCompletionAt(profile: any): Date | null {
    const raw = profile?.lastCompletionAt;
    if (!raw) return null;
    const d = raw?.toDate ? raw.toDate() : new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  /** True if the lastCompletionAt falls on the same calendar day as `today`. */
  private isLastCompletionToday(lastCompletionAt: Date | null, today: Date): boolean {
    if (!lastCompletionAt) return false;
    const d = new Date(lastCompletionAt);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }

  /**
   * Days since the most recent COMPLETION ledger entry. If the child has
   * never completed anything, falls back to "days since profile created
   * minus one" (so a freshly-created child doesn't start in penalty).
   */
  private computeMissedDays(
    lastCompletionAt: Date | null,
    childProfile: any,
    today: Date,
  ): number {
    if (lastCompletionAt) {
      const last = new Date(lastCompletionAt);
      last.setHours(0, 0, 0, 0);
      return this.daysBetween(last, today);
    }
    const created = childProfile?.createdAt?.toDate
      ? childProfile.createdAt.toDate()
      : childProfile?.createdAt
        ? new Date(childProfile.createdAt)
        : null;
    if (!created || isNaN(created.getTime())) return 0;
    const daysSinceCreation = this.daysBetween(created, today);
    return Math.max(0, daysSinceCreation - 1);
  }

  /**
   * Вычисляет размер штрафа
   */
  private calculatePenalty(
    missedDays: number,
    decayRule: any,
    currentBalance: number,
    protectedBalance: number,
  ): number {
    // Защищенный минимум - не трогаем
    const availableBalance = Math.max(0, currentBalance - protectedBalance);

    if (availableBalance <= 0) {
      return 0;
    }

    let penalty = 0;

    if (decayRule.decayType === 'POINTS') {
      // Фиксированное количество баллов за день
      penalty = decayRule.decayValue * (missedDays - decayRule.startAfterMissedDays + 1);
    } else if (decayRule.decayType === 'PERCENT') {
      // Процент от баланса
      penalty = Math.floor((availableBalance * decayRule.decayValue) / 100);
    }

    // Ограничиваем максимальным штрафом за день
    penalty = Math.min(penalty, decayRule.maxDailyPenalty);

    // Не списываем больше, чем есть доступно
    penalty = Math.min(penalty, availableBalance);

    return penalty;
  }

  /**
   * Вычисляет количество дней между двумя датами
   */
  private daysBetween(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date2.getTime() - date1.getTime()) / oneDay));
  }

  /**
   * Получает информацию о состоянии "паука" для ребенка.
   * Decay rule + childProfile fetched in parallel; the rest is pure.
   */
  async getDecayStatus(childId: string, familyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [decayRule, childProfiles] = await Promise.all([
      this.firestore.findFirst('decayRules', { familyId }),
      this.firestore.findMany('childProfiles', { userId: childId }),
    ]);

    if (!decayRule || !decayRule.enabled || decayRule.mode === 'OFF') {
      return { active: false, warning: false, missedDays: 0, penalty: 0 };
    }
    const child = childProfiles[0] ?? null;
    if (!child) {
      return { active: false, warning: false, missedDays: 0, penalty: 0 };
    }

    const lastCompletionAt = this.extractLastCompletionAt(child);
    const hasActivityToday = this.isLastCompletionToday(lastCompletionAt, today);
    const missedDays = this.computeMissedDays(lastCompletionAt, child, today);

    const penalty = this.calculatePenalty(
      missedDays,
      decayRule,
      child.pointsBalance || 0,
      child.pointsProtected || 0,
    );

    const isWarning = missedDays >= decayRule.startAfterMissedDays;
    const isActive = isWarning && !hasActivityToday && decayRule.mode !== 'WARN_ONLY';

    return {
      active: isActive,
      warning: isWarning && !hasActivityToday,
      missedDays,
      penalty: decayRule.mode === 'WARN_ONLY' ? 0 : penalty,
      mode: decayRule.mode,
    };
  }
}
