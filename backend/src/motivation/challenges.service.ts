import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { LedgerService } from '../ledger/ledger.service';
import { StreakService } from './streak.service';

interface ChallengeRule {
  type: 'DAILY_TASK' | 'TOTAL_TASKS' | 'STREAK' | 'CONSECUTIVE' | 'TASK_POINTS';
  taskId?: string;
  minCompletions?: number;
  minDays?: number;
  minConsecutive?: number;
  minPoints?: number;
}

interface ChallengeReward {
  type: 'POINTS' | 'BADGE';
  value: number;
}

@Injectable()
export class ChallengesService {
  constructor(
    private firestore: FirestoreService,
    private ledgerService: LedgerService,
    private streakService: StreakService,
  ) {}

  async create(familyId: string, dto: any) {
    const challengeId = crypto.randomUUID();
    
    // Конвертируем даты в Date объекты
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();
    
    await this.firestore.create('challenges', {
      id: challengeId,
      familyId,
      title: dto.title,
      description: dto.description,
      imageUrl: dto.imageUrl || null,
      startDate: startDate,
      endDate: endDate,
      ruleJson: JSON.stringify(dto.rule),
      rewardJson: JSON.stringify(dto.reward),
      participantsJson: JSON.stringify(dto.participants || []),
      penaltyEnabled: dto.penaltyEnabled || false,
      penaltyValue: dto.penaltyValue || 0,
      penaltyAfterDays: dto.penaltyAfterDays || 1,
      status: 'ACTIVE',
    }, challengeId);
    
    return this.firestore.findFirst('challenges', { id: challengeId });
  }

  async findAll(familyId: string, childId?: string) {
    try {
      console.log('[ChallengesService] findAll called:', { familyId, childId });
      const challenges = await this.firestore.findMany('challenges', {
        familyId,
        status: 'ACTIVE',
      }, { createdAt: 'desc' });
      console.log('[ChallengesService] Found challenges:', challenges.length);

      if (!childId) {
        // Для родителей - возвращаем статистику по всем детям
        const result = [];
        for (const challenge of challenges) {
          try {
            const stats = await this.getChallengeStatsForParents(challenge, familyId);
            result.push({
              ...challenge,
              childrenStats: stats,
            });
          } catch (error: any) {
            console.error('[ChallengesService] Error processing challenge:', error.message);
            // Продолжаем обработку других challenges
            result.push({
              ...challenge,
              childrenStats: [],
            });
          }
        }
        return result;
      }

      // childId может быть userId или childProfileId
      const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
      const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
      const childProfileId = childProfiles.length > 0 ? childProfiles[0].id : (childProfileById?.id || childId);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Фильтруем по участникам, по датам (активный период) и вычисляем прогресс
      const result = [];
      for (const challenge of challenges) {
        try {
          const start = challenge.startDate?.toDate ? challenge.startDate.toDate() : new Date(challenge.startDate);
          const end = challenge.endDate?.toDate ? challenge.endDate.toDate() : new Date(challenge.endDate);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          if (today < start || today > end) continue;

          const participants = typeof challenge.participantsJson === 'string'
            ? JSON.parse(challenge.participantsJson)
            : challenge.participantsJson || [];
          if (participants.length > 0 && !participants.includes(childProfileId)) continue;

          const progress = await this.getChallengeProgress(challenge, childProfileId);
          const reward = typeof challenge.rewardJson === 'string'
            ? JSON.parse(challenge.rewardJson)
            : challenge.rewardJson || {};
          const rewardPoints = reward.type === 'POINTS' ? (reward.value ?? 0) : 0;

          result.push({
            ...challenge,
            progress,
            rewardPoints,
            target: progress.target,
          });
        } catch (error: any) {
          console.error('[ChallengesService] Error processing challenge for child:', error.message);
        }
      }

      return result;
    } catch (error: any) {
      console.error('[ChallengesService] Error in findAll:', error.message);
      console.error('[ChallengesService] Error stack:', error.stack);
      // Возвращаем пустой массив вместо ошибки, чтобы не ломать UI
      return [];
    }
  }

