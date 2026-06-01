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
      streakState: {},
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

    // pointsBalance is now an authoritative denormalization maintained by
    // every ledgerService.createEntry / deleteLedgerEntry transaction.
    // No O(history) recompute on the read path — profile from findOne above
    // already carries the current balance.
    const [
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

        // The frontend dashboard wants "how much has the child saved up
        // towards this goal" and "how close are they (%)". The legacy
        // implementation answered both from wishlist.moneySpent — but
        // that field only grows when the parent marks a wishlist item
        // delivered. Until then it's literally 0, so the parent dashboard
        // showed "Собрано 0 ₴ · 0%" no matter how many points the child
        // had actually accumulated.
        //
        // Same calculation as the frontend's favoriteWishProgress (in
        // pages/parent/Home.tsx and pages/child/Dashboard.tsx) — keeping
        // it consistent so both blocks agree.
        const pointsBalance = profile?.pointsBalance || 0;
        const accumulatedCents = Math.round((pointsBalance / conversionRate) * 100);
        const rewardCostCents = Math.round((reward.costPoints / conversionRate) * 100);
        const moneySpentOnThis = Math.min(accumulatedCents, rewardCostCents);
        const remainingCents = Math.max(0, rewardCostCents - moneySpentOnThis);
        const progressPercent = rewardCostCents > 0
          ? Math.min(100, Math.round((moneySpentOnThis / rewardCostCents) * 100))
          : 0;

        wishlistGoal = {
          rewardGoal: reward,
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
      const [allEntries, completedCompletions] = await Promise.all([
        this.firestore.findMany('ledgerEntries', { childId }),
        this.firestore.findMany('completions', { childId: childProfileId, status: 'APPROVED' }),
      ]);

      // Aggregate earned/spent in one pass.
      let totalPointsEarned = 0;
      let totalPointsSpent = 0;
      const earnedEntries: any[] = [];
      for (const e of allEntries) {
        const amt = e.amount || 0;
        if (e.type === 'EARN' || e.type === 'BONUS') {
          totalPointsEarned += amt;
          earnedEntries.push(e);
        } else if (e.type === 'SPEND') {
          totalPointsSpent += Math.abs(amt);
        }
      }

      // Target-date balance: batch-fetch the referenced completions
      // instead of one findFirst per entry.
      const refIds = Array.from(
        new Set(
          earnedEntries
            .filter((e: any) => e.refType === 'COMPLETION' && e.refId)
            .map((e: any) => e.refId as string),
        ),
      );
      const refCompletions = refIds.length
        ? await this.firestore.findMany('completions', { id: { in: refIds } })
        : [];
      const completionsById = new Map<string, any>(refCompletions.map((c: any) => [c.id, c]));

      const toDate = (v: any): Date => (v?.toDate ? v.toDate() : new Date(v));
      const inWindow = (d: Date) => d >= targetDate && d < nextDay;
      const dayMatch = (d: Date) => {
        const m = new Date(d);
        m.setHours(0, 0, 0, 0);
        return m.getTime() === targetDate.getTime();
      };

      let todayPointsBalance = 0;
      for (const entry of earnedEntries) {
        const amt = entry.amount || 0;
        if (entry.refType === 'COMPLETION' && entry.refId) {
          const completion = completionsById.get(entry.refId);
          if (completion) {
            if (completion.status !== 'APPROVED') continue;
            if (completion.performedAt) {
              if (dayMatch(toDate(completion.performedAt))) todayPointsBalance += amt;
              continue;
            }
          }
          // Missing completion or no performedAt → fall back to createdAt window.
        }
        if (entry.createdAt) {
          const created = toDate(entry.createdAt);
          if (!isNaN(created.getTime()) && inWindow(created)) todayPointsBalance += amt;
        }
      }

      // Money earned (legacy fallback for old profiles where
      // moneyBalanceCents was never backfilled).
      let totalMoneyEarned = child.childProfile?.moneyBalanceCents || 0;
      if (totalMoneyEarned === 0) {
        const allExchanges = await this.firestore.findMany('exchanges', { childId });
        totalMoneyEarned = allExchanges
          .filter((e: any) => e.cashCents != null && (e.status === 'APPROVED' || e.status === 'DELIVERED'))
          .reduce((sum: number, e: any) => sum + (e.cashCents || 0), 0);
        if (totalMoneyEarned > 0) {
          this.firestore
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
        completedTasksCount: completedCompletions.length,
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
