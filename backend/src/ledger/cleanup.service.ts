import { Injectable, Logger } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { LedgerService } from './ledger.service';

export interface CleanupCounts {
  archivedTasks: number;
  archivedRewards: number;
  orphanedTaskAssignments: number;
  orphanedCompletions: number;
  orphanedWishlistItems: number;
  orphanedExchanges: number;
  orphanedLedgerEntries: number;
  orphanedNotifications: number;
  orphanedChildBadges: number;
}

export interface CleanupResult extends CleanupCounts {
  affectedChildren: string[];
}

const ZERO_COUNTS: CleanupCounts = {
  archivedTasks: 0,
  archivedRewards: 0,
  orphanedTaskAssignments: 0,
  orphanedCompletions: 0,
  orphanedWishlistItems: 0,
  orphanedExchanges: 0,
  orphanedLedgerEntries: 0,
  orphanedNotifications: 0,
  orphanedChildBadges: 0,
};

/**
 * Удаляет «невидимые» данные из БД:
 *   - задачи в статусе ARCHIVED
 *   - награды в статусе ARCHIVED
 *   - сироты: completions/taskAssignments/ledgerEntries/notifications,
 *     ссылающиеся на уже несуществующие задачи/награды/бейджи.
 *   - wishlist items, ссылающиеся на отсутствующие награды
 *   - childBadges, ссылающиеся на удалённые бейджи
 *
 * Поддерживает dry-run (preview) — когда apply=false, ничего не удаляется,
 * только подсчитывается, что было бы удалено.
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private firestore: FirestoreService,
    private ledgerService: LedgerService,
  ) {}

  async preview(familyId: string): Promise<CleanupResult> {
    return this.run(familyId, false);
  }

  async cleanup(familyId: string): Promise<CleanupResult> {
    return this.run(familyId, true);
  }

  private async run(familyId: string, apply: boolean): Promise<CleanupResult> {
    const counts: CleanupCounts = { ...ZERO_COUNTS };
    const affectedChildren = new Set<string>();

    // -- 1. Archived tasks --
    const tasks = await this.firestore.findMany('tasks', { familyId });
    const archivedTaskIds = new Set<string>();
    const activeTaskIds = new Set<string>();
    for (const t of tasks) {
      if (t.status === 'ARCHIVED') {
        archivedTaskIds.add(t.id);
        counts.archivedTasks++;
      } else {
        activeTaskIds.add(t.id);
      }
    }
    if (apply) {
      for (const id of archivedTaskIds) {
        await this.firestore.delete('tasks', id);
      }
    }

    // -- 2. taskAssignments — only those pointing to THIS family's tasks --
    // Previously findMany('taskAssignments', {}) scanned globally and then
    // anything whose taskId wasn't in OUR active/archived sets was deleted
    // as "orphan" — which silently dropped other families' assignments.
    // Now we only fetch assignments tied to this family's task ids.
    const familyTaskIds = [...activeTaskIds, ...archivedTaskIds];
    const familyAssignments = familyTaskIds.length
      ? await this.firestore.findMany('taskAssignments', { taskId: { in: familyTaskIds } })
      : [];
    for (const a of familyAssignments) {
      if (archivedTaskIds.has(a.taskId)) {
        counts.orphanedTaskAssignments++;
        if (apply) await this.firestore.delete('taskAssignments', a.id);
      }
    }

    // -- 3. Archived rewards --
    const rewards = await this.firestore.findMany('rewards', { familyId });
    const archivedRewardIds = new Set<string>();
    const activeRewardIds = new Set<string>();
    for (const r of rewards) {
      if (r.status === 'ARCHIVED') {
        archivedRewardIds.add(r.id);
        counts.archivedRewards++;
      } else {
        activeRewardIds.add(r.id);
      }
    }
    if (apply) {
      for (const id of archivedRewardIds) {
        await this.firestore.delete('rewards', id);
      }
    }

    // -- 4. Wishlist items — orphaned (reward archived/deleted) --
    // wishlist.childId = childProfileId — фильтруем по семье через childProfiles
    const familyChildProfiles = await this.collectFamilyChildProfiles(familyId);
    const familyChildProfileIds = new Set(familyChildProfiles.map((p) => p.id));
    const familyChildProfileIdsArr = Array.from(familyChildProfileIds);
    const familyChildUserIds = new Set(familyChildProfiles.map((p) => p.userId));

    const familyWishlistItems = familyChildProfileIdsArr.length
      ? await this.firestore.findMany('wishlist', { childId: { in: familyChildProfileIdsArr } })
      : [];
    for (const w of familyWishlistItems) {
      const rewardExists = activeRewardIds.has(w.rewardId);
      const rewardArchived = archivedRewardIds.has(w.rewardId);
      if (!rewardExists) {
        // Reward was archived (and we're deleting it) or never existed
        counts.orphanedWishlistItems++;
        if (apply) await this.firestore.delete('wishlist', w.id);
        if (rewardArchived) {
          // affected child for visibility
          const profile = familyChildProfiles.find((p) => p.id === w.childId);
          if (profile?.userId) affectedChildren.add(profile.userId);
        }
      }
    }

    // -- 5. Completions — orphaned (taskId points to deleted/archived task) --
    const familyCompletions = familyChildProfileIdsArr.length
      ? await this.firestore.findMany('completions', { childId: { in: familyChildProfileIdsArr } })
      : [];
    for (const c of familyCompletions) {
      const taskGone = !activeTaskIds.has(c.taskId);
      if (taskGone) {
        counts.orphanedCompletions++;
        if (apply) await this.firestore.delete('completions', c.id);
        const profile = familyChildProfiles.find((p) => p.id === c.childId);
        if (profile?.userId) affectedChildren.add(profile.userId);
      }
    }

    // -- 6. Exchanges — orphaned (rewardId archived/deleted), keep cash exchanges --
    const allExchanges = await this.firestore.findMany('exchanges', { familyId });
    for (const ex of allExchanges) {
      if (!ex.rewardId) continue; // cash exchange — keep
      if (!activeRewardIds.has(ex.rewardId)) {
        counts.orphanedExchanges++;
        if (apply) await this.firestore.delete('exchanges', ex.id);
      }
    }

    // -- 7. Ledger entries — orphaned (refType=COMPLETION/EXCHANGE/CHALLENGE pointing to gone refs) --
    // Soft-orphan rule: if refId is set and the referenced doc no longer exists,
    // we drop the ledger entry to keep balances consistent with reality.
    const allLedger = await this.firestore.findMany('ledgerEntries', { familyId });
    const ledgerCandidates = allLedger.filter(
      (e: any) => familyChildUserIds.has(e.childId) && e.refId,
    );
    // Batch-fetch all referenced docs once per refType instead of N findFirst.
    const existingByRefType = await this.lookupRefsByType(ledgerCandidates);
    for (const e of ledgerCandidates) {
      const set = existingByRefType.get(e.refType);
      const exists = set ? set.has(e.refId) : true; // unknown refType → keep
      if (!exists) {
        counts.orphanedLedgerEntries++;
        if (apply) await this.firestore.delete('ledgerEntries', e.id);
        affectedChildren.add(e.childId);
      }
    }

    // -- 8. Notifications — orphaned refs --
    const allNotifications = await this.firestore.findMany('notifications', { familyId });
    const notifCandidates = allNotifications.filter((n: any) => n.refId && n.refType);
    const existingByRefTypeN = await this.lookupRefsByType(notifCandidates);
    for (const n of notifCandidates) {
      const set = existingByRefTypeN.get(n.refType);
      const exists = set ? set.has(n.refId) : true;
      if (!exists) {
        counts.orphanedNotifications++;
        if (apply) await this.firestore.delete('notifications', n.id);
      }
    }

    // -- 9. childBadges — orphaned (badge no longer exists) --
    const familyBadges = await this.firestore.findMany('badges', { familyId });
    const familyBadgeIds = new Set(familyBadges.map((b: any) => b.id));
    const familyChildBadges = familyChildProfileIdsArr.length
      ? await this.firestore.findMany('childBadges', { childId: { in: familyChildProfileIdsArr } })
      : [];
    for (const cb of familyChildBadges) {
      if (!familyBadgeIds.has(cb.badgeId)) {
        counts.orphanedChildBadges++;
        if (apply) await this.firestore.delete('childBadges', cb.id);
        const profile = familyChildProfiles.find((p) => p.id === cb.childId);
        if (profile?.userId) affectedChildren.add(profile.userId);
      }
    }

    // -- 10. Recalculate balances for affected children --
    if (apply) {
      for (const userId of affectedChildren) {
        try {
          await this.ledgerService.updateChildBalance(userId);
        } catch (err: any) {
          this.logger.warn(`[CleanupService] Could not recompute balance for ${userId}: ${err?.message}`);
        }
      }
    }

    return { ...counts, affectedChildren: Array.from(affectedChildren) };
  }

  // Map refType -> collection name. Keep in sync with refType values used
  // by ledgerEntries and notifications.
  private static readonly REF_TYPE_TO_COLLECTION: Record<string, string> = {
    COMPLETION: 'completions',
    EXCHANGE: 'exchanges',
    CHALLENGE: 'challenges',
    BADGE: 'childBadges',
  };

  /**
   * For a batch of records that each carry { refType, refId }, return one
   * Set<refId> per refType containing only the IDs that actually exist in
   * the corresponding collection. Replaces per-record findFirst loops.
   */
  private async lookupRefsByType(records: Array<{ refType?: string; refId?: string }>) {
    const byType = new Map<string, Set<string>>();
    for (const r of records) {
      if (!r.refType || !r.refId) continue;
      if (!byType.has(r.refType)) byType.set(r.refType, new Set());
      byType.get(r.refType)!.add(r.refId);
    }
    const existingByType = new Map<string, Set<string>>();
    await Promise.all(
      Array.from(byType.entries()).map(async ([refType, ids]) => {
        const collection = CleanupService.REF_TYPE_TO_COLLECTION[refType];
        if (!collection || ids.size === 0) return;
        const docs = await this.firestore.findMany(collection, { id: { in: Array.from(ids) } });
        existingByType.set(refType, new Set(docs.map((d: any) => d.id)));
      }),
    );
    return existingByType;
  }

  private async collectFamilyChildProfiles(familyId: string) {
    const children = await this.firestore.findMany('users', { familyId, role: 'CHILD' });
    const childIds = children.map((c: any) => c.id);
    if (childIds.length === 0) return [];
    // One batched fetch via `in` chunks instead of N sequential findMany calls.
    const allProfiles = await this.firestore.findMany('childProfiles', {
      userId: { in: childIds },
    });
    return allProfiles.map((p: any) => ({ id: p.id, userId: p.userId }));
  }
}
