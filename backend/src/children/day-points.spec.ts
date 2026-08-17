import { DocStore } from '../db/doc-store.service';
import { computeFromLoaded, queryForDay } from './day-points';

/**
 * The optimized query must agree with the reference implementation on every
 * shape of data production actually contains — including the awkward ones:
 * completions approved days after they were performed, entries whose
 * completion has been deleted, completions with no performedAt, and rejected
 * completions that must never count.
 *
 * The last test is the real guard: randomized histories run through both
 * implementations, which is what would catch a divergence nobody thought to
 * write a case for.
 */
describe('day points', () => {
  const USER = 'user-1';
  const PROFILE = 'profile-1';
  const DAY = new Date('2026-08-16T00:00:00');

  let store: DocStore;

  beforeEach(() => {
    store = new DocStore();
    store.open(':memory:');
  });

  afterEach(() => store.close());

  /** Reference answer, computed the way the pre-optimization code did. */
  const reference = (targetDate = DAY) => {
    const earnEntries = store.findManySync('ledgerEntries', {
      childId: USER,
      type: { in: ['EARN', 'BONUS'] },
    });
    const refIds = [
      ...new Set(
        earnEntries
          .filter((e: any) => e.refType === 'COMPLETION' && e.refId)
          .map((e: any) => e.refId as string),
      ),
    ];
    const completions = refIds.length
      ? store.findManySync('completions', { id: { in: refIds } })
      : [];
    return computeFromLoaded(earnEntries, new Map(completions.map((c: any) => [c.id, c])), targetDate);
  };

  const both = async (targetDate = DAY) => ({
    reference: reference(targetDate),
    optimized: await queryForDay(store, {
      userId: USER,
      childProfileId: PROFILE,
      targetDate,
    }),
  });

  /**
   * createdAt is server-stamped, so a fixture that needs a specific one has to
   * set it after the fact.
   */
  const entry = (id: string, data: Record<string, any>, createdAt: Date) => {
    store.createSync('ledgerEntries', { childId: USER, type: 'EARN', ...data }, id);
    store.raw
      .prepare(`UPDATE ledgerEntries SET doc = json_set(doc, '$.createdAt', ?) WHERE id = ?`)
      .run(createdAt.toISOString(), id);
  };

  const completion = (id: string, data: Record<string, any>) =>
    store.createSync('completions', { childId: PROFILE, status: 'APPROVED', ...data }, id);

  it('counts an entry created on the day with no completion behind it', async () => {
    entry('e1', { amount: 10, refType: 'MANUAL' }, new Date('2026-08-16T09:00:00'));
    expect(await both()).toEqual({ reference: 10, optimized: 10 });
  });

  it('ignores an entry created on another day', async () => {
    entry('e1', { amount: 10, refType: 'MANUAL' }, new Date('2026-08-15T09:00:00'));
    expect(await both()).toEqual({ reference: 0, optimized: 0 });
  });

  it('credits work to the day it was performed, not the day it was approved', async () => {
    completion('c1', { performedAt: new Date('2026-08-16T18:00:00') });
    // Parent approved the next morning, so the ledger entry is dated then.
    entry('e1', { amount: 25, refType: 'COMPLETION', refId: 'c1' }, new Date('2026-08-17T08:00:00'));

    expect(await both(DAY)).toEqual({ reference: 25, optimized: 25 });
    // And it must NOT also count on the approval day.
    expect(await both(new Date('2026-08-17T00:00:00'))).toEqual({ reference: 0, optimized: 0 });
  });

  it('never counts a completion that is not approved', async () => {
    completion('c1', { status: 'REJECTED', performedAt: new Date('2026-08-16T10:00:00') });
    entry('e1', { amount: 25, refType: 'COMPLETION', refId: 'c1' }, new Date('2026-08-16T10:00:00'));
    expect(await both()).toEqual({ reference: 0, optimized: 0 });
  });

  it('falls back to the entry date when the completion was deleted', async () => {
    entry('e1', { amount: 25, refType: 'COMPLETION', refId: 'gone' }, new Date('2026-08-16T10:00:00'));
    expect(await both()).toEqual({ reference: 25, optimized: 25 });
  });

  it('falls back to the entry date when the completion has no performedAt', async () => {
    completion('c1', {});
    entry('e1', { amount: 25, refType: 'COMPLETION', refId: 'c1' }, new Date('2026-08-16T10:00:00'));
    expect(await both()).toEqual({ reference: 25, optimized: 25 });
  });

  it('counts BONUS as well as EARN, and ignores SPEND and PENALTY', async () => {
    entry('e1', { amount: 10, type: 'BONUS', refType: 'MANUAL' }, new Date('2026-08-16T09:00:00'));
    entry('e2', { amount: 30, type: 'SPEND', refType: 'MANUAL' }, new Date('2026-08-16T09:00:00'));
    entry('e3', { amount: 5, type: 'PENALTY', refType: 'MANUAL' }, new Date('2026-08-16T09:00:00'));
    expect(await both()).toEqual({ reference: 10, optimized: 10 });
  });

  it('counts several entries against one day', async () => {
    completion('c1', { performedAt: new Date('2026-08-16T08:00:00') });
    completion('c2', { performedAt: new Date('2026-08-16T20:00:00') });
    entry('e1', { amount: 5, refType: 'COMPLETION', refId: 'c1' }, new Date('2026-08-16T08:00:00'));
    entry('e2', { amount: 7, refType: 'COMPLETION', refId: 'c2' }, new Date('2026-08-18T08:00:00'));
    entry('e3', { amount: 3, refType: 'MANUAL' }, new Date('2026-08-16T23:59:59'));
    expect(await both()).toEqual({ reference: 15, optimized: 15 });
  });

  it('respects day boundaries at local midnight', async () => {
    entry('before', { amount: 1, refType: 'MANUAL' }, new Date('2026-08-15T23:59:59'));
    entry('start', { amount: 2, refType: 'MANUAL' }, new Date('2026-08-16T00:00:00'));
    entry('end', { amount: 4, refType: 'MANUAL' }, new Date('2026-08-16T23:59:59'));
    entry('after', { amount: 8, refType: 'MANUAL' }, new Date('2026-08-17T00:00:00'));
    expect(await both()).toEqual({ reference: 6, optimized: 6 });
  });

  it('agrees with the reference implementation on randomized histories', async () => {
    // Deterministic pseudo-random so a failure is reproducible.
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length) % xs.length];

    const days = ['2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17'];
    for (let i = 0; i < 300; i++) {
      const refType = pick(['COMPLETION', 'COMPLETION', 'COMPLETION', 'MANUAL', 'CHALLENGE']);
      const created = new Date(`${pick(days)}T${String(Math.floor(rand() * 24)).padStart(2, '0')}:30:00`);

      if (refType === 'COMPLETION') {
        const mode = pick(['normal', 'normal', 'no-performed-at', 'not-approved', 'deleted']);
        const cid = `c${i}`;
        if (mode !== 'deleted') {
          completion(cid, {
            status: mode === 'not-approved' ? pick(['PENDING', 'REJECTED']) : 'APPROVED',
            ...(mode === 'no-performed-at'
              ? {}
              : { performedAt: new Date(`${pick(days)}T${String(Math.floor(rand() * 24)).padStart(2, '0')}:15:00`) }),
          });
        }
        entry(`e${i}`, {
          amount: Math.floor(rand() * 40) + 1,
          type: pick(['EARN', 'BONUS']),
          refType: 'COMPLETION',
          refId: cid,
        }, created);
      } else {
        entry(`e${i}`, {
          amount: Math.floor(rand() * 40) + 1,
          type: pick(['EARN', 'BONUS', 'SPEND']),
          refType,
        }, created);
      }
    }

    for (const day of days) {
      const target = new Date(`${day}T00:00:00`);
      const { reference: ref, optimized } = await both(target);
      expect({ day, value: optimized }).toEqual({ day, value: ref });
    }
  });
});
