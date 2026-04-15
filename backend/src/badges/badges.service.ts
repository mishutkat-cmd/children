import { Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { CreateBadgeDto, AwardBadgeDto } from './dto/badges.dto';

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
   * Вычисляет прогресс ребёнка к получению бейджа.
   */
  private async getBadgeProgress(
    badge: any,
    childProfileId: string,
    familyId: string,
  ): Promise<{ current: number; target: number; type: string }> {
    if (!badge.conditionJson) {
      return { current: 0, target: 1, type: 'MANUAL' };
    }

    let condition: any;
    try {
      condition = JSON.parse(badge.conditionJson);
    } catch {
      return { current: 0, target: 1, type: 'ERROR' };
    }

    const { type, value, challengeId } = condition;

    try {
      if (type === 'DAYS') {
        return await this.calcDaysProgress(childProfileId, value ?? 7);
      }

      if (type === 'POINTS') {
        return await this.calcPointsProgress(childProfileId, value ?? 100);
      }

      if (type === 'CHALLENGE' && challengeId) {
        return await this.calcChallengeProgress(childProfileId, challengeId);
      }
    } catch (e: any) {
      console.error('[BadgesService] getBadgeProgress error:', e.message, { badge: badge.id, childProfileId, type });
    }

    return { current: 0, target: 1, type: 'UNKNOWN' };
  }

  private async calcDaysProgress(
    childProfileId: string,
    targetDays: number,
  ): Promise<{ current: number; target: number; type: string }> {
    // Смотрим окно в 2×targetDays чтобы не пропустить стрик у границы окна
    const windowDays = targetDays * 2;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);
    windowStart.setHours(0, 0, 0, 0);

    const allCompletions = await this.firestore.findMany('completions', { childId: childProfileId, status: 'APPROVED' });
    const recentCompletions = allCompletions.filter(c => {
      const d = c.performedAt instanceof Date ? c.performedAt : new Date(c.performedAt);
      return d >= windowStart;
    });

    // Уникальные дни с выполнением
    const uniqueDays = new Set<string>();
    for (const c of recentCompletions) {
      const d = c.performedAt instanceof Date ? new Date(c.performedAt) : new Date(c.performedAt);
      d.setHours(0, 0, 0, 0);
      uniqueDays.add(d.toISOString().split('T')[0]);
    }

    // Считаем максимальный непрерывный стрик в окне
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

  private async calcPointsProgress(
    childProfileId: string,
    targetPoints: number,
  ): Promise<{ current: number; target: number; type: string }> {
    // Use total EVER earned (EARN + BONUS), not current balance.
    // This ensures badges are never lost after spending points.
    const childProfile = await this.firestore.findFirst('childProfiles', { id: childProfileId });
    const userId = childProfile?.userId;
    if (!userId) return { current: 0, target: targetPoints, type: 'POINTS' };

    const entries = await this.firestore.findMany('ledgerEntries', { childId: userId });
    const totalEarned = entries
      .filter((e: any) => e.type === 'EARN' || e.type === 'BONUS')
      .reduce((sum: number, e: any) => sum + Math.abs(e.amount || 0), 0);

    return { current: Math.min(totalEarned, targetPoints), target: targetPoints, type: 'POINTS' };
  }

  private async calcChallengeProgress(
    childProfileId: string,
    challengeId: string,
  ): Promise<{ current: number; target: number; type: string }> {
    const challenge = await this.firestore.findFirst('challenges', { id: challengeId });
    if (!challenge) return { current: 0, target: 1, type: 'CHALLENGE' };

    const rule = typeof challenge.ruleJson === 'string' ? JSON.parse(challenge.ruleJson) : challenge.ruleJson;
    const startDate = challenge.startDate instanceof Date ? challenge.startDate : new Date(challenge.startDate);
    const endDate = challenge.endDate instanceof Date ? challenge.endDate : new Date(challenge.endDate);

    const allCompletions = await this.firestore.findMany('completions', {
      childId: childProfileId,
      status: 'APPROVED',
      ...(rule.taskId && { taskId: rule.taskId }),
    });

    const inRange = allCompletions.filter(c => {
      const d = c.performedAt instanceof Date ? c.performedAt : new Date(c.performedAt);
      return d >= startDate && d <= endDate;
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

  // ─── Публичные методы ────────────────────────────────────────────────────────

  async findAll(familyId: string) {
    const [badges, children] = await Promise.all([
      this.firestore.findMany('badges', { familyId }, { createdAt: 'desc' }),
      this.firestore.findMany('users', { familyId, role: 'CHILD' }),
    ]);

    return Promise.all(badges.map(async badge => {
      const childrenProgress = await Promise.all(children.map(async child => {
        const childProfiles = await this.firestore.findMany('childProfiles', { userId: child.id });
        const childProfile = childProfiles[0] ?? null;
        const childProfileId = childProfile?.id ?? child.id;

        const existing = await this.findExistingChildBadge(childProfileId, badge.id);
        if (existing) {
          return {
            childId: child.id,
            childProfileId,
            childName: childProfile?.name ?? child.login,
            earned: true,
            earnedAt: existing.earnedAt,
            progress: { current: 100, target: 100, percentage: 100 },
          };
        }

        const progress = await this.getBadgeProgress(badge, childProfileId, familyId);
        const percentage = progress.target > 0 ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;
        return {
          childId: child.id,
          childProfileId,
          childName: childProfile?.name ?? child.login,
          earned: false,
          progress: { ...progress, percentage },
        };
      }));

      return { ...badge, childrenProgress };
    }));
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
    const { childProfileId } = await this.resolveChildProfile(childId);
    const badges = await this.firestore.findMany('badges', { familyId }, { createdAt: 'desc' });

    const result = [];
    for (const badge of badges) {
      const existing = await this.findExistingChildBadge(childProfileId, badge.id);

      if (existing) {
        result.push({ ...existing, badge, earned: true, progress: { current: 100, target: 100, percentage: 100 } });
        continue;
      }

      const progress = await this.getBadgeProgress(badge, childProfileId, familyId);
      const percentage = progress.target > 0 ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;

      if (progress.target > 0 && progress.current >= progress.target) {
        try {
          const awarded = await this.awardBadge(childId, { badgeId: badge.id });
          result.push({ ...awarded, earned: true, progress: { current: 100, target: 100, percentage: 100 } });
        } catch {
          // Уже выдан параллельным запросом — ищем запись
          const afterAward = await this.findExistingChildBadge(childProfileId, badge.id);
          result.push(afterAward
            ? { ...afterAward, badge, earned: true, progress: { current: 100, target: 100, percentage: 100 } }
            : { badge, earned: false, progress: { ...progress, percentage } },
          );
        }
      } else {
        result.push({ badge, earned: false, progress: { ...progress, percentage } });
      }
    }
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

  async checkAndAwardBadges(childId: string, familyId: string, _context?: any): Promise<any[]> {
    let childProfileId: string;
    try {
      ({ childProfileId } = await this.resolveChildProfile(childId));
    } catch {
      console.warn('[BadgesService] checkAndAwardBadges: child not found', { childId });
      return [];
    }

    const badges = await this.firestore.findMany('badges', { familyId });
    const awarded: any[] = [];

    for (const badge of badges) {
      const existing = await this.findExistingChildBadge(childProfileId, badge.id);
      if (existing) continue;

      const progress = await this.getBadgeProgress(badge, childProfileId, familyId);
      if (progress.target > 0 && progress.current >= progress.target) {
        try {
          await this.awardBadge(childId, { badgeId: badge.id });
          awarded.push(badge);
          console.log(`[BadgesService] Awarded badge "${badge.title}" to child ${childProfileId}`);
        } catch (e: any) {
          console.warn(`[BadgesService] Could not award badge "${badge.title}":`, e.message);
        }
      }
    }

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
