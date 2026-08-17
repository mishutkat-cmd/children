import type { DocStore } from './doc-store.service';

/**
 * Helpers that outlived the Firestore layer. The dropped ones
 * (`dateToTimestamp`, `processDataForFirestore`, `filterByDateRange`) existed
 * only to convert to and from Firestore Timestamps and had no callers.
 */

/**
 * Normalize whatever a date field holds into a Date.
 *
 * DocStore already revives known date fields, so this is mostly a guard for
 * values that arrive from outside it — request payloads, and rows written
 * before the migration.
 */
export function timestampToDate(value: Date | string | any): Date {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') return new Date(value);
  if (value && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6));
  }
  return new Date();
}

/**
 * Resolve an ambiguous child identifier.
 *
 * Callers hand over either a `users.id` or a `childProfiles.id` — the two have
 * been used interchangeably across the API for long enough that both forms
 * exist in stored data. Returns both ids, or null when the child is not in the
 * given family.
 */
export async function getChildProfileId(
  db: DocStore,
  childId: string,
  familyId?: string,
): Promise<{ childProfileId: string; userId: string } | null> {
  // Treat it as a userId first.
  const byUserId = await db.findMany('childProfiles', { userId: childId });
  if (byUserId.length > 0) {
    const user = await db.findFirst('users', { id: childId, ...(familyId && { familyId }) });
    if (user) {
      return { childProfileId: byUserId[0].id, userId: childId };
    }
  }

  // Otherwise as a childProfileId.
  const profile = await db.findFirst('childProfiles', { id: childId });
  if (profile) {
    const user = await db.findFirst('users', {
      id: profile.userId,
      ...(familyId && { familyId }),
    });
    if (user) {
      return { childProfileId: childId, userId: profile.userId };
    }
  }

  return null;
}
