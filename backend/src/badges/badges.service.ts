import { Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { CreateBadgeDto, AwardBadgeDto } from './dto/badges.dto';

/**
 * Per-child precomputed bundle used by getBadgeProgress. Letting the
 * caller batch these once instead of re-reading the same childProfile
 * + completions per badge cuts the badges hot path from O(badges ×
 * type_kinds) down to roughly O(unique_data_loads) — typically O(1)
 * for POINTS-only catalogs.
 */
interface BadgeProgressCtx {
  childProfile: any;
  /**
   * APPROVED completions newer than the oldest cutoff any badge in the
   * catalog needs. Loaded once per child. Empty array means "either no
   * badge needed completions, or the child genuinely has none recent".
   */
  recentCompletions?: any[];
  recentSince?: Date;
}

@Injectable()
export class BadgesService {
  constructor(private firestore: FirestoreService) {}

  // ─── Вспомогательные методы ─────────────────────────────────────────────────

  /**
   * Резолвит childProfileId из userId или childProfileId.
   * Всегда возвращает { childProfile, childProfileId, userId }.
   * Бросает NotFoundException если профиль не найден.
   */
  private async resolveChildProfile(childId: string): Promise<{
    childProfile: any;
    childProfileId: string;
    userId: string;
  }> {
    // Пробуем найти профиль по userId и по id параллельно
    const [byUserId, byId] = await Promise.all([
      this.firestore.findFirst('childProfiles', { userId: childId }),
      this.firestore.findFirst('childProfiles', { id: childId }),
    ]);
    const childProfile = byUserId ?? byId;
    if (!childProfile) {
      throw new NotFoundException(`Child profile not found for id: ${childId}`);
    }
    const childProfileId = childProfile.id;
    const userId = childProfile.userId ?? (byId ? childId : childProfile.id);
    return { childProfile, childProfileId, userId };
  }

  /**
   * Проверяет, получен ли бейдж ребёнком.
   * Проверяет по обоим возможным childId (userId и childProfileId).
   */
  private async findExistingChildBadge(childProfileId: string, badgeId: string): Promise<any | null> {
    return this.firestore.findFirst('childBadges', { childId: childProfileId, badgeId });
  }

  /**
   * Pick the oldest cutoff a child needs across the badge catalog,
   * so we can fetch completions ONCE per child rather than per badge.
   * For DAYS badges: 2×targetDays. For CHALLENGE badges: challenge.startDate.
   * Returns null if no badge needs completions.
   */
  private async computeRecentSince(badges: any[]): Promise<Date | null> {
    let oldest: Date | null = null;
    for (const b of badges) {
      const cond = this.parseCondition(b);
      if (!cond) continue;
      const { type, value, challengeId } = cond;
      if (type === 'DAYS') {
        const windowDays = (value ?? 7) * 2;
        const d = new Date();
        d.setDate(d.getDate() - windowDays);
        d.setHours(0, 0, 0, 0);
        if (!oldest || d < oldest) oldest = d;
      } else if (type === 'CHALLENGE' && challengeId) {
        const challenge = await this.firestore.findFirst('challenges', { id: challengeId });
        if (challenge?.startDate) {
          const d = challenge.startDate instanceof Date
            ? challenge.startDate
            : new Date(challenge.startDate);
          if (!isNaN(d.getTime()) && (!oldest || d < oldest)) oldest = d;
        }
      }
    }
    return oldest;
  }

  private parseCondition(badge: any): any | null {
    if (!badge.conditionJson) return null;
    if (typeof badge.conditionJson !== 'string') return badge.conditionJson;
    try {
      return JSON.parse(badge.conditionJson);
    } catch {
      return null;
    }
  }

  /**
   * Вычисляет прогресс ребёнка к получению бейджа.
   * ctx is mandatory; the caller is expected to have pre-loaded the
   * child's profile (and optionally completions) once for the whole
   * badge catalog.
   */
  private async getBadgeProgress(
    badge: any,
    childProfileId: string,
    _familyId: string,
    ctx: BadgeProgressCtx,
  ): Promise<{ current: number; target: number; type: string }> {
    if (!badge.conditionJson) {
      return { current: 0, target: 1, type: 'MANUAL' };
    }
    const condition = this.parseCondition(badge);
    if (!condition) return { current: 0, target: 1, type: 'ERROR' };

    const { type, value, challengeId } = condition;

    try {
      if (type === 'DAYS') {
        return this.calcDaysProgress(value ?? 7, ctx.recentCompletions ?? []);
      }
      if (type === 'POINTS') {
        return this.calcPointsProgress(value ?? 100, ctx.childProfile);
      }
      if (type === 'CHALLENGE' && challengeId) {
        return await this.calcChallengeProgress(childProfileId, challengeId, ctx.recentCompletions);
      }
    } catch (e: any) {
      console.error('[BadgesService] getBadgeProgress error:', e.message, { badge: badge.id, childProfileId, type });
    }

    return { current: 0, target: 1, type: 'UNKNOWN' };
  }

  /**
   * Pure: takes already-fetched completions (within a ≥2×targetDays
   * window) and computes max consecutive day-streak in the most recent
   * targetDays. No I/O.
   */
  private calcDaysProgress(
    targetDays: number,
    recentCompletions: any[],
  ): { current: number; target: number; type: string } {
    const windowDays = targetDays * 2;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);
    windowStart.setHours(0, 0, 0, 0);

    const uniqueDays = new Set<string>();
    for (const c of recentCompletions) {
      const d = c.performedAt instanceof Date ? new Date(c.performedAt) : new Date(c.performedAt);
      if (d < windowStart) continue;
      d.setHours(0, 0, 0, 0);
      uniqueDays.add(d.toISOString().split('T')[0]);
    }

    let maxStreak = 0;
    let currentStreak = 0;
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      if (uniqueDays.has(d.toISOString().split('T')[0])) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    return { current: Math.min(maxStreak, targetDays), target: targetDays, type: 'DAYS' };
  }

  /**
   * O(1) — reads the denormalized totalEarned counter on childProfiles
   * instead of scanning the full ledger. Field is maintained
   * transactionally by LedgerService.createEntry; if the counter ever
   * drifts, the integrity-check cron flags it.
   */
  private calcPointsProgress(
    targetPoints: number,
    childProfile: any,
  ): { current: number; target: number; type: string } {
    const totalEarned = childProfile?.totalEarned ?? 0;
    return { current: Math.min(totalEarned, targetPoints), target: targetPoints, type: 'POINTS' };
  }

  /**
   * For CHALLENGE badges: scope completions to the challenge window.
   * If recentCompletions is pre-loaded and covers the window, we still
   * use it (already in memory); otherwise we hit Firestore with a tight
   * server-side range that uses the composite index childId+status+performedAt.
   */
  private async calcChallengeProgress(
    childProfileId: string,
    challengeId: string,
    recentCompletions?: any[],
  ): Promise<{ current: number; target: number; type: string }> {
    const challenge = await this.firestore.findFirst('challenges', { id: challengeId });
    if (!challenge) return { current: 0, target: 1, type: 'CHALLENGE' };

    const rule = typeof challenge.ruleJson === 'string' ? JSON.parse(challenge.ruleJson) : challenge.ruleJson;
    const startDate = challenge.startDate instanceof Date ? challenge.startDate : new Date(challenge.startDate);
    const endDate = challenge.endDate instanceof Date ? challenge.endDate : new Date(challenge.endDate);

    const completions = recentCompletions && recentCompletions.length > 0
      ? recentCompletions
      : await this.firestore.findMany(
          'completions',
          {
            childId: childProfileId,
            status: 'APPROVED',
            performedAt: { gte: startDate, lte: endDate },
            ...(rule.taskId && { taskId: rule.taskId }),
          },
        );

    const inRange = completions.filter(c => {
      const d = c.performedAt instanceof Date ? c.performedAt : new Date(c.performedAt);
      const inWindow = d >= startDate && d <= endDate;
      if (rule.taskId) return inWindow && c.taskId === rule.taskId;
      return inWindow;
    });

    if (rule.type === 'DAILY_TASK') {
      const uniqueDays = new Set<string>();
      for (const c of inRange) {
        const d = c.performedAt instanceof Date ? new Date(c.performedAt) : new Date(c.performedAt);
        d.setHours(0, 0, 0, 0);
        uniqueDays.add(d.toISOString().split('T')[0]);
      }
      const target = rule.minDays ?? 7;
      return { current: Math.min(uniqueDays.size, target), target, type: 'CHALLENGE' };
    }

    if (rule.type === 'TOTAL_TASKS') {
      const target = rule.minCompletions ?? 10;
      return { current: Math.min(inRange.length, target), target, type: 'CHALLENGE' };
    }

    return { current: 0, target: 1, type: 'CHALLENGE' };
  }

  /**
   * Build a per-child ctx: load the childProfile (for totalEarned) and,
   * if any badge in the catalog needs completion data, fetch completions
   * once with a server-side `performedAt >= cutoff` constraint.
   */
  private async buildCtx(
    childProfileId: string,
    childProfile: any,
    badges: any[],
  ): Promise<BadgeProgressCtx> {
    const recentSince = await this.computeRecentSince(badges);
    if (!recentSince) {
      return { childProfile };
    }
    const recentCompletions = await this.firestore.findMany('completions', {
      childId: childProfileId,
      status: 'APPROVED',
      performedAt: { gte: recentSince },
    });
    return { childProfile, recentCompletions, recentSince };
  }

  // ─── Публичные методы ────────────────────────────────────────────────────────

  async findAll(familyId: string) {
    const [badges, children] = await Promise.all([
      this.firestore.findMany('badges', { familyId }, { createdAt: 'desc' }),
      this.firestore.findMany('users', { familyId, role: 'CHILD' }),
    ]);

    if (children.length === 0) {
      return badges.map((b) => ({ ...b, childrenProgress: [] }));
    }

    // Prefetch — one query each for the whole family instead of N per
    // (badge × child). Was N×M sequential round-trips per page render.
    const childIds = children.map((c: any) => c.id);
    const allChildProfiles = await this.firestore.findMany('childProfiles', {
      userId: { in: childIds },
    });
    const profileByUser = new Map<string, any>();
    for (const p of allChildProfiles) profileByUser.set(p.userId, p);
    const profileIds = allChildProfiles.map((p: any) => p.id);
    const childBadges =
      profileIds.length > 0
        ? await this.firestore.findMany('childBadges', { childId: { in: profileIds } })
        : [];
    const earnedSet = new Set<string>();
    const earnedAtByKey = new Map<string, any>();
    for (const cb of childBadges) {
      const key = `${cb.childId}::${cb.badgeId}`;
      earnedSet.add(key);
      earnedAtByKey.set(key, cb.earnedAt);
    }

    // Per-child ctx (childProfile + recent completions if any badge needs them).
    const ctxByChildProfileId = new Map<string, BadgeProgressCtx>();
    await Promise.all(
      children.map(async (child: any) => {
        const profile = profileByUser.get(child.id) ?? null;
        const profileId = profile?.id ?? child.id;
        const ctx = await this.buildCtx(profileId, profile, badges);
        ctxByChildProfileId.set(profileId, ctx);
      }),
    );

    return Promise.all(
      badges.map(async (badge) => {
        const childrenProgress = await Promise.all(
          children.map(async (child: any) => {
            const profile = profileByUser.get(child.id) ?? null;
            const childProfileId = profile?.id ?? child.id;
            const key = `${childProfileId}::${badge.id}`;
            if (earnedSet.has(key)) {
              return {
                childId: child.id,
                childProfileId,
                childName: profile?.name ?? child.login,
                earned: true,
                earnedAt: earnedAtByKey.get(key),
                progress: { current: 100, target: 100, percentage: 100 },
              };
            }
            const ctx = ctxByChildProfileId.get(childProfileId) ?? { childProfile: profile };
            const progress = await this.getBadgeProgress(badge, childProfileId, familyId, ctx);
            const percentage =
              progress.target > 0
                ? Math.min(100, Math.round((progress.current / progress.target) * 100))
                : 0;
            return {
              childId: child.id,
              childProfileId,
              childName: profile?.name ?? child.login,
              earned: false,
              progress: { ...progress, percentage },
            };
          }),
        );
        return { ...badge, childrenProgress };
      }),
    );
  }

  async findOne(id: string, familyId: string) {
    const badge = await this.firestore.findFirst('badges', { id, familyId });
    if (!badge) throw new NotFoundException('Badge not found');
    return badge;
  }

  async create(familyId: string, dto: CreateBadgeDto) {
    const badgeId = crypto.randomUUID();
    await this.firestore.create('badges', { id: badgeId, familyId, ...dto }, badgeId);
    return this.firestore.findFirst('badges', { id: badgeId });
  }

  async update(id: string, familyId: string, dto: Partial<CreateBadgeDto>) {
    await this.findOne(id, familyId);
    await this.firestore.update('badges', id, dto);
    return this.firestore.findFirst('badges', { id });
  }

  async delete(id: string, familyId: string) {
    await this.findOne(id, familyId);
    await this.firestore.delete('badges', id);
    return { success: true };
  }

  async getChildBadges(childId: string) {
    const { childProfileId } = await this.resolveChildProfile(childId);

    const childBadges = await this.firestore.findMany('childBadges', { childId: childProfileId }, { earnedAt: 'desc' });
    return Promise.all(childBadges.map(async cb => ({
      ...cb,
      badge: await this.firestore.findFirst('badges', { id: cb.badgeId }),
    })));
  }

  async getChildBadgesWithProgress(childId: string, familyId: string) {
    const { childProfile, childProfileId } = await this.resolveChildProfile(childId);
    const badges = await this.firestore.findMany('badges', { familyId }, { createdAt: 'desc' });
    if (badges.length === 0) return [];

    // Prefetch childBadges + ctx (profile + recent completions) ONCE.
    const [existingBadges, ctx] = await Promise.all([
      this.firestore.findMany('childBadges', { childId: childProfileId }),
      this.buildCtx(childProfileId, childProfile, badges),
    ]);
    const existingByBadgeId = new Map<string, any>();
    for (const cb of existingBadges) existingByBadgeId.set(cb.badgeId, cb);

    const result = await Promise.all(
      badges.map(async (badge) => {
        const existing = existingByBadgeId.get(badge.id);
        if (existing) {
          return {
            ...existing,
            badge,
            earned: true,
            progress: { current: 100, target: 100, percentage: 100 },
          };
        }
        const progress = await this.getBadgeProgress(badge, childProfileId, familyId, ctx);
        const percentage =
          progress.target > 0
            ? Math.min(100, Math.round((progress.current / progress.target) * 100))
            : 0;
        if (progress.target > 0 && progress.current >= progress.target) {
          try {
            const awarded = await this.awardBadge(childId, { badgeId: badge.id });
            return {
              ...awarded,
              earned: true,
              progress: { current: 100, target: 100, percentage: 100 },
            };
          } catch {
            const afterAward = await this.findExistingChildBadge(childProfileId, badge.id);
            return afterAward
              ? { ...afterAward, badge, earned: true, progress: { current: 100, target: 100, percentage: 100 } }
              : { badge, earned: false, progress: { ...progress, percentage } };
          }
        }
        return { badge, earned: false, progress: { ...progress, percentage } };
      }),
    );
    return result;
  }

  async awardBadge(childId: string, dto: AwardBadgeDto) {
    const { childProfile, childProfileId } = await this.resolveChildProfile(childId);

    const badge = await this.firestore.findFirst('badges', { id: dto.badgeId });
    if (!badge) throw new NotFoundException('Badge not found');

    // Идемпотентность: если уже выдан — возвращаем существующую запись
    const existing = await this.findExistingChildBadge(childProfileId, dto.badgeId);
    if (existing) {
      return { ...existing, badge };
    }

    const childBadgeId = crypto.randomUUID();
    await this.firestore.create('childBadges', {
      id: childBadgeId,
      childId: childProfileId,
      badgeId: dto.badgeId,
      earnedAt: new Date(),
    }, childBadgeId);

    // Уведомление для родителя
    try {
      const familyId = childProfile.familyId
        ?? (await this.firestore.findFirst('users', { id: childProfile.userId }))?.familyId;
      if (familyId) {
        const notificationId = crypto.randomUUID();
        await this.firestore.create('notifications', {
          id: notificationId,
          familyId,
          type: 'BADGE_EARNED',
          title: 'Ребенок получил бейдж',
          message: `${childProfile.name ?? 'Ребенок'} получил бейдж "${badge.title}"`,
          childId: childProfileId,
          userId: childProfile.userId ?? childId,
          refType: 'BADGE',
          refId: childBadgeId,
          read: false,
          createdAt: new Date(),
        }, notificationId);
      }
    } catch (e: any) {
      console.error('[BadgesService] Notification error:', e.message);
    }

    const childBadge = await this.firestore.findFirst('childBadges', { id: childBadgeId });
    return { ...childBadge, badge };
  }

  /**
   * Called from LedgerService.runPostCreateSideEffects after EVERY
   * ledger write (i.e. after every task completion). The old shape was
   * a sequential for-of doing 2 reads per badge (existing + progress
   * sub-queries) — at 10 badges × 1 child this was 20+ round-trips per
   * task completion. Now: prefetch existing childBadges + ctx once;
   * filter unearned badges; compute progress in parallel; only award
   * those that crossed the threshold.
   */
  async checkAndAwardBadges(childId: string, familyId: string, _context?: any): Promise<any[]> {
    let childProfileId: string;
    let childProfile: any;
    try {
      ({ childProfile, childProfileId } = await this.resolveChildProfile(childId));
    } catch {
      console.warn('[BadgesService] checkAndAwardBadges: child not found', { childId });
      return [];
    }

    const badges = await this.firestore.findMany('badges', { familyId });
    if (badges.length === 0) return [];

    const [existingBadges, ctx] = await Promise.all([
      this.firestore.findMany('childBadges', { childId: childProfileId }),
      this.buildCtx(childProfileId, childProfile, badges),
    ]);
    const earnedBadgeIds = new Set<string>(existingBadges.map((cb: any) => cb.badgeId));
    const unearned = badges.filter((b: any) => !earnedBadgeIds.has(b.id));
    if (unearned.length === 0) return [];

    // Compute progress for every unearned badge in parallel.
    const progresses = await Promise.all(
      unearned.map((badge) => this.getBadgeProgress(badge, childProfileId, familyId, ctx)),
    );
    const toAward = unearned.filter((_, i) => {
      const p = progresses[i];
      return p.target > 0 && p.current >= p.target;
    });
    if (toAward.length === 0) return [];

    // Award in parallel. awardBadge is idempotent (its own existing-check).
    const awarded: any[] = [];
    await Promise.all(
      toAward.map(async (badge) => {
        try {
          await this.awardBadge(childId, { badgeId: badge.id });
          awarded.push(badge);
          console.log(`[BadgesService] Awarded badge "${badge.title}" to child ${childProfileId}`);
        } catch (e: any) {
          console.warn(`[BadgesService] Could not award badge "${badge.title}":`, e.message);
        }
      }),
    );
    return awarded;
  }

  /**
   * Пересчитывает и назначает все заслуженные бейджи для каждого ребёнка семьи.
   * Используется для ретроспективного исправления пропущенных назначений.
   */
  async checkAndAwardAllChildren(familyId: string): Promise<Record<string, any[]>> {
    const children = await this.firestore.findMany('users', { familyId, role: 'CHILD' });
    const results: Record<string, any[]> = {};
    await Promise.all(children.map(async child => {
      results[child.id] = await this.checkAndAwardBadges(child.id, familyId);
    }));
    return results;
  }
}