  /**
   * Получает статистику по челленджу для всех детей (для родителя)
   */
  private async getChallengeStatsForParents(challenge: any, familyId: string) {
    try {
      // Получаем всех детей
      const children = await this.firestore.findMany('users', {
        familyId,
        role: 'CHILD',
      });

      const participants = typeof challenge.participantsJson === 'string'
        ? JSON.parse(challenge.participantsJson)
        : challenge.participantsJson || [];
      const stats = [];

      for (const child of children) {
        try {
          const childProfiles = await this.firestore.findMany('childProfiles', { userId: child.id });
          const childProfile = childProfiles.length > 0 ? childProfiles[0] : null;
          const childProfileId = childProfile?.id || child.id;
          
          // Проверяем, является ли ребенок участником (если участники указаны)
          if (participants.length > 0 && !participants.includes(childProfileId)) {
            continue;
          }

          const progress = await this.getChallengeProgress(challenge, childProfileId);
          
          // Подсчитываем баллы, заработанные в рамках этого челленджа
          const reward = typeof challenge.rewardJson === 'string'
            ? JSON.parse(challenge.rewardJson)
            : challenge.rewardJson;
          let pointsEarned = 0;
          
          // Проверяем, награжден ли уже ребенок
          const allEntries = await this.firestore.findMany('ledgerEntries', {
            familyId,
            childId: child.id,
            refType: 'CHALLENGE',
            refId: challenge.id,
          });

          const rewardEntry = allEntries.length > 0 ? allEntries[0] : null;
          if (rewardEntry && reward.type === 'POINTS') {
            pointsEarned = rewardEntry.amount || 0;
          }

          stats.push({
            childId: child.id,
            childProfileId,
            childName: childProfile?.name || child.login,
            progress,
            pointsEarned,
            isCompleted: progress.current >= progress.target,
          });
        } catch (error: any) {
          console.error('[ChallengesService] Error processing child stats:', error.message);
          // Продолжаем обработку других детей
        }
      }

      // Сортируем по баллам (по убыванию), затем по прогрессу
      stats.sort((a, b) => {
        if (b.pointsEarned !== a.pointsEarned) {
          return b.pointsEarned - a.pointsEarned;
        }
        return b.progress.current - a.progress.current;
      });

      return stats;
    } catch (error: any) {
      console.error('[ChallengesService] Error in getChallengeStatsForParents:', error.message);
      return [];
    }
  }

  async findOne(id: string, familyId: string, childId?: string) {
    const challenge = await this.firestore.findFirst('challenges', { id, familyId });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    if (childId) {
      const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
      const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
      const childProfileId = childProfiles.length > 0 ? childProfiles[0].id : (childProfileById?.id || childId);
      
      const progress = await this.getChallengeProgress(challenge, childProfileId);
      return {
        ...challenge,
        progress,
      };
    }

    return challenge;
  }

  async update(id: string, familyId: string, dto: any) {
    await this.findOne(id, familyId);

    const updateData: any = {};
    if (dto.title) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl || null;
    if (dto.startDate) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate) updateData.endDate = new Date(dto.endDate);
    if (dto.rule) updateData.ruleJson = JSON.stringify(dto.rule);
    if (dto.reward) updateData.rewardJson = JSON.stringify(dto.reward);
    if (dto.participants) updateData.participantsJson = JSON.stringify(dto.participants);
    if (dto.penaltyEnabled !== undefined) updateData.penaltyEnabled = dto.penaltyEnabled;
    if (dto.penaltyValue !== undefined) updateData.penaltyValue = dto.penaltyValue || 0;
    if (dto.status) updateData.status = dto.status;

