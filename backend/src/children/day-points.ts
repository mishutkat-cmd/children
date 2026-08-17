import { DocStore } from '../db/doc-store.service';

/**
 * "Points earned on a given day" — the number behind both the child's
 * dashboard and the parent's per-child stats.
 *
 * The rule is not simply "ledger entries created that day". A completion can
 * be approved days after it was performed, and the points belong to the day
 * the child did the work:
 *
 *   - EARN/BONUS entry pointing at an APPROVED completion that has a
 *     performedAt  -> counts on the performedAt day
 *   - the completion exists but is not APPROVED  -> never counts
 *   - the completion is missing, or has no performedAt, or the entry is not
 *     tied to a completion at all  -> falls back to the entry's own createdAt
 *
 * `computeFromLoaded` is that rule written out literally, over documents
 * already in memory. It is the reference implementation and the thing the
 * tests pin: `queryForDay` must always agree with it.
 */

export interface DayPointsInput {
  /** ledgerEntries.childId — a users.id */
  userId: string;
  /** completions.childId — a childProfiles.id */
  childProfileId: string;
  /** Local midnight of the day being asked about. */
  targetDate: Date;
}

const toDate = (value: any): Date => (value?.toDate ? value.toDate() : new Date(value));

/** Local midnight of the current day — the boundary both callers use. */
export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

const endOfDay = (targetDate: Date): Date => {
  const next = new Date(targetDate);
  next.setDate(next.getDate() + 1);
  return next;
};

/** Reference implementation: every EARN/BONUS entry, every referenced completion. */
export function computeFromLoaded(
  earnEntries: any[],
  completionsById: Map<string, any>,
  targetDate: Date,
): number {
  const nextDay = endOfDay(targetDate);
  const inWindow = (d: Date) => !isNaN(d.getTime()) && d >= targetDate && d < nextDay;

  let total = 0;
  for (const entry of earnEntries) {
    const amount = entry.amount || 0;

    if (entry.refType === 'COMPLETION' && entry.refId) {
      const completion = completionsById.get(entry.refId);
      if (completion) {
        if (completion.status !== 'APPROVED') continue;
        if (completion.performedAt) {
          if (inWindow(toDate(completion.performedAt))) total += amount;
          continue;
        }
      }
      // Missing completion, or approved without a performedAt: fall through to
      // the entry's own timestamp.
    }

    if (entry.createdAt && inWindow(toDate(entry.createdAt))) total += amount;
  }
  return total;
}

/**
 * Same answer, without loading the child's whole history.
 *
 * The reference version reads every EARN/BONUS entry the child ever earned
 * (329 in production) plus every completion those entries point at, to
 * produce one number for one day. This instead asks only about the day:
 *
 *   A. completions performed that day -> the entries that reference them
 *   B. entries created that day -> the completions those reference, to decide
 *      whether the fallback actually applies
 *
 * The two sets are disjoint by construction: A only contains entries whose
 * completion has a performedAt, and B excludes exactly those.
 */
export async function queryForDay(db: DocStore, input: DayPointsInput): Promise<number> {
  const { userId, childProfileId, targetDate } = input;
  const nextDay = endOfDay(targetDate);
  const window = { gte: targetDate, lt: nextDay };

  const [completionsOnDay, entriesCreatedOnDay] = await Promise.all([
    db.findMany('completions', {
      childId: childProfileId,
      status: 'APPROVED',
      performedAt: window,
    }),
    db.findMany('ledgerEntries', {
      childId: userId,
      type: { in: ['EARN', 'BONUS'] },
      createdAt: window,
    }),
  ]);

  // A — entries crediting work performed on the target day.
  const completionIdsOnDay = completionsOnDay.map((c: any) => c.id);
  const entriesForDayWork = completionIdsOnDay.length
    ? await db.findMany('ledgerEntries', {
        childId: userId,
        type: { in: ['EARN', 'BONUS'] },
        refType: 'COMPLETION',
        refId: { in: completionIdsOnDay },
      })
    : [];

  let total = 0;
  const countedEntryIds = new Set<string>();
  for (const entry of entriesForDayWork) {
    total += entry.amount || 0;
    countedEntryIds.add(entry.id);
  }

  // B — entries created on the target day that fall back to their own
  // timestamp. Only the completions these reference need to be looked at.
  const fallbackRefIds = [
    ...new Set(
      entriesCreatedOnDay
        .filter((e: any) => e.refType === 'COMPLETION' && e.refId)
        .map((e: any) => e.refId as string),
    ),
  ];
  const referenced = fallbackRefIds.length
    ? await db.findMany('completions', { id: { in: fallbackRefIds } })
    : [];
  const referencedById = new Map<string, any>(referenced.map((c: any) => [c.id, c]));

  for (const entry of entriesCreatedOnDay) {
    if (countedEntryIds.has(entry.id)) continue;

    if (entry.refType === 'COMPLETION' && entry.refId) {
      const completion = referencedById.get(entry.refId);
      if (completion) {
        // Not approved: contributes nothing, on any day.
        if (completion.status !== 'APPROVED') continue;
        // Has a performedAt: it belongs to that day, and if that day were the
        // target it would already be in A.
        if (completion.performedAt) continue;
      }
    }

    total += entry.amount || 0;
  }

  return total;
}
