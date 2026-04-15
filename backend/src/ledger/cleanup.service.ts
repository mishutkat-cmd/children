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

    // -- 2. taskAssignments — pointing to non-existent tasks --
    const allAssignments = await this.firestore.findMany('taskAssignments', {});
    for (const a of allAssignments) {
      if (a.taskId && !activeTaskIds.has(a.taskId) && !archivedTaskIds.has(a.taskId)) {
        // Only count assignments tied to a task that no longer exists at all
        counts.orphanedTaskAssignments++;
        if (apply) await this.firestore.delete('taskAssignments', a.id);
      } else if (apply && archivedTaskIds.has(a.taskId)) {
        // Also clean up assignments for tasks we are about to archive
        counts.orphanedTaskAssignments++;
        await this.firestore.delete('taskAssignments', a.id);
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
    const familyChildUserIds = new Set(familyChildProfiles.map((p) => p.userId));

    const allWishlistItems = await this.firestore.findMany('wishlist', {});
    for (const w of allWishlistItems) {
      if (!familyChildProfileIds.has(w.childId)) continue;
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
    const allCompletions = await this.firestore.findMany('completions', {});
    for (const c of allCompletions) {
      if (!familyChildProfileIds.has(c.childId)) continue;
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
    for (const e of allLedger) {
      if (!familyChildUserIds.has(e.childId)) continue;
      if (!e.refId) continue; // manual bonus/penalty/decay without refId — keep
      let exists = true;
      if (e.refType === 'COMPLETION') {
        // completion was just deleted in step 5? cross-check the active set after deletion
        const c = await this.firestore.findFirst('completions', { id: e.refId });
        exists = !!c;
      } else if (e.refType === 'EXCHANGE') {
        const ex = await this.firestore.findFirst('exchanges', { id: e.refId });
        exists = !!ex;
      } else if (e.refType === 'CHALLENGE') {
        const ch = await this.firestore.findFirst('challenges', { id: e.refId });
        exists = !!ch;
      }
      if (!exists) {
        counts.orphanedLedgerEntries++;
        if (apply) await this.firestore.delete('ledgerEntries', e.id);
        affectedChildren.add(e.childId);
      }
    }

    // -- 8. Notifications — orphaned refs --
    const allNotifications = await this.firestore.findMany('notifications', { familyId });
    for (const n of allNotifications) {
      if (!n.refId || !n.refType) continue;
      let exists = true;
      if (n.refType === 'COMPLETION') {
        const c = await this.firestore.findFirst('completions', { id: n.refId });
        exists = !!c;
      } else if (n.refType === 'BADGE') {
        const cb = await this.firestore.findFirst('childBadges', { id: n.refId });
        exists = !!cb;
      } else if (n.refType === 'CHALLENGE') {
        const ch = await this.firestore.findFirst('challenges', { id: n.refId });
        exists = !!ch;
      }
      if (!exists) {
        counts.orphanedNotifications++;
        if (apply) await this.firestore.delete('notifications', n.id);
      }
    }

    // -- 9. childBadges — orphaned (badge no longer exists) --
    const familyBadges = await this.firestore.findMany('badges', { familyId });
    const familyBadgeIds = new Set(familyBadges.map((b: any) => b.id));
    const allChildBadges = await this.firestore.findMany('childBadges', {});
    for (const cb of allChildBadges) {
      if (!familyChildProfileIds.has(cb.childId)) continue;
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

  private async collectFamilyChildProfiles(familyId: string) {
    const children = await this.firestore.findMany('users', { familyId, role: 'CHILD' });
    const profiles: Array<{ id: string; userId: string }> = [];
    for (const child of children) {
      const childProfiles = await this.firestore.findMany('childProfiles', { userId: child.id });
      for (const p of childProfiles) {
        profiles.push({ id: p.id, userId: child.id });
      }
    }
    return profiles;
  }
}
