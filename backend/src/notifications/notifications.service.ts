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

    // Обогащаем данными о ребенке и связанных объектах
    const result = [];
    for (const notification of notifications) {
      let childData = null;
      if (notification.childId) {
        const childProfile = await this.firestore.findFirst('childProfiles', { id: notification.childId });
        if (childProfile) {
          const user = await this.firestore.findFirst('users', { id: childProfile.userId });
          childData = {
            ...childProfile,
            login: user?.login,
            email: user?.email,
          };
        }
      }

      // Добавляем информацию о связанном объекте
      let relatedData = null;
      if (notification.refType === 'COMPLETION' && notification.refId) {
        const completion = await this.firestore.findFirst('completions', { id: notification.refId });
        if (completion) {
          const task = await this.firestore.findFirst('tasks', { id: completion.taskId });
          relatedData = { completion, task };
        }
      } else if (notification.refType === 'BADGE' && notification.refId) {
        const childBadge = await this.firestore.findFirst('childBadges', { id: notification.refId });
        if (childBadge) {
          const badge = await this.firestore.findFirst('badges', { id: childBadge.badgeId });
          relatedData = { childBadge, badge };
        }
      } else if (notification.refType === 'CHALLENGE' && notification.refId) {
        const challenge = await this.firestore.findFirst('challenges', { id: notification.refId });
        relatedData = { challenge };
      }

      result.push({
        ...notification,
        // Нормализуем поле read: undefined → false, чтобы фронт стабильно
        // показывал статус и счётчик соответствовал списку.
        read: notification.read === true,
        child: childData,
        related: relatedData,
      });
    }

    return result;
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
    let marked = 0;
    for (const notification of notifications) {
      if (notification.read !== true) {
        await this.firestore.update('notifications', notification.id, { read: true });
        marked++;
      }
    }

    return { success: true, marked };
  }
}
