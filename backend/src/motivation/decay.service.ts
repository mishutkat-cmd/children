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
   * Вызывается при логине или по расписанию
   */
  async processDecayForFamily(familyId: string) {
    const decayRule = await this.firestore.findFirst('decayRules', { familyId });

    if (!decayRule || !decayRule.enabled || decayRule.mode === 'OFF') {
      return;
    }

    // Получаем всех детей в семье
    const children = await this.firestore.findMany('users', { familyId, role: 'CHILD' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const child of children) {
      const childProfiles = await this.firestore.findMany('childProfiles', { userId: child.id });
      if (childProfiles.length === 0) {
        continue;
      }
      const childProfile = childProfiles[0];

      await this.processDecayForChild(
        familyId,
        child.id,
        childProfile,
        decayRule,
        today,
      );
    }
  }

  /**
   * Проверяет и применяет decay для конкретного ребенка
   */
  async processDecayForChild(
    familyId: string,
    childId: string,
    childProfile: any,
    decayRule: any,
    today: Date,
  ) {
    // Проверяем, была ли активность сегодня
    const hasActivityToday = await this.hasActivityToday(childId, familyId, today);

    if (hasActivityToday) {
      // Если есть активность сегодня - паук не применяется, сбрасываем счетчик пропусков
      return;
    }

    // Вычисляем количество дней без активности
    const missedDays = await this.getMissedDays(childId, familyId, today);

    if (missedDays < decayRule.startAfterMissedDays) {
      // Еще не достигли порога
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
   * Проверяет, была ли активность сегодня
   */
  private async hasActivityToday(childId: string, familyId: string, today: Date): Promise<boolean> {
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

    return todayCompletions.length > 0;
  }

  /**
   * Вычисляет количество дней без активности
   */
  private async getMissedDays(childId: string, familyId: string, today: Date): Promise<number> {
    // childId может быть userId или childProfileId
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    const childProfileId = childProfiles.length > 0 ? childProfiles[0].id : childId;

    // Находим последнее выполненное задание
    const allCompletions = await this.firestore.findMany('completions', {
      childId: childProfileId,
      familyId,
      status: 'APPROVED',
    }, { performedAt: 'desc' }, 1);

    if (allCompletions.length === 0) {
      // Если никогда не выполнял - считаем с даты создания профиля
      const child = childProfiles.length > 0 ? childProfiles[0] : await this.firestore.findFirst('childProfiles', { id: childId });
      if (!child) {
        return 0;
      }
      const createdAt = child.createdAt?.toDate ? child.createdAt.toDate() : new Date(child.createdAt);
      const daysSinceCreation = this.daysBetween(createdAt, today);
      return Math.max(0, daysSinceCreation - 1);
    }

    const lastCompletion = allCompletions[0];
    const lastDate = lastCompletion.performedAt?.toDate 
      ? lastCompletion.performedAt.toDate() 
      : new Date(lastCompletion.performedAt);
    lastDate.setHours(0, 0, 0, 0);

    return this.daysBetween(lastDate, today);
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
   * Получает информацию о состоянии "паука" для ребенка
   */
  async getDecayStatus(childId: string, familyId: string) {
    const decayRule = await this.firestore.findFirst('decayRules', { familyId });

    if (!decayRule || !decayRule.enabled || decayRule.mode === 'OFF') {
      return {
        active: false,
        warning: false,
        missedDays: 0,
        penalty: 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hasActivityToday = await this.hasActivityToday(childId, familyId, today);
    const missedDays = await this.getMissedDays(childId, familyId, today);

    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    const child = childProfiles.length > 0 ? childProfiles[0] : null;

    if (!child) {
      return {
        active: false,
        warning: false,
        missedDays: 0,
        penalty: 0,
      };
    }

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