    await this.firestore.update('challenges', id, updateData);
    return this.firestore.findFirst('challenges', { id });
  }

  async delete(id: string, familyId: string) {
    await this.findOne(id, familyId);
    await this.firestore.delete('challenges', id);
    return { success: true };
  }

  /**
   * Проверяет прогресс челленджа и начисляет награду при завершении
   */
  async checkAndRewardChallenge(challengeId: string, familyId: string, childId: string) {
    // childId может быть userId или childProfileId
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
    const childProfileId = childProfiles.length > 0 ? childProfiles[0].id : (childProfileById?.id || childId);
    const userId = childProfiles.length > 0 ? childProfiles[0].userId : childId;

    const challenge = await this.firestore.findFirst('challenges', { id: challengeId, familyId });

    if (!challenge) {
      return null;
    }

    const progress = await this.getChallengeProgress(challenge, childProfileId);
    const rule = typeof challenge.ruleJson === 'string'
      ? JSON.parse(challenge.ruleJson)
      : challenge.ruleJson;
    const reward = typeof challenge.rewardJson === 'string'
      ? JSON.parse(challenge.rewardJson)
      : challenge.rewardJson;

    // Проверяем, выполнен ли челлендж
    const isCompleted = this.isChallengeCompleted(rule, progress);

    if (!isCompleted) {
      return { completed: false, progress };
    }

    // Проверяем, не награжден ли уже
    const allEntries = await this.firestore.findMany('ledgerEntries', {
      familyId,
      childId: userId,
      refType: 'CHALLENGE',
      refId: challengeId,
    });

    if (allEntries.length > 0) {
      return { completed: true, progress, alreadyRewarded: true };
    }

    // Начисляем награду
    if (reward.type === 'POINTS') {
      await this.ledgerService.createEntry(
        familyId,
        userId,
        'BONUS',
        'CHALLENGE',
        reward.value,
        challengeId,
        {
          challengeTitle: challenge.title,
          challengeId: challenge.id,
        },
      );
    }

    // Создаем уведомление для родителя о завершении челленджа
    try {
      const user = userId ? await this.firestore.findFirst('users', { id: userId }) : null;
      const childProfileForNotification = await this.firestore.findFirst('childProfiles', { id: childProfileId });
      
      if (user && user.familyId && childProfileForNotification) {
        const notificationId = crypto.randomUUID();
        await this.firestore.create('notifications', {
          id: notificationId,
          familyId: user.familyId,
          type: 'CHALLENGE_COMPLETED',
          title: 'Ребенок завершил челлендж',
          message: `${childProfileForNotification?.name || 'Ребенок'} завершил челлендж "${challenge.title}"`,
          childId: childProfileId,
          userId: userId,
          refType: 'CHALLENGE',
          refId: challengeId,
          read: false,
          createdAt: new Date(),
        }, notificationId);
      }
    } catch (notificationError: any) {
      console.error('[ChallengesService] Error creating notification:', notificationError.message);
      // Не прерываем выполнение, если уведомление не создалось
    }
    
    return { completed: true, progress, rewarded: true };
  }

  /**
   * Получает прогресс выполнения челленджа
   */
  private async getChallengeProgress(challenge: any, childId: string) {
    const rule = typeof challenge.ruleJson === 'string'
      ? JSON.parse(challenge.ruleJson)
      : challenge.ruleJson;
    const startDate = challenge.startDate?.toDate ? challenge.startDate.toDate() : new Date(challenge.startDate);
    const endDate = challenge.endDate?.toDate ? challenge.endDate.toDate() : new Date(challenge.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (rule.type === 'DAILY_TASK' && rule.taskId) {
      // Подсчитываем количество дней, когда задание было выполнено
      const allCompletions = await this.firestore.findMany('completions', {
        childId,
        taskId: rule.taskId,
        status: 'APPROVED',
      });

      const completions = allCompletions.filter(c => {
        const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        return performedAt >= startDate && performedAt <= endDate;
      });

      // Группируем по дням
      const uniqueDays = new Set<string>();
      completions.forEach((c) => {
        const date = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        date.setHours(0, 0, 0, 0);
        uniqueDays.add(date.toISOString().split('T')[0]);
      });

      return {
        current: uniqueDays.size,
        target: rule.minDays || 7,
        type: 'DAILY_TASK',
      };
    }

    if (rule.type === 'TOTAL_TASKS') {
      const allCompletions = await this.firestore.findMany('completions', {
        childId,
        status: 'APPROVED',
        ...(rule.taskId && { taskId: rule.taskId }),
      });

      const completions = allCompletions.filter(c => {
        const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        return performedAt >= startDate && performedAt <= endDate;
      });

      return {
        current: completions.length,
        target: rule.minCompletions || 10,
        type: 'TOTAL_TASKS',
      };
    }

    if (rule.type === 'STREAK') {
      // Получаем все завершенные задания в период челленджа
      const allCompletions = await this.firestore.findMany('completions', {
        childId,
        status: 'APPROVED',
        ...(rule.taskId && { taskId: rule.taskId }),
      }, { performedAt: 'asc' });

      const completions = allCompletions.filter(c => {
        const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        return performedAt >= startDate && performedAt <= endDate;
      });

      if (completions.length === 0) {
        return {
          current: 0,
          target: rule.minDays || 7,
          type: 'STREAK',
        };
      }

      // Группируем по дням
      const daysWithCompletions = new Set<string>();
      completions.forEach((c) => {
        const date = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        date.setHours(0, 0, 0, 0);
        daysWithCompletions.add(date.toISOString().split('T')[0]);
      });

      // Вычисляем максимальный streak в период челленджа
      const sortedDays = Array.from(daysWithCompletions).sort();
      let maxStreak = 0;
      let currentStreak = 0;
      let previousDay: Date | null = null;

      for (const dayStr of sortedDays) {
        const currentDay = new Date(dayStr);
        currentDay.setHours(0, 0, 0, 0);

        if (previousDay === null) {
          currentStreak = 1;
          maxStreak = 1;
        } else {
          const daysDiff = Math.floor(
            (currentDay.getTime() - previousDay.getTime()) / (24 * 60 * 60 * 1000)
          );

          if (daysDiff === 1) {
            // Продолжаем streak
            currentStreak += 1;
            maxStreak = Math.max(maxStreak, currentStreak);
          } else {
            // Прерываем streak
            currentStreak = 1;
          }
        }

        previousDay = currentDay;
      }

      return {
        current: maxStreak,
        target: rule.minDays || 7,
        type: 'STREAK',
      };
    }

    // CONSECUTIVE: N дней подряд конкретное задание (текущая серия, без пропусков)
    if (rule.type === 'CONSECUTIVE' && rule.taskId) {
      const allCompletions = await this.firestore.findMany('completions', {
        childId,
        taskId: rule.taskId,
        status: 'APPROVED',
      }, { performedAt: 'asc' });

      const completions = allCompletions.filter(c => {
        const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        return performedAt >= startDate && performedAt <= endDate;
      });

      const daysSet = new Set<string>();
      completions.forEach((c) => {
        const date = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        date.setHours(0, 0, 0, 0);
        daysSet.add(date.toISOString().split('T')[0]);
      });

      // Считаем текущую серию (с сегодня назад)
      const todayStr = today.toISOString().split('T')[0];
      const sortedDays = Array.from(daysSet).sort().reverse();
      let currentStreak = 0;
      let expectedDay = new Date(today);

      for (const dayStr of sortedDays) {
        const expectedStr = expectedDay.toISOString().split('T')[0];
        if (dayStr === expectedStr) {
          currentStreak++;
          expectedDay.setDate(expectedDay.getDate() - 1);
        } else if (dayStr < expectedStr) {
          break;
        }
      }
      // Если сегодня ещё не выполнено — допускаем вчера как начало
      if (currentStreak === 0 && sortedDays.length > 0) {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        if (sortedDays[0] === yesterdayStr) {
          let streak = 0;
          let exp = new Date(yesterday);
          for (const dayStr of sortedDays) {
            if (dayStr === exp.toISOString().split('T')[0]) {
              streak++;
              exp.setDate(exp.getDate() - 1);
            } else break;
          }
          currentStreak = streak;
        }
      }
      // Подавляем предупреждение о неиспользуемой переменной
      void todayStr;

      return {
        current: currentStreak,
        target: rule.minConsecutive || 7,
        type: 'CONSECUTIVE',
      };
    }

    // TASK_POINTS: суммарные баллы за выполнения конкретного задания
    if (rule.type === 'TASK_POINTS' && rule.taskId) {
      const task = await this.firestore.findFirst('tasks', { id: rule.taskId });
      const pointsPerCompletion = task?.points || 0;

      const allCompletions = await this.firestore.findMany('completions', {
        childId,
        taskId: rule.taskId,
        status: 'APPROVED',
      });

      const completions = allCompletions.filter(c => {
        const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        return performedAt >= startDate && performedAt <= endDate;
      });

      return {
        current: completions.length * pointsPerCompletion,
        target: rule.minPoints || 100,
        type: 'TASK_POINTS',
      };
    }

    return {
      current: 0,
      target: 1,
      type: 'UNKNOWN',
    };
  }

  /**
   * Проверяет, выполнен ли челлендж
   */
  private isChallengeCompleted(_rule: ChallengeRule, progress: any): boolean {
    return progress.current >= progress.target;
  }
}
