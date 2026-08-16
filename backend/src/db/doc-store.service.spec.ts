import { DocStore } from './doc-store.service';

/**
 * These lock in the semantics the twenty services were written against while
 * they ran on Firestore. Anything that differs here is a behaviour change in
 * production, so the cases mirror the actual query shapes found in the
 * services rather than generic CRUD coverage.
 */
describe('DocStore', () => {
  let store: DocStore;

  beforeEach(() => {
    store = new DocStore();
    store.open(':memory:');
  });

  afterEach(() => store.close());

  describe('round-tripping', () => {
    it('assigns an id, echoes it back, and server-stamps the timestamps', () => {
      const id = store.createSync('tasks', { familyId: 'f1', title: 'Duolingo', points: 5 });
      const task = store.getSync('tasks', id);

      expect(task.id).toBe(id);
      expect(task.title).toBe('Duolingo');
      expect(task.createdAt).toBeInstanceOf(Date);
      expect(task.updatedAt).toBeInstanceOf(Date);
    });

    it('honours an explicit document id', () => {
      store.createSync('users', { login: 'kid', role: 'CHILD' }, 'user-1');
      expect(store.getSync('users', 'user-1').login).toBe('kid');
    });

    it('ignores a caller-supplied createdAt — timestamps are server-assigned', () => {
      const id = store.createSync('tasks', { title: 't', createdAt: new Date('1999-01-01') });
      expect(store.getSync('tasks', id).createdAt.getFullYear()).toBeGreaterThan(2000);
    });

    it('revives date fields as Date and leaves other strings alone', () => {
      const performed = new Date('2026-03-01T10:00:00.000Z');
      const id = store.createSync('completions', { performedAt: performed, note: '2026-03-01' });
      const doc = store.getSync('completions', id);

      expect(doc.performedAt).toBeInstanceOf(Date);
      expect(doc.performedAt.toISOString()).toBe(performed.toISOString());
      expect(doc.note).toBe('2026-03-01');
    });

    it('accepts an ISO string for a date field and still reads back a Date', () => {
      const id = store.createSync('completions', { performedAt: '2026-03-01T10:00:00.000Z' });
      expect(store.getSync('completions', id).performedAt).toBeInstanceOf(Date);
    });

    it('preserves nested objects and arrays verbatim', () => {
      const id = store.createSync('ledgerEntries', {
        metaJson: { taskTitle: 'Duolingo', basePoints: 5, requiresApproval: true },
      });
      expect(store.getSync('ledgerEntries', id).metaJson).toEqual({
        taskTitle: 'Duolingo',
        basePoints: 5,
        requiresApproval: true,
      });
    });

    it('drops undefined fields, as Firestore did', () => {
      const id = store.createSync('ledgerEntries', { amount: 5, multiplier: undefined });
      expect('multiplier' in store.getSync('ledgerEntries', id)).toBe(false);
    });
  });

  describe('findMany / findFirst', () => {
    beforeEach(() => {
      store.createSync('tasks', { familyId: 'f1', status: 'ACTIVE', title: 'a', points: 5 }, 't1');
      store.createSync('tasks', { familyId: 'f1', status: 'ARCHIVED', title: 'b', points: 3 }, 't2');
      store.createSync('tasks', { familyId: 'f2', status: 'ACTIVE', title: 'c', points: 9 }, 't3');
    });

    it('applies every condition, not just the first', () => {
      const rows = store.findManySync('tasks', { familyId: 'f1', status: 'ACTIVE' });
      expect(rows.map((r) => r.id)).toEqual(['t1']);
    });

    it('matches on the id column', () => {
      expect(store.findFirstSync('tasks', { id: 't2' }).title).toBe('b');
    });

    it('scopes by id and familyId together — the ownership check pattern', () => {
      expect(store.findFirstSync('tasks', { id: 't3', familyId: 'f1' })).toBeNull();
    });

    it('supports `in` with no 10-element ceiling', () => {
      const ids = Array.from({ length: 25 }, (_, i) => `bulk-${i}`);
      for (const id of ids) store.createSync('completions', { childId: 'c1' }, id);

      const rows = store.findManySync('completions', { id: { in: ids } });
      expect(rows).toHaveLength(25);
    });

    it('matches nothing for an empty `in` rather than returning the collection', () => {
      expect(store.findManySync('tasks', { id: { in: [] } })).toHaveLength(0);
    });

    it('filters date ranges with gte/lte', () => {
      store.createSync('completions', { childId: 'c1', performedAt: new Date('2026-03-01T12:00:00Z') }, 'old');
      store.createSync('completions', { childId: 'c1', performedAt: new Date('2026-03-05T12:00:00Z') }, 'mid');
      store.createSync('completions', { childId: 'c1', performedAt: new Date('2026-03-09T12:00:00Z') }, 'new');

      const rows = store.findManySync('completions', {
        childId: 'c1',
        performedAt: { gte: new Date('2026-03-04T00:00:00Z'), lte: new Date('2026-03-06T00:00:00Z') },
      });
      expect(rows.map((r) => r.id)).toEqual(['mid']);
    });

    it('excludes documents missing the range field', () => {
      store.createSync('completions', { childId: 'c9' }, 'no-date');
      const rows = store.findManySync('completions', {
        childId: 'c9',
        performedAt: { gte: new Date('2000-01-01') },
      });
      expect(rows).toHaveLength(0);
    });

    it('sorts and limits', () => {
      const rows = store.findManySync('tasks', { familyId: 'f1' }, { points: 'desc' }, 1);
      expect(rows.map((r) => r.id)).toEqual(['t1']);
    });

    it('orders dates chronologically, newest first', () => {
      store.createSync('notifications', { familyId: 'f9', createdAt: undefined, title: 'x' }, 'n1');
      store.createSync('notifications', { familyId: 'f9', title: 'y' }, 'n2');

      const rows = store.findManySync('notifications', { familyId: 'f9' }, { createdAt: 'desc' });
      // Both were server-stamped in insertion order, so n2 is the newer one.
      expect(rows[0].id).toBe('n2');
    });

    it('keeps documents missing the sort field instead of dropping them', () => {
      store.createSync('wishlist', { childId: 'c1', priority: 2 }, 'w1');
      store.createSync('wishlist', { childId: 'c1' }, 'w-none');
      store.createSync('wishlist', { childId: 'c1', priority: 1 }, 'w2');

      const rows = store.findManySync('wishlist', { childId: 'c1' }, { priority: 'asc' });
      // Firestore omitted these documents from ordered queries entirely, which
      // is how wishlist items silently vanished from the dashboard. Keep them.
      expect(rows).toHaveLength(3);
      // The ones that do have a priority stay correctly ordered relative to each other.
      const ranked = rows.filter((r) => r.priority !== undefined).map((r) => r.id);
      expect(ranked).toEqual(['w2', 'w1']);
    });

    it('matches booleans stored as JSON true', () => {
      store.createSync('notifications', { familyId: 'f3', read: true }, 'r1');
      store.createSync('notifications', { familyId: 'f3', read: false }, 'r2');

      expect(store.findManySync('notifications', { familyId: 'f3', read: true }).map((r) => r.id)).toEqual(['r1']);
      expect(store.findManySync('notifications', { familyId: 'f3', read: false }).map((r) => r.id)).toEqual(['r2']);
    });

    it('does not match documents where the field is absent', () => {
      store.createSync('notifications', { familyId: 'f4' }, 'legacy');
      expect(store.findManySync('notifications', { familyId: 'f4', read: true })).toHaveLength(0);
    });

    it('supports OR branches', () => {
      const rows = store.findManySync('tasks', { OR: [{ id: 't1' }, { id: 't3' }] });
      expect(rows.map((r) => r.id).sort()).toEqual(['t1', 't3']);
    });

    it('rejects field names that are not plain identifiers', () => {
      expect(() => store.findManySync('tasks', { "a'); DROP TABLE tasks; --": 1 })).toThrow(/Unsafe field name/);
    });

    it('rejects unknown collections', () => {
      expect(() => store.findManySync('not_a_collection')).toThrow(/Unknown collection/);
    });
  });

  describe('update', () => {
    it('merges top-level fields and leaves the rest intact', () => {
      store.createSync('childProfiles', { userId: 'u1', name: 'Kid', pointsBalance: 10 }, 'p1');
      store.updateSync('childProfiles', 'p1', { name: 'Kiddo' });

      const profile = store.getSync('childProfiles', 'p1');
      expect(profile.name).toBe('Kiddo');
      expect(profile.pointsBalance).toBe(10);
      expect(profile.userId).toBe('u1');
    });

    it('replaces a nested object wholesale, matching Firestore update()', () => {
      store.createSync('childProfiles', { userId: 'u1', streakState: { a: 1, b: 2 } }, 'p1');
      store.updateSync('childProfiles', 'p1', { streakState: { a: 9 } });
      expect(store.getSync('childProfiles', 'p1').streakState).toEqual({ a: 9 });
    });

    it('throws on a missing document, as Firestore did', () => {
      expect(() => store.updateSync('childProfiles', 'nope', { name: 'x' })).toThrow(/not found/);
    });

    it('moves updatedAt forward but never createdAt', () => {
      store.createSync('tasks', { title: 't' }, 't1');
      const before = store.getSync('tasks', 't1');
      store.updateSync('tasks', 't1', { title: 'u', createdAt: new Date('1999-01-01') });
      const after = store.getSync('tasks', 't1');

      expect(after.createdAt.toISOString()).toBe(before.createdAt.toISOString());
      expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    });
  });

  describe('incrementSync', () => {
    it('adds deltas to numeric fields', () => {
      store.createSync('childProfiles', { userId: 'u1', pointsBalance: 10, totalEarned: 100 }, 'p1');
      store.incrementSync('childProfiles', 'p1', { pointsBalance: -3, totalEarned: 0 });

      const profile = store.getSync('childProfiles', 'p1');
      expect(profile.pointsBalance).toBe(7);
      expect(profile.totalEarned).toBe(100);
    });

    it('treats a missing counter as zero', () => {
      store.createSync('childProfiles', { userId: 'u1' }, 'p1');
      store.incrementSync('childProfiles', 'p1', { pointsBalance: 5 });
      expect(store.getSync('childProfiles', 'p1').pointsBalance).toBe(5);
    });

    it('applies the extra patch alongside the deltas', () => {
      const at = new Date('2026-03-01T10:00:00.000Z');
      store.createSync('childProfiles', { userId: 'u1', pointsBalance: 1 }, 'p1');
      store.incrementSync('childProfiles', 'p1', { pointsBalance: 2 }, { lastCompletionAt: at });

      const profile = store.getSync('childProfiles', 'p1');
      expect(profile.pointsBalance).toBe(3);
      expect(profile.lastCompletionAt.toISOString()).toBe(at.toISOString());
    });
  });

  describe('transaction', () => {
    it('commits ledger entry and balance together', () => {
      store.createSync('childProfiles', { userId: 'u1', pointsBalance: 0 }, 'p1');

      store.transaction(() => {
        store.createSync('ledgerEntries', { childId: 'u1', type: 'EARN', amount: 5 }, 'l1');
        store.incrementSync('childProfiles', 'p1', { pointsBalance: 5 });
      });

      expect(store.getSync('ledgerEntries', 'l1')).not.toBeNull();
      expect(store.getSync('childProfiles', 'p1').pointsBalance).toBe(5);
    });

    it('rolls the entry back if the balance update throws', () => {
      store.createSync('childProfiles', { userId: 'u1', pointsBalance: 0 }, 'p1');

      expect(() =>
        store.transaction(() => {
          store.createSync('ledgerEntries', { childId: 'u1', amount: 5 }, 'l1');
          store.incrementSync('childProfiles', 'missing-profile', { pointsBalance: 5 });
        }),
      ).toThrow(/not found/);

      // The whole point of the transaction: no orphaned ledger entry.
      expect(store.getSync('ledgerEntries', 'l1')).toBeNull();
      expect(store.getSync('childProfiles', 'p1').pointsBalance).toBe(0);
    });
  });

  describe('count and delete', () => {
    it('counts with and without a filter', () => {
      store.createSync('completions', { childId: 'c1', status: 'APPROVED' });
      store.createSync('completions', { childId: 'c1', status: 'PENDING' });
      store.createSync('completions', { childId: 'c2', status: 'APPROVED' });

      expect(store.countSync('completions')).toBe(3);
      expect(store.countSync('completions', { childId: 'c1' })).toBe(2);
      expect(store.countSync('completions', { childId: 'c1', status: 'APPROVED' })).toBe(1);
    });

    it('deletes idempotently', () => {
      store.createSync('tasks', { title: 't' }, 't1');
      store.deleteSync('tasks', 't1');
      store.deleteSync('tasks', 't1');
      expect(store.getSync('tasks', 't1')).toBeNull();
    });
  });
});
