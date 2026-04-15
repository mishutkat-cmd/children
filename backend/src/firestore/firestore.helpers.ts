import * as admin from 'firebase-admin';

/**
 * Helper функции для работы с Firestore
 */

/**
 * Конвертирует Date в Firestore Timestamp
 */
export function dateToTimestamp(date: Date | string | admin.firestore.Timestamp): admin.firestore.Timestamp {
  if (date instanceof admin.firestore.Timestamp) {
    return date;
  }
  if (date instanceof Date) {
    return admin.firestore.Timestamp.fromDate(date);
  }
  if (typeof date === 'string') {
    return admin.firestore.Timestamp.fromDate(new Date(date));
  }
  return admin.firestore.Timestamp.now();
}

/**
 * Конвертирует Firestore Timestamp в Date
 */
export function timestampToDate(timestamp: admin.firestore.Timestamp | Date | string | any): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  if (timestamp instanceof admin.firestore.Timestamp) {
    return timestamp.toDate();
  }
  if (timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (typeof timestamp === 'string') {
    return new Date(timestamp);
  }
  return new Date();
}

/**
 * Обрабатывает данные для сохранения в Firestore
 * Конвертирует Date в Timestamp для специальных полей
 */
export function processDataForFirestore(data: any): any {
  const processed: any = {};
  const dateFields = ['startDate', 'endDate', 'performedAt', 'approvedAt', 'deliveredAt', 'decidedAt', 'earnedAt', 'requestedAt'];
  
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      processed[key] = admin.firestore.Timestamp.fromDate(value);
    } else if (dateFields.includes(key) && value) {
      if (typeof value === 'string') {
        processed[key] = admin.firestore.Timestamp.fromDate(new Date(value));
      } else if (value instanceof admin.firestore.Timestamp) {
        processed[key] = value;
      } else {
        processed[key] = value;
      }
    } else {
      processed[key] = value;
    }
  }
  
  return processed;
}

/**
 * Получить childProfileId из userId или childProfileId
 */
export async function getChildProfileId(
  firestore: any,
  childId: string,
  familyId?: string
): Promise<{ childProfileId: string; userId: string } | null> {
  // Сначала проверяем, является ли childId userId
  const childProfilesByUserId = await firestore.findMany('childProfiles', { userId: childId });
  if (childProfilesByUserId.length > 0) {
    const user = await firestore.findFirst('users', { id: childId, ...(familyId && { familyId }) });
    if (user) {
      return {
        childProfileId: childProfilesByUserId[0].id,
        userId: childId,
      };
    }
  }
  
  // Проверяем, является ли childId childProfileId
  const childProfile = await firestore.findFirst('childProfiles', { id: childId });
  if (childProfile) {
    const user = await firestore.findFirst('users', { id: childProfile.userId, ...(familyId && { familyId }) });
    if (user) {
      return {
        childProfileId: childId,
        userId: childProfile.userId,
      };
    }
  }
  
  return null;
}

/**
 * Фильтровать документы по диапазону дат
 */
export function filterByDateRange<T extends { [key: string]: any }>(
  items: T[],
  dateField: string,
  from?: Date,
  to?: Date
): T[] {
  if (!from && !to) {
    return items;
  }
  
  return items.filter(item => {
    const date = timestampToDate(item[dateField]);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}
