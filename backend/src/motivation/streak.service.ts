import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { LedgerService } from '../ledger/ledger.service';

interface StreakState {
  [ruleId: string]: {
    currentStreak: number;
    lastBonusDate?: string;
    lastActivityDate: string;
  };
}

@Injectable()
export class StreakService {
  constructor(
    private firestore: FirestoreService,
    private ledgerService: LedgerService,
  ) {}

  /**
   * Обновляет streak и начисляет бонусы при подтверждении выполнения задания
   */
  async processStreakOnCompletion(
    familyId: string,
    childId: string,
    taskId: string,
    completionDate: Date,
  ) {
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      return;
    }
    const child = childProfiles[0];

    // Получаем активные правила streak для семьи
    const streakRules = await this.firestore.findMany('streakRules', {
      familyId,
      enabled: true,
    });

    if (streakRules.length === 0) {
      return;
    }

    // Парсим текущее состояние streak
    const streakState: StreakState = child.streakState
      ? (typeof child.streakState === 'string' ? JSON.parse(child.streakState) : child.streakState)
      : {};

    const today = new Date(completionDate);
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Получаем задание для проверки категории
    const task = await this.firestore.findFirst('tasks', { id: taskId });

    if (!task) {
      return;
    }

    const bonuses: Array<{ ruleId: string; amount: number; type: string }> = [];

    // Обрабатываем каждое правило
    for (const rule of streakRules) {
      const ruleId = rule.id;
      const state = streakState[ruleId] || {
        currentStreak: 0,
        lastActivityDate: '',
      };

      // Проверяем, подходит ли это выполнение под правило
      if (!this.matchesRule(rule, taskId, task, childId, familyId, completionDate)) {
        continue;
      }

      const lastActivityDate = state.lastActivityDate
        ? new Date(state.lastActivityDate)
        : null;
      lastActivityDate?.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Проверяем, продолжается ли streak
      if (lastActivityDate && lastActivityDate.getTime() === yesterday.getTime()) {
        // Продолжаем streak
        state.currentStreak += 1;
      } else if (lastActivityDate && lastActivityDate.getTime() === today.getTime()) {
        // Уже выполнено сегодня - не увеличиваем streak
        continue;
      } else {
        // Начинаем новый streak
        state.currentStreak = 1;
      }

      state.lastActivityDate = todayStr;

      // Проверяем, нужно ли начислить бонус
      if (state.currentStreak >= rule.minDaysForBonus) {
        const lastBonusDate = state.lastBonusDate
          ? new Date(state.lastBonusDate)
          : null;

        // Проверяем cooldown
        const canAwardBonus =
          !lastBonusDate ||
          this.daysBetween(lastBonusDate, today) >= rule.cooldownDays;

        if (canAwardBonus) {
          // Начисляем бонус
          let bonusAmount = 0;
          let bonusMultiplier = 1;

          if (rule.bonusType === 'POINTS') {
            bonusAmount = rule.bonusValue;
            await this.ledgerService.createEntry(
              familyId,
              childId,
              'BONUS',
              'COMPLETION',
              bonusAmount,
              null,
              {
                streakRuleId: ruleId,
                streakDays: state.currentStreak,
                bonusType: rule.bonusType,
              },
            );
            bonuses.push({ ruleId, amount: bonusAmount, type: 'POINTS' });
          } else if (rule.bonusType === 'MULTIPLIER') {
            bonusMultiplier = rule.bonusValue / 100; // Например, 120 = 1.2x
            bonuses.push({ ruleId, amount: bonusMultiplier, type: 'MULTIPLIER' });
          } else if (rule.bonusType === 'BADGE') {
            // Бейдж будет начислен через BadgesService
            bonuses.push({ ruleId, amount: rule.bonusValue, type: 'BADGE' });
          }

          state.lastBonusDate = todayStr;
        }
      }

      streakState[ruleId] = state;
    }

    // Сохраняем обновленное состояние
    await this.firestore.update('childProfiles', child.id, {
      streakState: JSON.stringify(streakState),
    });

    return bonuses;
  }

  /**
   * Проверяет, подходит ли выполнение под правило streak
   */
  private async matchesRule(
    rule: any,
    taskId: string,
    task: any,
    childId: string,
    familyId: string,
    completionDate: Date,
  ): Promise<boolean> {
    if (rule.scope === 'TASK') {
      return rule.taskId === taskId;
    }

    if (rule.scope === 'CATEGORY') {
      return task.category && task.category === rule.category;
    }

      if (rule.scope === 'DAILY_TOTAL') {
        // Проверяем минимальное количество заданий за день
        if (rule.minTasksPerDay) {
          const today = new Date(completionDate);
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          // childId может быть userId или childProfileId
          const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
          const childProfileId = childProfiles.length > 0 ? childProfiles[0].id : childId;

          const allCompletions = await this.firestore.findMany('completions', {
            childId: childProfileId,
            familyId,
            status: 'APPROVED',
          });

          const todayCompletions = allCompletions.filter(c => {
            const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
            return performedAt >= today && performedAt < tomorrow;
          });

          return todayCompletions.length >= rule.minTasksPerDay;
        }
        return true;
      }

    return false;
  }

  /**
   * Вычисляет количество дней между двумя датами
   */
  private daysBetween(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date2.getTime() - date1.getTime()) / oneDay));
  }

  /**
   * Получает текущее состояние streak для ребенка
   */
  async getStreakState(childId: string) {
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      return { currentStreak: 0, streaks: [] };
    }
    const child = childProfiles[0];

    const user = await this.firestore.findFirst('users', { id: child.userId });
    if (!user) {
      return { currentStreak: 0, streaks: [] };
    }

    const streakState: StreakState = child.streakState
      ? (typeof child.streakState === 'string' ? JSON.parse(child.streakState) : child.streakState)
      : {};

    // Получаем правила для контекста
    const rules = await this.firestore.findMany('streakRules', {
      familyId: user.familyId,
      enabled: true,
    });

    const streaks: Array<{
      ruleId: string;
      ruleTitle: string;
      currentStreak: number;
      nextBonusAt: number;
      lastActivityDate?: string;
      lastBonusDate?: string;
    }> = [];

    let maxStreak = 0;

    for (const rule of rules) {
      const state = streakState[rule.id] || {
        currentStreak: 0,
        lastActivityDate: '',
      };

      const currentStreak = state.currentStreak || 0;
      maxStreak = Math.max(maxStreak, currentStreak);

      streaks.push({
        ruleId: rule.id,
        ruleTitle: this.getRuleTitle(rule),
        currentStreak,
        nextBonusAt: rule.minDaysForBonus,
        lastActivityDate: state.lastActivityDate,
        lastBonusDate: state.lastBonusDate,
      });
    }

    return {
      currentStreak: maxStreak,
      streaks,
    };
  }

  private getRuleTitle(rule: any): string {
    if (rule.scope === 'TASK' && rule.taskId) {
      return `Задание: ${rule.taskId}`;
    }
    if (rule.scope === 'CATEGORY' && rule.category) {
      return `Категория: ${rule.category}`;
    }
    if (rule.scope === 'DAILY_TOTAL') {
      return `Минимум ${rule.minTasksPerDay || 1} заданий в день`;
    }
    return 'Streak';
  }
}
