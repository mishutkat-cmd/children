import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { StreakService } from '../motivation/streak.service';
import { DecayService } from '../motivation/decay.service';
import { LedgerService } from '../ledger/ledger.service';
import { LocalStorageService } from '../files/local-storage.service';
import { CreateChildDto, UpdateChildDto, CreateParentDto } from './dto/children.dto';
import { getCached, setCached } from '../common/cache/family-settings-cache';
import { queryForDay, startOfToday } from './day-points';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ChildrenService {
  constructor(
    private db: DocStore,
    private streakService: StreakService,
    private decayService: DecayService,
    private ledgerService: LedgerService,
    private storageService: LocalStorageService,
  ) {}

  private async getFamilySettingsCached(familyId: string): Promise<any | null> {
    const cached = getCached(familyId);
    if (cached !== undefined) return cached;
    const value = await this.db.findFirst('familySettings', { familyId });
    setCached(familyId, value);
    return value;
  }

  async findAll(familyId: string) {
    const users = await this.db.findMany('users', { familyId, role: 'CHILD' });
    return Promise.all(
      users.map(async (user) => {
        const profiles = await this.db.findMany('childProfiles', { userId: user.id });
        return { ...user, childProfile: profiles[0] ?? null };
      }),
    );
  }

  async findOne(id: string, familyId: string) {
    const user = await this.db.findFirst('users', { id, familyId, role: 'CHILD' });

    if (!user) {
      throw new NotFoundException('Child not found');
    }

    const profiles = await this.db.findMany('childProfiles', { userId: user.id });
    const childProfile = profiles.length > 0 ? profiles[0] : null;

    return {
      ...user,
      childProfile,
    };
  }

  async create(familyId: string, dto: CreateChildDto) {
    const userId = crypto.randomUUID();
    const profileId = crypto.randomUUID();

    await this.db.create('users', {
      id: userId,
      login: dto.login,
      role: 'CHILD',
      familyId,
      passwordHash: dto.pin ? await this.hashPin(dto.pin) : null,
    }, userId);

    await this.db.create('childProfiles', {
      id: profileId,
      userId: userId,
      name: dto.name,
      avatarUrl: dto.avatarUrl || null, // Firestore не принимает undefined
      pointsBalance: 0,
      moneyBalanceCents: 0,
      streakState: {},
      selectedCharacterId: null, // По умолчанию нет выбранного персонажа
    }, profileId);

    const user = await this.db.findFirst('users', { id: userId });
    const profile = await this.db.findFirst('childProfiles', { id: profileId });

    return {
      ...user,
      childProfile: profile,
    };
  }

  async update(id: string, familyId: string, dto: UpdateChildDto) {
    await this.findOne(id, familyId);

    if (dto.pin) {
      await this.db.update('users', id, {
        passwordHash: await this.hashPin(dto.pin),
      });
    }

    if (dto.name || dto.avatarUrl !== undefined || dto.selectedCharacterId !== undefined) {
      const profiles = await this.db.findMany('childProfiles', { userId: id });
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
        await this.db.update('childProfiles', profiles[0].id, updateData);
      }
    }

    return this.findOne(id, familyId);
  }

  async getSummary(childId: string, familyId: string) {
    const child = await this.findOne(childId, familyId);
    const profile = child.childProfile;
    const childProfileId = profile?.id;
    const userId = child.id;

    // pointsBalance is now an authoritative denormalization maintained by
    // every ledgerService.createEntry / deleteLedgerEntry transaction.
    // No O(history) recompute on the read path — profile from findOne above
    // already carries the current balance.
    const [
      todayPointsBalance,
      recentApproved,
      pendingCompletions,
      pendingExchanges,
      streakStateData,
      decayStatus,
      allWishlistItems,
      character,
      familySettings,
    ] = await Promise.all([
      // Asks about today only, instead of reading the child's whole earning
      // history and the completions behind it. See day-points.ts.
      queryForDay(this.db, { userId, childProfileId, targetDate: startOfToday() }),
      this.db.findMany(
        'completions',
        { childId: childProfileId, status: 'APPROVED' },
        { performedAt: 'desc' },
        10,
      ),
      // Counted in SQL — the documents themselves were never used, only
      // `.length` of them.
      this.db.count('completions', { childId: childProfileId, status: 'PENDING' }),
      this.db.count('exchanges', { childId, status: 'PENDING' }),
      this.streakService.getStreakState(childId),
      this.decayService.getDecayStatus(childId, familyId),
      childProfileId
        ? this.db.findMany('wishlist', { childId: childProfileId }, { priority: 'asc' })
        : Promise.resolve([] as any[]),
      profile?.selectedCharacterId
        ? this.db.findFirst('characters', { id: profile.selectedCharacterId, familyId })
        : Promise.resolve(null),
      this.getFamilySettingsCached(familyId),
    ]);

    // Recent approved completions, enriched with their task in one query
    // rather than one per completion.
    const recentTaskIds = [
      ...new Set(recentApproved.map((c: any) => c.taskId).filter(Boolean) as string[]),
    ];
    const recentTasks = recentTaskIds.length
      ? await this.db.findMany('tasks', { id: { in: recentTaskIds } })
      : [];
    const taskById = new Map<string, any>(recentTasks.map((t: any) => [t.id, t]));
    const recentCompletions = recentApproved.map((completion: any) => ({
      ...completion,
      task: taskById.get(completion.taskId) ?? null,
    }));

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
      const reward = await this.db.findFirst('rewards', { id: activeWishlistItem.rewardId });
      if (reward) {
        const conversionRate =
          (typeof familySettings?.conversionRate === 'string'
            ? parseFloat(familySettings.conversionRate)
            : familySettings?.conversionRate) || 10;

        // "Собрано" on the dashboard has two real contributors:
        //   1. live pointsBalance — what the child currently has in
        //      points, converted to cents at the family conversion rate;
        //   2. wishlist.moneySpent on this item — money already physically
        //      paid out for this goal via past exchanges
        //      (ExchangesService.deliverExchange grows this field). That
        //      money is no longer in pointsBalance but DID contribute to
        //      the goal, so it must still count.
        //
        // Cap at rewardCostCents so the progress bar / "Осталось" stay
        // sane when the child is over-funded.
        const pointsBalance = profile?.pointsBalance || 0;
        const accumulatedCents = Math.round((pointsBalance / conversionRate) * 100);
        const alreadyPaidCents = activeWishlistItem.moneySpent || 0;
        const rewardCostCents = Math.round((reward.costPoints / conversionRate) * 100);
        const moneySpentOnThis = Math.min(
          accumulatedCents + alreadyPaidCents,
          rewardCostCents,
        );
        const remainingCents = Math.max(0, rewardCostCents - moneySpentOnThis);
        const progressPercent = rewardCostCents > 0
          ? Math.min(100, Math.round((moneySpentOnThis / rewardCostCents) * 100))
          : 0;

        wishlistGoal = {
          rewardGoal: reward,
          // "Доступно" = what's still in the child's hand (current points,
          // in cents). Not including alreadyPaidCents — that's been spent.
          availableMoneyCents: accumulatedCents,
          moneySpentOnThis,
          remainingCents,
          progressPercent,
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
    const parents = await this.db.findMany('users', { familyId, role: 'PARENT' });
    return parents.map(p => ({
      id: p.id,
      email: p.email,
      login: p.login,
      createdAt: p.createdAt,
    }));
  }

  async getChildrenStats(familyId: string, dateString?: string) {
    try {
      const children = await this.findAll(familyId);

      // Parse target date once (fallback to today on bad input).
      let targetDate = new Date();
      if (dateString) {
        const parsed = new Date(dateString + 'T00:00:00');
        if (!isNaN(parsed.getTime())) targetDate = parsed;
      }
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // Compute every child's stats concurrently. Was sequential for-of;
      // a family with 3 children meant 3x getSummary-level cascades back
      // to back. Now each child's reads also fan out inside the helper.
      const stats = await Promise.all(
        children.map((child) => this.computeChildStats(child, targetDate, nextDay)),
      );
      return stats.filter((s): s is NonNullable<typeof s> => s !== null);
    } catch (error: any) {
      console.error('[ChildrenService] Error in getChildrenStats:', error?.message);
      return [];
    }
  }

  /** Per-child block extracted from getChildrenStats so it can be Promise.all'd. */
  private async computeChildStats(child: any, targetDate: Date, nextDay: Date) {
    const childId = child.id;
    const childProfileId = child.childProfile?.id;
    if (!childProfileId) return null;

    try {
      // pointsBalance on child.childProfile is authoritative now — see
      // LedgerService.createEntry transactional path. No O(history)
      // recompute on the read side.
      //
      // The totals are summed and counted in SQL. Previously this loaded the
      // child's entire ledger (329 rows) and every approved completion (321
      // rows) into memory to produce three numbers. Only the EARN/BONUS rows
      // are actually needed as documents, for the target-date breakdown below.
      const [totalPointsEarned, totalPointsSpent, completedTasksCount, todayPointsBalance] =
        await Promise.all([
          this.db.sum('ledgerEntries', 'amount', { childId, type: { in: ['EARN', 'BONUS'] } }),
          // Absolute: SPEND amounts are inconsistently signed in stored data.
          this.db.sum('ledgerEntries', 'amount', { childId, type: 'SPEND' }, { absolute: true }),
          this.db.count('completions', { childId: childProfileId, status: 'APPROVED' }),
          queryForDay(this.db, { userId: childId, childProfileId, targetDate }),
        ]);

      // Money earned (legacy fallback for old profiles where
      // moneyBalanceCents was never backfilled).
      let totalMoneyEarned = child.childProfile?.moneyBalanceCents || 0;
      if (totalMoneyEarned === 0) {
        const allExchanges = await this.db.findMany('exchanges', { childId });
        totalMoneyEarned = allExchanges
          .filter((e: any) => e.cashCents != null && (e.status === 'APPROVED' || e.status === 'DELIVERED'))
          .reduce((sum: number, e: any) => sum + (e.cashCents || 0), 0);
        if (totalMoneyEarned > 0) {
          this.db
            .update('childProfiles', childProfileId, { moneyBalanceCents: totalMoneyEarned })
            .catch((err: any) =>
              console.warn('[ChildrenService] Failed to update moneyBalanceCents:', err?.message),
            );
        }
      }

      // Max streak from streakState blob.
      let maxStreak = 0;
      const rawStreak = child.childProfile?.streakState;
      if (rawStreak) {
        try {
          const parsed = typeof rawStreak === 'string' ? JSON.parse(rawStreak) : rawStreak;
          for (const ruleId in parsed) {
            const s = parsed[ruleId];
            if (s?.currentStreak > maxStreak) maxStreak = s.currentStreak;
          }
        } catch {
          // Invalid blob — leave maxStreak at 0.
        }
      }

      return {
        childId,
        childProfileId,
        childName: child.childProfile?.name || child.login,
        totalPointsEarned,
        totalPointsSpent,
        currentBalance: child.childProfile?.pointsBalance || 0,
        todayPointsBalance,
        totalMoneyEarned: totalMoneyEarned / 100,
        totalMoneyEarnedCents: totalMoneyEarned,
        completedTasksCount,
        maxStreak,
      };
    } catch (childError: any) {
      console.error('[ChildrenService] Error processing child stats:', {
        childId,
        error: childError?.message,
      });
      return null;
    }
  }

  async createParent(familyId: string, dto: CreateParentDto) {
    const existingByEmail = dto.email ? await this.db.findFirst('users', { email: dto.email }) : null;
    const existingByLogin = await this.db.findFirst('users', { login: dto.login });

    if (existingByEmail || existingByLogin) {
      throw new ConflictException('User with this email or login already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const userId = crypto.randomUUID();

    await this.db.create('users', {
      id: userId,
      email: dto.email,
      login: dto.login,
      passwordHash,
      role: 'PARENT',
      familyId,
    }, userId);

    const user = await this.db.findFirst('users', { id: userId });
    return {
      id: user.id,
      email: user.email,
      login: user.login,
      createdAt: user.createdAt,
    };
  }

  async delete(id: string, familyId: string) {
    // Проверяем, что пользователь существует и принадлежит семье
    const user = await this.db.findFirst('users', { id, familyId, role: 'CHILD' });

    if (!user) {
      throw new NotFoundException('Child not found');
    }

    const userId = user.id;

    // Ищем childProfile (может не существовать, если был создан старым способом)
    const profiles = await this.db.findMany('childProfiles', { userId });
    const childProfile = profiles.length > 0 ? profiles[0] : null;
    const childProfileId = childProfile?.id;

    // Удаляем все связанные данные
    // 1. Completions (выполнения заданий) - используем childProfileId если есть
    if (childProfileId) {
      const completions = await this.db.findMany('completions', { childId: childProfileId });
      for (const completion of completions) {
        // Удаляем proof файл из Firebase Storage если есть
        if (completion.proofUrl) {
          await this.storageService.deleteFile(completion.proofUrl).catch(err => 
            console.warn(`Failed to delete proof file: ${completion.proofUrl}`, err)
          );
        }
        await this.db.delete('completions', completion.id);
      }
    }

    // 2. Exchanges (обмены) - могут использовать childProfileId или userId
    if (childProfileId) {
      const exchanges = await this.db.findMany('exchanges', { childId: childProfileId });
      for (const exchange of exchanges) {
        await this.db.delete('exchanges', exchange.id);
      }
    }
    // Также проверяем по userId на случай, если exchanges используют userId
    const exchangesByUserId = await this.db.findMany('exchanges', { childId: userId });
    for (const exchange of exchangesByUserId) {
      await this.db.delete('exchanges', exchange.id);
    }

    // 3. Ledger entries (записи в балансе) - используют userId
    const ledgerEntries = await this.db.findMany('ledgerEntries', { childId: userId });
    for (const entry of ledgerEntries) {
      await this.db.delete('ledgerEntries', entry.id);
    }

    // 4. Wishlist (список желаний) - используем childProfileId если есть
    if (childProfileId) {
      const wishlistItems = await this.db.findMany('wishlist', { childId: childProfileId });
      for (const item of wishlistItems) {
        // Удаляем reward image из Firebase Storage если есть
        if (item.rewardId) {
          const reward = await this.db.findFirst('rewards', { id: item.rewardId });
          if (reward?.imageUrl) {
            await this.storageService.deleteFile(reward.imageUrl).catch(err => 
              console.warn(`Failed to delete reward image: ${reward.imageUrl}`, err)
            );
          }
        }
        await this.db.delete('wishlist', item.id);
      }
    }

    // 5. Child badges (бейджи ребенка) - используем childProfileId если есть
    if (childProfileId) {
      const childBadges = await this.db.findMany('childBadges', { childId: childProfileId });
      for (const badge of childBadges) {
        await this.db.delete('childBadges', badge.id);
      }
    }

    // 6. Task assignments (назначения заданий) - используем childProfileId если есть
    if (childProfileId) {
      const taskAssignments = await this.db.findMany('taskAssignments', { childId: childProfileId });
      for (const assignment of taskAssignments) {
        await this.db.delete('taskAssignments', assignment.id);
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
      await this.db.delete('childProfiles', childProfileId);
    }

    // 8. User (пользователь) - всегда удаляем
    await this.db.delete('users', userId);

    return { success: true, message: 'Child deleted successfully' };
  }

  private async hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, 10);
  }
}
