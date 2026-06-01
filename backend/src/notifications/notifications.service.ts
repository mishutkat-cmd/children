import { Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';

@Injectable()
export class NotificationsService {
  constructor(private firestore: FirestoreService) {}

  async findAll(familyId: string) {
    const notifications = await this.firestore.findMany(
      'notifications',
      { familyId },
      { createdAt: 'desc' },
      50, // Ограничиваем последними 50 уведомлениями
    );

    // Enrich every notification in parallel. Was sequential for-of —
    // 50 notifications meant up to ~200 sequential Firestore round-trips
    // per dashboard load. Now: one parallel batch, ~2-3 reads per item
    // running concurrently.
    return Promise.all(
      notifications.map(async (notification) => {
        const [childData, relatedData] = await Promise.all([
          this.loadChildData(notification.childId),
          this.loadRelatedData(notification.refType, notification.refId),
        ]);
        return {
          ...notification,
          // Нормализуем поле read: undefined → false, чтобы фронт стабильно
          // показывал статус и счётчик соответствовал списку.
          read: notification.read === true,
          child: childData,
          related: relatedData,
        };
      }),
    );
  }

  private async loadChildData(childId?: string) {
    if (!childId) return null;
    const childProfile = await this.firestore.findFirst('childProfiles', { id: childId });
    if (!childProfile) return null;
    const user = await this.firestore.findFirst('users', { id: childProfile.userId });
    return { ...childProfile, login: user?.login, email: user?.email };
  }

  private async loadRelatedData(refType?: string, refId?: string) {
    if (!refType || !refId) return null;
    if (refType === 'COMPLETION') {
      const completion = await this.firestore.findFirst('completions', { id: refId });
      if (!completion) return null;
      const task = await this.firestore.findFirst('tasks', { id: completion.taskId });
      return { completion, task };
    }
    if (refType === 'BADGE') {
      const childBadge = await this.firestore.findFirst('childBadges', { id: refId });
      if (!childBadge) return null;
      const badge = await this.firestore.findFirst('badges', { id: childBadge.badgeId });
      return { childBadge, badge };
    }
    if (refType === 'CHALLENGE') {
      const challenge = await this.firestore.findFirst('challenges', { id: refId });
      return { challenge };
    }
    return null;
  }

  async getUnreadCount(familyId: string) {
    // Считаем все уведомления, у которых read !== true (включая legacy без поля).
    const notifications = await this.firestore.findMany('notifications', { familyId });
    const unread = notifications.filter((n: any) => n.read !== true);
    return { count: unread.length };
  }

  async markAsRead(notificationId: string, familyId: string) {
    const notification = await this.firestore.findFirst('notifications', { id: notificationId, familyId });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.firestore.update('notifications', notificationId, { read: true });
    return this.firestore.findFirst('notifications', { id: notificationId });
  }

  async markAllAsRead(familyId: string) {
    // Берём ВСЕ уведомления семьи, включая записи без поля read (legacy),
    // и помечаем как прочитанные те, у которых read !== true.
    const notifications = await this.firestore.findMany('notifications', { familyId });
    const unread = notifications.filter((n: any) => n.read !== true);
    await Promise.all(
      unread.map((n: any) => this.firestore.update('notifications', n.id, { read: true })),
    );
    return { success: true, marked: unread.length };
  }
}
