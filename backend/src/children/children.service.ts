import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { StreakService } from '../motivation/streak.service';
import { DecayService } from '../motivation/decay.service';
import { LedgerService } from '../ledger/ledger.service';
import { StorageService } from '../firebase/storage.service';
import { CreateChildDto, UpdateChildDto, CreateParentDto } from './dto/children.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ChildrenService {
  constructor(
    private firestore: FirestoreService,
    private streakService: StreakService,
    private decayService: DecayService,
    private ledgerService: LedgerService,
    private storageService: StorageService,
  ) {}

  async findAll(familyId: string) {
    const users = await this.firestore.findMany('users', { familyId, role: 'CHILD' });
    const result = [];
    
    for (const user of users) {
      const profiles = await this.firestore.findMany('childProfiles', { userId: user.id });
      const childProfile = profiles.length > 0 ? profiles[0] : null;
      result.push({
        ...user,
        childProfile,
      });
    }
    
    return result;
  }

  async findOne(id: string, familyId: string) {
    const user = await this.firestore.findFirst('users', { id, familyId, role: 'CHILD' });

    if (!user) {
      throw new NotFoundException('Child not found');
    }

    const profiles = await this.firestore.findMany('childProfiles', { userId: user.id });
    const childProfile = profiles.length > 0 ? profiles[0] : null;

    return {
      ...user,
      childProfile,
    };
  }

  async create(familyId: string, dto: CreateChildDto) {
    const userId = crypto.randomUUID();
    const profileId = crypto.randomUUID();

    await this.firestore.create('users', {
      id: userId,
      login: dto.login,
      role: 'CHILD',
      familyId,
      passwordHash: dto.pin ? await this.hashPin(dto.pin) : null,
    }, userId);

    await this.firestore.create('childProfiles', {
      id: profileId,
      userId: userId,
      name: dto.name,
      avatarUrl: dto.avatarUrl || null, // Firestore не принимает undefined
      pointsBalance: 0,
      moneyBalanceCents: 0,
      streakState: JSON.stringify({}),
      selectedCharacterId: null, // По умолчанию нет выбранного персонажа
    }, profileId);

    const user = await this.firestore.findFirst('users', { id: userId });
    const profile = await this.firestore.findFirst('childProfiles', { id: profileId });

    return {
      ...user,
      childProfile: profile,
    };
  }

  async update(id: string, familyId: string, dto: UpdateChildDto) {
    await this.findOne(id, familyId);

    if (dto.pin) {
      await this.firestore.update('users', id, {
        passwordHash: await this.hashPin(dto.pin),
      });
    }

    if (dto.name || dto.avatarUrl !== undefined || dto.selectedCharacterId !== undefined) {
      const profiles = await this.firestore.findMany('childProfiles', { userId: id });
      if (profiles.length > 0) {
        const updateData: any = {};
        if (dto.name) {
          updateData.name = dto.name;
        }
        if (dto.avatarUrl !== undefined) {
          updateData.avatarUrl = dto.avatarUrl || null; // Firestore не принимает undefined
        }
        if (dto.selectedCharacterId !== undefined) {
          updateData.selectedCharacterId = dto.selectedCharacterId || null;
        }
        await this.firestore.update('childProfiles', profiles[0].id, updateData);
      }
    }

    return this.findOne(id, familyId);
  }

  async getSummary(childId: string, familyId: string) {
    const child = await this.findOne(childId, familyId);
    const profile = child.childProfile;
    const childProfileId = profile?.id;
    const userId = child.id; // userId для ledger

    // Пересчитываем баланс из ledger entries, чтобы убедиться, что он актуален
    try {
      // Логирование только в development
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChildrenService] Recalculating balance for child:', { userId, childProfileId });
      }
      await this.ledgerService.updateChildBalance(userId);
      // Обновляем profile после пересчета
      const updatedProfile = await this.firestore.findFirst('childProfiles', { id: childProfileId });
      if (updatedProfile) {
        Object.assign(profile, updatedProfile);
      }
    } catch (error: any) {
      console.error('[ChildrenService] Error recalculating balance:', error.message);
      // Не прерываем выполнение, используем текущий баланс
    }

    // Рассчитываем баллы за сегодня для сытости
    // ВАЖНО: Используем дату выполнения задания (performedAt), а не дату создания ledger entry
    let todayPointsBalance = 0;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Получаем все ledger entries
      const allEntries = await this.firestore.findMany('ledgerEntries', { childId: userId });
      
      // Фильтруем записи за сегодня по дате выполнения задания (performedAt из completion)
      const todayEntries = [];
      for (const entry of allEntries) {
        // Пропускаем записи, которые не EARN или BONUS
        if (entry.type !== 'EARN' && entry.type !== 'BONUS') {
          continue;
        }

        // Если это запись для completion, получаем дату выполнения из completion
        if (entry.refType === 'COMPLETION' && entry.refId) {
          try {
            const completion = await this.firestore.findFirst('completions', { id: entry.refId });
            if (completion) {
              // Проверяем, что completion имеет статус APPROVED (только подтвержденные задания считаются)
              if (completion.status !== 'APPROVED') {
                console.log('[ChildrenService] Skipping completion - not approved:', {
                  completionId: entry.refId,
                  status: completion.status,
                });
                continue;
              }

              if (completion.performedAt) {
                const performedAt = completion.performedAt?.toDate 
                  ? completion.performedAt.toDate() 
                  : new Date(completion.performedAt);
                performedAt.setHours(0, 0, 0, 0);
                
                // Проверяем, что выполнение было сегодня
                if (performedAt.getTime() === today.getTime()) {
                  todayEntries.push(entry);
                  console.log('[ChildrenService] Added entry for today:', {
                    entryId: entry.id,
                    amount: entry.amount,
                    performedAt: performedAt.toISOString(),
                  });
                } else {
                  console.log('[ChildrenService] Entry not for today:', {
                    entryId: entry.id,
                    performedAt: performedAt.toISOString(),
                    today: today.toISOString(),
                  });
                }
              } else {
                console.warn('[ChildrenService] Completion has no performedAt:', entry.refId);
                // Если нет performedAt, используем createdAt как fallback
                const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
                if (createdAt >= today && createdAt < tomorrow) {
                  todayEntries.push(entry);
                }
              }
            } else {
              console.warn('[ChildrenService] Completion not found:', entry.refId);
              // Если не удалось найти completion, используем createdAt как fallback
              const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
              if (createdAt >= today && createdAt < tomorrow) {
                todayEntries.push(entry);
              }
            }
          } catch (err: any) {
            console.error('[ChildrenService] Error getting completion:', err.message);
            // Если не удалось найти completion, используем createdAt как fallback
            const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
            if (createdAt >= today && createdAt < tomorrow) {
              todayEntries.push(entry);
            }
          }
        } else {
          // Для других типов записей (BONUS и т.д.) используем createdAt
          const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
          if (createdAt >= today && createdAt < tomorrow) {
            todayEntries.push(entry);
          }
        }
      }

      todayPointsBalance = todayEntries.reduce((sum, entry) => {
        return sum + (entry.amount || 0);
      }, 0);

      console.log('[ChildrenService] Today points balance:', {
        userId,
        todayPointsBalance,
        todayEntriesCount: todayEntries.length,
      });
    } catch (error: any) {
      console.error('[ChildrenService] Error calculating today points balance:', error.message);
      // Используем 0, если не удалось рассчитать
      todayPointsBalance = 0;
    }

    // Get recent completions
    const allCompletions = await this.firestore.findMany('completions', { childId: childProfileId, status: 'APPROVED' }, { performedAt: 'desc' }, 10);
    const recentCompletions = [];
    for (const completion of allCompletions) {
      const task = await this.firestore.findFirst('tasks', { id: completion.taskId });
      recentCompletions.push({
        ...completion,
        task,
      });
    }

    // Get pending completions count
    const pendingCompletionsList = await this.firestore.findMany('completions', { childId: childProfileId, status: 'PENDING' });
    const pendingCompletions = pendingCompletionsList.length;

    // Get pending exchanges count
    const pendingExchangesList = await this.firestore.findMany('exchanges', { childId, status: 'PENDING' });
    const pendingExchanges = pendingExchangesList.length;

    // Get streak state
    const streakStateData = await this.streakService.getStreakState(childId);
    // Преобразуем в формат, ожидаемый фронтендом
    const streakState = streakStateData?.streaks && streakStateData.streaks.length > 0
      ? streakStateData.streaks
      : { currentStreak: streakStateData?.currentStreak || 0 };

    // Get decay status
    const decayStatus = await this.decayService.getDecayStatus(childId, familyId);

    // Get active wishlist goal (priority: isFavorite=true > showOnDashboard=true > first priority, not purchased)
    // ВАЖНО: в коллекции wishlist поле childId — это childProfileId, а не userId. Для ребёнка getSummary вызывается с user.userId, поэтому запрашиваем по childProfileId.
    const allWishlistItems = childProfileId
      ? await this.firestore.findMany('wishlist', { childId: childProfileId }, { priority: 'asc' })
      : [];
    console.log('[ChildrenService] All wishlist items:', allWishlistItems.length, { childId, childProfileId });
    
    // Логируем все элементы для отладки
    if (allWishlistItems.length > 0) {
      console.log('[ChildrenService] All wishlist items details:', JSON.stringify(allWishlistItems.map(item => ({
        id: item.id,
        isFavorite: item.isFavorite,
        isFavoriteType: typeof item.isFavorite,
        isFavoriteRaw: item.isFavorite,
        showOnDashboard: item.showOnDashboard,
        isPurchased: item.isPurchased,
        status: item.status,
        priority: item.priority,
        rewardId: item.rewardId,
      })), null, 2));
    } else {
      console.log('[ChildrenService] No wishlist items found for childProfileId:', childProfileId);
    }
    
    // Сначала ищем желание с isFavorite=true (приоритет выше)
    let activeWishlistItem = null;
    for (const item of allWishlistItems) {
      // Проверяем все возможные варианты true
      const hasIsFavorite = item.isFavorite === true || item.isFavorite === 'true' || item.isFavorite === 1 || item.isFavorite === '1';
      const notPurchased = !item.isPurchased;
      const notCompleted = item.status !== 'COMPLETED';
      const matches = hasIsFavorite && notPurchased && notCompleted;
      
      console.log('[ChildrenService] Checking item for isFavorite:', {
        id: item.id,
        isFavorite: item.isFavorite,
        isFavoriteType: typeof item.isFavorite,
        hasIsFavorite,
        notPurchased,
        notCompleted,
        matches,
      });
      
      if (matches) {
        activeWishlistItem = item;
        console.log('[ChildrenService] Found activeWishlistItem with isFavorite=true:', {
          id: item.id,
          rewardId: item.rewardId,
        });
        break;
      }
    }
    
    // Если нет желания с isFavorite=true, ищем с showOnDashboard=true
    if (!activeWishlistItem) {
      console.log('[ChildrenService] No item with isFavorite=true, checking showOnDashboard');
      activeWishlistItem = allWishlistItems.find(item => {
        const hasShowOnDashboard = item.showOnDashboard === true || item.showOnDashboard === 'true' || item.showOnDashboard === 1;
        const notPurchased = !item.isPurchased;
        const notCompleted = item.status !== 'COMPLETED';
        return hasShowOnDashboard && notPurchased && notCompleted;
      });
    }
    
    // Если нет желания с showOnDashboard=true, берем самое приоритетное
    if (!activeWishlistItem) {
      console.log('[ChildrenService] No item with showOnDashboard=true, using first priority');
      activeWishlistItem = allWishlistItems.find(item => !item.isPurchased && item.status !== 'COMPLETED');
    }
    
    if (activeWishlistItem) {
      console.log('[ChildrenService] Active wishlist item found:', {
        id: activeWishlistItem.id,
        isFavorite: activeWishlistItem.isFavorite,
        showOnDashboard: activeWishlistItem.showOnDashboard,
        rewardId: activeWishlistItem.rewardId,
        isPurchased: activeWishlistItem.isPurchased,
        status: activeWishlistItem.status,
      });
    } else {
      console.log('[ChildrenService] No active wishlist item found');
    }
    
    // Формируем данные для активного желания
    let wishlistGoal = null;
    let availableMoneyCents = 0;
    
    if (activeWishlistItem) {
      const reward = await this.firestore.findFirst('rewards', { id: activeWishlistItem.rewardId });
      if (reward) {
        // Получаем курс конвертации
        let conversionRate = 10;
        try {
          const familySettings = await this.firestore.findFirst('familySettings', { familyId });
          if (familySettings?.conversionRate) {
            conversionRate = typeof familySettings.conversionRate === 'string' 
              ? parseFloat(familySettings.conversionRate) 
              : familySettings.conversionRate;
          }
        } catch (error: any) {
          console.warn('[ChildrenService] Failed to get familySettings:', error.message);
        }
        
        // Вычисляем общую сумму денег ребенка
        const totalMoneyEarnedCents = profile?.moneyBalanceCents || 0;
        
        // Вычисляем потраченные деньги на предыдущие товары (с меньшим приоритетом)
        let totalSpentOnPrevious = 0;
        for (const item of allWishlistItems) {
          if (item.priority < activeWishlistItem.priority && item.moneySpent) {
            totalSpentOnPrevious += item.moneySpent || 0;
          }
        }
        
        // Доступные деньги = общие деньги - потраченные на предыдущие товары
        availableMoneyCents = Math.max(0, totalMoneyEarnedCents - totalSpentOnPrevious);
        
        // Стоимость товара в центах
        const rewardCostCents = Math.round((reward.costPoints / conversionRate) * 100);
        
        // Уже потрачено на этот товар
        const moneySpentOnThis = activeWishlistItem.moneySpent || 0;
        
        // Осталось собрать
        const remainingCents = Math.max(0, rewardCostCents - moneySpentOnThis);
        
        wishlistGoal = { 
          rewardGoal: reward,
          availableMoneyCents,
          moneySpentOnThis,
          remainingCents,
          progressPercent: Math.min(100, Math.round((moneySpentOnThis / rewardCostCents) * 100)),
        };
        console.log('[ChildrenService] WishlistGoal created:', {
          rewardTitle: reward.title,
          rewardId: reward.id,
          costPoints: reward.costPoints,
          costMoneyCents: rewardCostCents,
          moneySpentOnThis,
          remainingCents,
          availableMoneyCents,
          progressPercent: wishlistGoal.progressPercent,
        });
      } else {
        console.log('[ChildrenService] Reward not found for activeWishlistItem:', activeWishlistItem.rewardId);
      }
    } else {
      console.log('[ChildrenService] No activeWishlistItem, wishlistGoal will be null');
    }

    // Get selected character information
    let character = null;
    if (profile?.selectedCharacterId) {
      character = await this.firestore.findFirst('characters', { id: profile.selectedCharacterId, familyId });
    }

    const result = {
      profile,
      pointsBalance: profile?.pointsBalance || 0,
      todayPointsBalance, // Баллы за сегодня для расчета сытости
      recentCompletions,
      pendingCompletions,
      pendingExchanges,
      streakState,
      decayStatus,
      activeGoal: wishlistGoal?.rewardGoal || null,
      goalProgress: wishlistGoal?.rewardGoal
        ? {
            current: profile?.pointsBalance || 0,
            target: wishlistGoal.rewardGoal.costPoints,
            percentage: Math.min(100, Math.round(((profile?.pointsBalance || 0) / wishlistGoal.rewardGoal.costPoints) * 100)),
            availableMoneyCents: wishlistGoal.availableMoneyCents || 0,
            moneySpentOnThis: wishlistGoal.moneySpentOnThis || 0,
            remainingCents: wishlistGoal.remainingCents || 0,
            progressPercent: wishlistGoal.progressPercent || 0,
          }
        : null,
      character, // Информация о выбранном персонаже
    };
    
    console.log('[ChildrenService] getChildSummary result:', {
      hasWishlistGoal: !!wishlistGoal,
      hasRewardGoal: !!wishlistGoal?.rewardGoal,
      activeGoalTitle: wishlistGoal?.rewardGoal?.title || 'null',
      activeGoalId: wishlistGoal?.rewardGoal?.id || 'null',
      hasGoalProgress: !!result.goalProgress,
      goalProgressData: result.goalProgress,
      allWishlistItemsCount: allWishlistItems.length,
      activeWishlistItemId: activeWishlistItem?.id || 'null',
      activeWishlistItemIsFavorite: activeWishlistItem?.isFavorite,
      activeWishlistItemShowOnDashboard: activeWishlistItem?.showOnDashboard,
      resultActiveGoal: result.activeGoal ? { id: result.activeGoal.id, title: result.activeGoal.title } : 'null',
      resultGoalProgress: result.goalProgress ? { current: result.goalProgress.current, target: result.goalProgress.target } : 'null',
      fullResult: JSON.stringify({
        activeGoal: result.activeGoal ? { id: result.activeGoal.id, title: result.activeGoal.title } : null,
        goalProgress: result.goalProgress,
      }),
    });
    
    return result;
  }

  async findAllParents(familyId: string) {
    const parents = await this.firestore.findMany('users', { familyId, role: 'PARENT' });
    return parents.map(p => ({
      id: p.id,
      email: p.email,
      login: p.login,
      createdAt: p.createdAt,
    }));
  }

  async getChildrenStats(familyId: string, dateString?: string) {
    try {
      console.log('[ChildrenService] getChildrenStats called:', { familyId, dateString });
      const children = await this.findAll(familyId);
      console.log('[ChildrenService] Found children:', children.length);
      const stats = [];

      // Определяем целевую дату (выбранная дата или сегодня)
      let targetDate: Date;
      if (dateString) {
        try {
          targetDate = new Date(dateString + 'T00:00:00');
          if (isNaN(targetDate.getTime())) {
            console.warn('[ChildrenService] Invalid date string, using today:', dateString);
            targetDate = new Date();
          }
        } catch (dateErr) {
          console.warn('[ChildrenService] Error parsing date, using today:', dateErr.message);
          targetDate = new Date();
        }
      } else {
        targetDate = new Date();
      }
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

    for (const child of children) {
      try {
        const childId = child.id;
        const childProfileId = child.childProfile?.id;

        if (!childProfileId) {
          console.warn('[ChildrenService] Child without profile, skipping:', childId);
          continue;
        }

      // Пересчитываем баланс из ledger entries для актуальности
      try {
        console.log('[ChildrenService] Recalculating balance for stats:', { childId, childProfileId });
        await this.ledgerService.updateChildBalance(childId);
        // Обновляем childProfile после пересчета
        const updatedProfile = await this.firestore.findFirst('childProfiles', { id: childProfileId });
        if (updatedProfile) {
          child.childProfile = updatedProfile;
        }
      } catch (error: any) {
        console.error('[ChildrenService] Error recalculating balance in stats:', error.message);
        // Продолжаем с текущим балансом
      }

      // Получаем общее количество заработанных баллов (EARN + BONUS)
      const allEarnedEntries = await this.firestore.findMany('ledgerEntries', { childId });
      const earnedEntries = allEarnedEntries.filter(e => e.type === 'EARN' || e.type === 'BONUS');
      const totalPointsEarned = earnedEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);

      // Рассчитываем баллы за выбранную дату для сытости
      // ВАЖНО: Используем дату выполнения задания (performedAt), а не дату создания ledger entry
      let todayPointsBalance = 0;
      try {
        // Фильтруем записи за выбранную дату по дате выполнения задания
        const targetDateEntries = [];
        for (const entry of allEarnedEntries) {
          // Если это запись для completion, получаем дату выполнения из completion
          if (entry.refType === 'COMPLETION' && entry.refId) {
            try {
              const completion = await this.firestore.findFirst('completions', { id: entry.refId });
              if (completion) {
                // Проверяем, что completion имеет статус APPROVED (только подтвержденные задания считаются)
                if (completion.status !== 'APPROVED') {
                  continue;
                }

                if (completion.performedAt) {
                  const performedAt = completion.performedAt?.toDate 
                    ? completion.performedAt.toDate() 
                    : new Date(completion.performedAt);
                  performedAt.setHours(0, 0, 0, 0);
                  
                  // Проверяем, что выполнение было в выбранную дату
                  if (performedAt.getTime() === targetDate.getTime()) {
                    targetDateEntries.push(entry);
                  }
                } else {
                  // Если нет performedAt, используем createdAt как fallback
                  if (entry.createdAt) {
                    try {
                      const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
                      if (!isNaN(createdAt.getTime()) && createdAt >= targetDate && createdAt < nextDay) {
                        targetDateEntries.push(entry);
                      }
                    } catch (dateErr) {
                      console.warn('[ChildrenService] Invalid createdAt date:', entry.createdAt);
                    }
                  }
                }
              } else {
                // Если не удалось найти completion, используем createdAt как fallback
                if (entry.createdAt) {
                  try {
                    const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
                    if (!isNaN(createdAt.getTime()) && createdAt >= targetDate && createdAt < nextDay) {
                      targetDateEntries.push(entry);
                    }
                  } catch (dateErr) {
                    console.warn('[ChildrenService] Invalid createdAt date:', entry.createdAt);
                  }
                }
              }
            } catch (err: any) {
              // Если не удалось найти completion, используем createdAt как fallback
              if (entry.createdAt) {
                try {
                  const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
                  if (!isNaN(createdAt.getTime()) && createdAt >= targetDate && createdAt < nextDay) {
                    targetDateEntries.push(entry);
                  }
                } catch (dateErr) {
                  console.warn('[ChildrenService] Invalid createdAt date:', entry.createdAt);
                }
              }
            }
          } else {
            // Для других типов записей (BONUS и т.д.) используем createdAt
            if (entry.createdAt) {
              try {
                const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
                if (!isNaN(createdAt.getTime()) && createdAt >= targetDate && createdAt < nextDay) {
                  targetDateEntries.push(entry);
                }
              } catch (dateErr) {
                console.warn('[ChildrenService] Invalid createdAt date:', entry.createdAt);
              }
            }
          }
        }

        todayPointsBalance = targetDateEntries.reduce((sum, entry) => {
          return sum + (entry.amount || 0);
        }, 0);

        console.log('[ChildrenService] Points balance for date:', {
          userId: childId,
          date: dateString || 'today',
          todayPointsBalance,
          entriesCount: targetDateEntries.length,
        });
      } catch (error: any) {
        console.error('[ChildrenService] Error calculating date points balance in stats:', error.message);
        todayPointsBalance = 0;
      }

      // Получаем общее количество потраченных баллов (SPEND)
      const spentEntries = allEarnedEntries.filter(e => e.type === 'SPEND');
      const totalPointsSpent = Math.abs(spentEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0));

      // Получаем общее количество денег из childProfile.moneyBalanceCents (накапливается при каждой конвертации)
      // Или считаем из exchanges если moneyBalanceCents еще не установлен (для обратной совместимости)
      let totalMoneyEarned = child.childProfile?.moneyBalanceCents || 0;
      
      // Если moneyBalanceCents не установлен, рассчитываем из exchanges (для старых данных)
      if (totalMoneyEarned === 0) {
        const allExchanges = await this.firestore.findMany('exchanges', { childId });
        const moneyExchanges = allExchanges.filter(e => 
          e.cashCents != null && (e.status === 'APPROVED' || e.status === 'DELIVERED')
        );
        totalMoneyEarned = moneyExchanges.reduce((sum, exchange) => sum + (exchange.cashCents || 0), 0);
        
        // Обновляем moneyBalanceCents для будущих запросов
        if (totalMoneyEarned > 0 && childProfileId) {
          await this.firestore.update('childProfiles', childProfileId, {
            moneyBalanceCents: totalMoneyEarned,
          }).catch(err => console.warn('[ChildrenService] Failed to update moneyBalanceCents:', err.message));
        }
      }

      // Получаем количество выполненных заданий (APPROVED)
      const completedCompletions = await this.firestore.findMany('completions', { childId: childProfileId, status: 'APPROVED' });
      const completedTasksCount = completedCompletions.length;

      // Получаем максимальный streak из streakState
      let maxStreak = 0;
      if (child.childProfile?.streakState) {
        try {
          const streakState = typeof child.childProfile.streakState === 'string' 
            ? JSON.parse(child.childProfile.streakState) 
            : child.childProfile.streakState;
          for (const ruleId in streakState) {
            const state = streakState[ruleId];
            if (state.currentStreak > maxStreak) {
              maxStreak = state.currentStreak;
            }
          }
        } catch (e) {
          // Invalid JSON, ignore
        }
      }

      stats.push({
        childId,
        childProfileId,
        childName: child.childProfile?.name || child.login,
        totalPointsEarned,
        totalPointsSpent,
        currentBalance: child.childProfile?.pointsBalance || 0,
        todayPointsBalance, // Баллы за сегодня для расчета сытости
        totalMoneyEarned: totalMoneyEarned / 100, // Конвертируем центы в рубли
        totalMoneyEarnedCents: totalMoneyEarned,
        completedTasksCount,
        maxStreak,
      });
      } catch (childError: any) {
        console.error('[ChildrenService] Error processing child stats:', {
          childId: child?.id,
          error: childError.message,
          stack: childError.stack,
        });
        // Продолжаем обработку других детей даже если один вызвал ошибку
      }
    }

    console.log('[ChildrenService] getChildrenStats completed:', { statsCount: stats.length });
    return stats;
    } catch (error: any) {
      console.error('[ChildrenService] Error in getChildrenStats:', {
        familyId,
        dateString,
        error: error.message,
        stack: error.stack,
      });
      // Возвращаем пустой массив при ошибке, чтобы фронтенд не упал
      return [];
    }
  }

  async createParent(familyId: string, dto: CreateParentDto) {
    const existingByEmail = dto.email ? await this.firestore.findFirst('users', { email: dto.email }) : null;
    const existingByLogin = await this.firestore.findFirst('users', { login: dto.login });

    if (existingByEmail || existingByLogin) {
      throw new ConflictException('User with this email or login already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const userId = crypto.randomUUID();

    await this.firestore.create('users', {
      id: userId,
      email: dto.email,
      login: dto.login,
      passwordHash,
      role: 'PARENT',
      familyId,
    }, userId);

    const user = await this.firestore.findFirst('users', { id: userId });
    return {
      id: user.id,
      email: user.email,
      login: user.login,
      createdAt: user.createdAt,
    };
  }

  async delete(id: string, familyId: string) {
    // Проверяем, что пользователь существует и принадлежит семье
    const user = await this.firestore.findFirst('users', { id, familyId, role: 'CHILD' });

    if (!user) {
      throw new NotFoundException('Child not found');
    }

    const userId = user.id;

    // Ищем childProfile (может не существовать, если был создан старым способом)
    const profiles = await this.firestore.findMany('childProfiles', { userId });
    const childProfile = profiles.length > 0 ? profiles[0] : null;
    const childProfileId = childProfile?.id;

    // Удаляем все связанные данные
    // 1. Completions (выполнения заданий) - используем childProfileId если есть
    if (childProfileId) {
      const completions = await this.firestore.findMany('completions', { childId: childProfileId });
      for (const completion of completions) {
        // Удаляем proof файл из Firebase Storage если есть
        if (completion.proofUrl) {
          await this.storageService.deleteFile(completion.proofUrl).catch(err => 
            console.warn(`Failed to delete proof file: ${completion.proofUrl}`, err)
          );
        }
        await this.firestore.delete('completions', completion.id);
      }
    }

    // 2. Exchanges (обмены) - могут использовать childProfileId или userId
    if (childProfileId) {
      const exchanges = await this.firestore.findMany('exchanges', { childId: childProfileId });
      for (const exchange of exchanges) {
        await this.firestore.delete('exchanges', exchange.id);
      }
    }
    // Также проверяем по userId на случай, если exchanges используют userId
    const exchangesByUserId = await this.firestore.findMany('exchanges', { childId: userId });
    for (const exchange of exchangesByUserId) {
      await this.firestore.delete('exchanges', exchange.id);
    }

    // 3. Ledger entries (записи в балансе) - используют userId
    const ledgerEntries = await this.firestore.findMany('ledgerEntries', { childId: userId });
    for (const entry of ledgerEntries) {
      await this.firestore.delete('ledgerEntries', entry.id);
    }

    // 4. Wishlist (список желаний) - используем childProfileId если есть
    if (childProfileId) {
      const wishlistItems = await this.firestore.findMany('wishlist', { childId: childProfileId });
      for (const item of wishlistItems) {
        // Удаляем reward image из Firebase Storage если есть
        if (item.rewardId) {
          const reward = await this.firestore.findFirst('rewards', { id: item.rewardId });
          if (reward?.imageUrl) {
            await this.storageService.deleteFile(reward.imageUrl).catch(err => 
              console.warn(`Failed to delete reward image: ${reward.imageUrl}`, err)
            );
          }
        }
        await this.firestore.delete('wishlist', item.id);
      }
    }

    // 5. Child badges (бейджи ребенка) - используем childProfileId если есть
    if (childProfileId) {
      const childBadges = await this.firestore.findMany('childBadges', { childId: childProfileId });
      for (const badge of childBadges) {
        await this.firestore.delete('childBadges', badge.id);
      }
    }

    // 6. Task assignments (назначения заданий) - используем childProfileId если есть
    if (childProfileId) {
      const taskAssignments = await this.firestore.findMany('taskAssignments', { childId: childProfileId });
      for (const assignment of taskAssignments) {
        await this.firestore.delete('taskAssignments', assignment.id);
      }
    }

    // 7. Child profile - удаляем если существует
    if (childProfileId) {
      // Удаляем avatar файл из Firebase Storage если есть
      if (childProfile?.avatarUrl) {
        await this.storageService.deleteFile(childProfile.avatarUrl).catch(err => 
          console.warn(`Failed to delete avatar file: ${childProfile.avatarUrl}`, err)
        );
      }
      await this.firestore.delete('childProfiles', childProfileId);
    }

    // 8. User (пользователь) - всегда удаляем
    await this.firestore.delete('users', userId);

    return { success: true, message: 'Child deleted successfully' };
  }

  private async hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, 10);
  }
}
