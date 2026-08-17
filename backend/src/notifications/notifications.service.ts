import { Injectable, NotFoundException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';

@Injectable()
export class NotificationsService {
  constructor(private db: DocStore) {}

  /**
   * The bell list, enriched with the child and the thing each notification
   * refers to.
   *
   * Enrichment used to be per-notification: 50 rows x 2-4 lookups was up to
   * ~200 queries per load. They ran concurrently, which hid the cost behind
   * Firestore's latency, but the work was real. Now every related document is
   * collected up front and fetched with one query per collection — 6 queries
   * regardless of how many notifications come back.
   */
  async findAll(familyId: string) {
    const notifications = await this.db.findMany(
      'notifications',
      { familyId },
      { createdAt: 'desc' },
      50,
    );
    if (notifications.length === 0) return [];

    const idsOf = (predicate: (n: any) => boolean, pick: (n: any) => string | undefined) => [
      ...new Set(notifications.filter(predicate).map(pick).filter(Boolean) as string[]),
    ];

    const childIds = idsOf(() => true, (n) => n.childId);
    const completionIds = idsOf((n) => n.refType === 'COMPLETION', (n) => n.refId);
    const childBadgeIds = idsOf((n) => n.refType === 'BADGE', (n) => n.refId);
    const challengeIds = idsOf((n) => n.refType === 'CHALLENGE', (n) => n.refId);

    const byId = (rows: any[]) => new Map<string, any>(rows.map((r) => [r.id, r]));
    const fetch = (collection: string, ids: string[]) =>
      ids.length ? this.db.findMany(collection, { id: { in: ids } }) : Promise.resolve([]);

    const [profiles, completions, childBadges, challenges] = await Promise.all([
      fetch('childProfiles', childIds),
      fetch('completions', completionIds),
      fetch('childBadges', childBadgeIds),
      fetch('challenges', challengeIds),
    ]);

    const profileById = byId(profiles);
    const completionById = byId(completions);
    const childBadgeById = byId(childBadges);
    const challengeById = byId(challenges);

    // Second hop: the users behind those profiles, the tasks behind those
    // completions, the badges behind those childBadges. Also one query each.
    const [users, tasks, badges] = await Promise.all([
      fetch('users', [...new Set(profiles.map((p: any) => p.userId).filter(Boolean))]),
      fetch('tasks', [...new Set(completions.map((c: any) => c.taskId).filter(Boolean))]),
      fetch('badges', [...new Set(childBadges.map((b: any) => b.badgeId).filter(Boolean))]),
    ]);

    const userById = byId(users);
    const taskById = byId(tasks);
    const badgeById = byId(badges);

    return notifications.map((notification: any) => {
      const profile = notification.childId ? profileById.get(notification.childId) : null;
      const user = profile?.userId ? userById.get(profile.userId) : null;

      let related: any = null;
      if (notification.refType === 'COMPLETION' && notification.refId) {
        const completion = completionById.get(notification.refId);
        if (completion) related = { completion, task: taskById.get(completion.taskId) ?? null };
      } else if (notification.refType === 'BADGE' && notification.refId) {
        const childBadge = childBadgeById.get(notification.refId);
        if (childBadge) related = { childBadge, badge: badgeById.get(childBadge.badgeId) ?? null };
      } else if (notification.refType === 'CHALLENGE' && notification.refId) {
        related = { challenge: challengeById.get(notification.refId) ?? null };
      }

      return {
        ...notification,
        // Normalize `read`: undefined -> false, so the frontend shows a stable
        // status and the badge count matches the list.
        read: notification.read === true,
        child: profile ? { ...profile, login: user?.login, email: user?.email } : null,
        related,
      };
    });
  }

  async getUnreadCount(familyId: string) {
    // Counted in SQL. This used to read every notification the family has ever
    // received (1135 of them in production) to count the ones not marked read.
    // `read: { not: true }` keeps the old semantics: legacy rows written before
    // the field existed still count as unread.
    const count = await this.db.count('notifications', { familyId, read: { not: true } });
    return { count };
  }

  async markAsRead(notificationId: string, familyId: string) {
    const notification = await this.db.findFirst('notifications', { id: notificationId, familyId });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.db.update('notifications', notificationId, { read: true });
    return this.db.findFirst('notifications', { id: notificationId });
  }

  async markAllAsRead(familyId: string) {
    // One statement instead of read-all-then-update-each.
    const marked = await this.db.updateMany(
      'notifications',
      { familyId, read: { not: true } },
      { read: true },
    );
    return { success: true, marked };
  }
}
