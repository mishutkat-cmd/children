import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { StreakService } from '../motivation/streak.service';
import { DecayService } from '../motivation/decay.service';
import { LedgerService } from '../ledger/ledger.service';
import { StorageService } from '../firebase/storage.service';
import { CreateChildDto, UpdateChildDto, CreateParentDto } from './dto/children.dto';
import { getCached, setCached } from '../common/cache/family-settings-cache';
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

  private async getFamilySettingsCached(familyId: string): Promise<any | null> {
    const cached = getCached(familyId);
    if (cached !== undefined) return cached;
    const value = await this.firestore.findFirst('familySettings', { familyId });
    setCached(familyId, value);
    return value;
  }

  async findAll(familyId: string) {
    const users = await this.firestore.findMany('users', { familyId, role: 'CHILD' });
    return Promise.all(
      users.map(async (user) => {
        const profiles = await this.firestore.findMany('childProfiles', { userId: user.id });
        return { ...user, childProfile: profiles[0] ?? null };
      }),
    );
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
    const userId = child.id;

    // updateChildBalance reads every ledger entry for this child and writes
    // pointsBalance back to the profile. It's expensive but the previous
    // implementation awaited it sequentially, then re-read the profile, then
    // ran today-balance which read all ledger entries AGAIN. We now:
    //   (a) fire every independent read in parallel,
    //   (b) chain "balance recompute" with "profile re-read" inside Promise.all
    //       so the rest of the dashboard data isn't blocked on it.
    const balanceRefreshChain = this.ledgerService
      .updateChildBalance(userId)
      .then(() => this.firestore.findFirst('childProfiles', { id: childProfileId }))
      .catch((err: any) => {
        console.error('[ChildrenService] Error recalculating balance:', err?.message);
        return null;
      });

    const [
      refreshedProfile,
      allLedgerEntries,
      recentApproved,
      pendingCompletionsList,
      pendingExchangesList,
      streakStateData,
      decayStatus,
      allWishlistItems,
      character,
      familySettings,
    ] = await Promise.all([
      balanceRefreshChain,
      this.firestore.findMany('ledgerEntries', { childId: userId }),
      this.firestore.findMany(
        'completions',
        { childId: childProfileId, status: 'APPROVED' },
        { performedAt: 'desc' },
        10,
      ),
      this.firestore.findMany('completions', { childId: childProfileId, status: 'PENDING' }),
      this.firestore.findMany('exchanges', { childId, status: 'PENDING' }),
      this.streakService.getStreakState(childId),
      this.decayService.getDecayStatus(childId, familyId),
      childProfileId
        ? this.firestore.findMany('wishlist', { childId: childProfileId }, { priority: 'asc' })
        : Promise.resolve([] as any[]),
      profile?.selectedCharacterId
        ? this.firestore.findFirst('characters', { id: profile.selectedCharacterId, familyId })
        : Promise.resolve(null),
      this.getFamilySettingsCached(familyId),
    ]);

    if (refreshedProfile) Object.assign(profile, refreshedProfile);

    // Today balance: batch-fetch the completions referenced by EARN/BONUS
    // entries in ONE `id: in` query instead of N findFirst calls.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const earnEntries = allLedgerEntries.filter(
      (e: any) => e.type === 'EARN' || e.type === 'BONUS',
    );
    const refIdsForCompletion = Array.from(
      new Set(
        earnEntries
          .filter((e: any) => e.refType === 'COMPLETION' && e.refId)
          .map((e: any) => e.refId as string),
      ),
    );
    const refIdCompletions = refIdsForCompletion.length
      ? await this.firestore.findMany('completions', { id: { in: refIdsForCompletion } })
      : [];
    const completionsById = new Map<string, any>(refIdCompletions.map((c: any) => [c.id, c]));

    const toDate = (v: any): Date =>
      v?.toDate ? v.toDate() : new Date(v);
    const isToday = (d: Date) => {
      const m = new Date(d);
      m.setHours(0, 0, 0, 0);
      return m.getTime() === today.getTime();
    };

    const todayPointsBalance = earnEntries.reduce((sum: number, entry: any) => {
      if (entry.refType === 'COMPLETION' && entry.refId) {
        const completion = completionsById.get(entry.refId);
        if (!completion) {
          // missing completion → fall back to ledger createdAt window
          const created = toDate(entry.createdAt);
          return created >= today && created < tomorrow ? sum + (entry.amount || 0) : sum;
        }
        if (completion.status !== 'APPROVED') return sum;
        if (!completion.performedAt) {
          const created = toDate(entry.createdAt);
          return created >= today && created < tomorrow ? sum + (entry.amount || 0) : sum;
        }
        return isToday(toDate(completion.performedAt)) ? sum + (entry.amount || 0) : sum;
      }
      const created = toDate(entry.createdAt);
      return created >= today && created < tomorrow ? sum + (entry.amount || 0) : sum;
    }, 0);

    // Recent approved completions — enrich with task in parallel.
    const recentCompletions = await Promise.all(
      recentApproved.map(async (completion: any) => ({
        ...completion,
        task: await this.firestore.findFirst('tasks', { id: completion.taskId }),
      })),
    );

    const pendingCompletions = pendingCompletionsList.length;
    const pendingExchanges = pendingExchangesList.length;

    // Streak state shape compatibility.
    const streakState =
      streakStateData?.streaks && streakStateData.streaks.length > 0
        ? streakStateData.streaks
        : { currentStreak: streakStateData?.currentStreak || 0 };

    // Pick active wishlist item: isFavorite > showOnDashboard > first available.
    const isTruthy = (v: any) => v === true || v === 'true' || v === 1 || v === '1';
    const available = (item: any) => !item.isPurchased && item.status !== 'COMPLETED';
    const activeWishlistItem =
      allWishlistItems.find((i: any) => isTruthy(i.isFavorite) && available(i)) ||
      allWishlistItems.find((i: any) => isTruthy(i.showOnDashboard) && available(i)) ||
      allWishlistItems.find(available) ||
      null;

    let wishlistGoal: any = null;
    if (activeWishlistItem) {
      const reward = await this.firestore.findFirst('rewards', { id: activeWishlistItem.rewardId });
      if (reward) {
        const conversionRate =
          (typeof familySettings?.conversionRate === 'string'
            ? parseFloat(familySettings.conversionRate)
            : familySettings?.conversionRate) || 10;

        const totalMoneyEarnedCents = profile?.moneyBalanceCents || 0;
        const totalSpentOnPrevious = allWishlistItems
          .filter((i: any) => i.priority < activeWishlistItem.priority && i.moneySpent)
          .reduce((s: number, i: any) => s + (i.moneySpent || 0), 0);
        const availableMoneyCents = Math.max(0, totalMoneyEarnedCents - totalSpentOnPrevious);

        const rewardCostCents = Math.round((reward.costPoints / conversionRate) * 100);
        const moneySpentOnThis = activeWishlistItem.moneySpent || 0;
        const remainingCents = Math.max(0, rewardCostCents - moneySpentOnThis);

        wishlistGoal = {
          rewardGoal: reward,
          availableMoneyCents,
          moneySpentOnThis,
          remainingCents,
          progressPercent: Math.min(100, Math.round((moneySpentOnThis / rewardCostCents) * 100)),
        };
      }
    }

    return {
      profile,
      pointsBalance: profile?.pointsBalance || 0,
      todayPointsBalance,
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
            percentage: Math.min(
              100,
              Math.round(((profile?.pointsBalance || 0) / wishlistGoal.rewardGoal.costPoints) * 100),
            ),
            availableMoneyCents: wishlistGoal.availableMoneyCents || 0,
            moneySpentOnThis: wishlistGoal.moneySpentOnThis || 0,
            remainingCents: wishlistGoal.remainingCents || 0,
            progressPercent: wishlistGoal.progressPercent || 0,
          }
        : null,
      character,
    };
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
