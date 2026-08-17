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

    it('keeps the supplied timestamps when importing existing documents', () => {
      // Without this an import restamps every document with the moment of the
      // import, and every createdAt-ordered list in the product silently loses
      // its order.
      const created = new Date('2026-02-01T10:00:00.000Z');
      const updated = new Date('2026-03-01T10:00:00.000Z');
      const id = store.createSync(
        'tasks',
        { title: 't', createdAt: created, updatedAt: updated },
        'imported',
        { preserveTimestamps: true },
      );

      const task = store.getSync('tasks', id);
      expect(task.createdAt.toISOString()).toBe(created.toISOString());
      expect(task.updatedAt.toISOString()).toBe(updated.toISOString());
    });

    it('falls back to now when an imported document has no timestamps', () => {
      const id = store.createSync('tasks', { title: 't' }, 'no-stamps', { preserveTimestamps: true });
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

  describe('setSync', () => {
    it('creates the document when it does not exist', () => {
      store.setSync('locationSettings', 'fam-1', { enabled: true }, { merge: true });
      expect(store.getSync('locationSettings', 'fam-1').enabled).toBe(true);
    });

    it('merges into an existing document and preserves createdAt', () => {
      store.setSync('locationSettings', 'fam-1', { enabled: true, historyDays: 7 });
      const created = store.getSync('locationSettings', 'fam-1').createdAt;

      store.setSync('locationSettings', 'fam-1', { historyDays: 30 }, { merge: true });

      const settings = store.getSync('locationSettings', 'fam-1');
      expect(settings.enabled).toBe(true);
      expect(settings.historyDays).toBe(30);
      expect(settings.createdAt.toISOString()).toBe(created.toISOString());
    });

    it('replaces wholesale without merge', () => {
      store.setSync('locationSettings', 'fam-1', { enabled: true, historyDays: 7 });
      store.setSync('locationSettings', 'fam-1', { historyDays: 30 });

      const settings = store.getSync('locationSettings', 'fam-1');
      expect(settings.historyDays).toBe(30);
      expect(settings.enabled).toBeUndefined();
    });

    it('keeps the edited entry\'s other fields, not just the siblings', () => {
      store.setSync('locationSettings', 'fam-1', {
        perChild: {
          'child-a': { enabled: true, historyDays: 3 },
          'child-b': { enabled: true, historyDays: 30 },
        },
      });

      // Toggling one flag for child A must not reset their retention: a
      // one-level merge replaced the child's whole object and silently sent
      // historyDays back to the family default.
      store.setSync(
        'locationSettings',
        'fam-1',
        { perChild: { 'child-a': { enabled: false } } },
        { merge: true, mergeNested: true },
      );

      const perChild = store.getSync('locationSettings', 'fam-1').perChild;
      expect(perChild['child-a']).toEqual({ enabled: false, historyDays: 3 });
      expect(perChild['child-b']).toEqual({ enabled: true, historyDays: 30 });
    });

    it('replaces arrays wholesale rather than merging them', () => {
      store.setSync('tasks', 't1', { daysOfWeek: [1, 2, 3] });
      store.setSync('tasks', 't1', { daysOfWeek: [5] }, { merge: true, mergeNested: true });
      expect(store.getSync('tasks', 't1').daysOfWeek).toEqual([5]);
    });

    it('merges one level down without clobbering sibling keys', () => {
      store.setSync('locationSettings', 'fam-1', {
        perChild: { 'child-a': { enabled: true }, 'child-b': { enabled: true } },
      });

      store.setSync(
        'locationSettings',
        'fam-1',
        { perChild: { 'child-b': { enabled: false } } },
        { merge: true, mergeNested: true },
      );

      // Turning tracking off for one child must not silently re-enable or drop
      // the other child's settings.
      const perChild = store.getSync('locationSettings', 'fam-1').perChild;
      expect(perChild['child-a']).toEqual({ enabled: true });
      expect(perChild['child-b']).toEqual({ enabled: false });
    });

    it('replaces a nested key when nested merging is off', () => {
      store.setSync('locationSettings', 'fam-1', { perChild: { a: { enabled: true } } });
      store.setSync('locationSettings', 'fam-1', { perChild: { b: { enabled: true } } }, { merge: true });
      expect(store.getSync('locationSettings', 'fam-1').perChild).toEqual({ b: { enabled: true } });
    });
  });

  describe('deleteManySync', () => {
    it('deletes matching documents and reports the count', () => {
      store.createSync('locationPoints', { childId: 'c1' }, 'p1');
      store.createSync('locationPoints', { childId: 'c1' }, 'p2');
      store.createSync('locationPoints', { childId: 'c2' }, 'p3');

      expect(store.deleteManySync('locationPoints', { childId: 'c1' })).toBe(2);
      expect(store.countSync('locationPoints')).toBe(1);
    });

    it('deletes by an expiry cutoff — the TTL Firestore used to do for us', () => {
      store.createSync('locationPoints', { childId: 'c1', expiresAt: new Date('2026-01-01') }, 'old');
      store.createSync('locationPoints', { childId: 'c1', expiresAt: new Date('2099-01-01') }, 'fresh');

      const removed = store.deleteManySync('locationPoints', { expiresAt: { lt: new Date('2026-06-01') } });

      expect(removed).toBe(1);
      expect(store.getSync('locationPoints', 'fresh')).not.toBeNull();
    });

    it('refuses to wipe a collection when the filter matched nothing meaningful', () => {
      store.createSync('locationPoints', { childId: 'c1' }, 'p1');
      expect(store.deleteManySync('locationPoints', { childId: { in: [] } })).toBe(0);
      expect(store.countSync('locationPoints')).toBe(1);
    });
  });

  describe('sumSync', () => {
    beforeEach(() => {
      store.createSync('ledgerEntries', { childId: 'c1', type: 'EARN', amount: 10 });
      store.createSync('ledgerEntries', { childId: 'c1', type: 'BONUS', amount: 5 });
      store.createSync('ledgerEntries', { childId: 'c1', type: 'SPEND', amount: -30 });
      store.createSync('ledgerEntries', { childId: 'c1', type: 'SPEND', amount: 20 });
      store.createSync('ledgerEntries', { childId: 'c2', type: 'EARN', amount: 999 });
    });

    it('sums a field for matching documents only', () => {
      expect(store.sumSync('ledgerEntries', 'amount', { childId: 'c1', type: { in: ['EARN', 'BONUS'] } })).toBe(15);
    });

    it('sums absolute values so mixed signs do not net off', () => {
      // Stored SPEND amounts are inconsistently signed; the JS code took
      // Math.abs per row. Summing raw would give -10 instead of 50.
      expect(
        store.sumSync('ledgerEntries', 'amount', { childId: 'c1', type: 'SPEND' }, { absolute: true }),
      ).toBe(50);
    });

    it('returns 0 rather than null when nothing matches', () => {
      expect(store.sumSync('ledgerEntries', 'amount', { childId: 'nobody' })).toBe(0);
    });

    it('ignores documents missing the field', () => {
      store.createSync('ledgerEntries', { childId: 'c3' });
      store.createSync('ledgerEntries', { childId: 'c3', amount: 7 });
      expect(store.sumSync('ledgerEntries', 'amount', { childId: 'c3' })).toBe(7);
    });
  });

  describe('not operator', () => {
    it('matches documents where the field differs OR is absent', () => {
      store.createSync('notifications', { familyId: 'f1', read: true }, 'n-read');
      store.createSync('notifications', { familyId: 'f1', read: false }, 'n-unread');
      store.createSync('notifications', { familyId: 'f1' }, 'n-legacy');

      // Legacy rows predating the `read` field must still count as unread —
      // that is what the in-memory `n.read !== true` filter did.
      const rows = store.findManySync('notifications', { familyId: 'f1', read: { not: true } });
      expect(rows.map((r) => r.id).sort()).toEqual(['n-legacy', 'n-unread']);
      expect(store.countSync('notifications', { familyId: 'f1', read: { not: true } })).toBe(2);
    });
  });

  describe('updateManySync', () => {
    it('patches every match and reports the count', () => {
      store.createSync('notifications', { familyId: 'f1', read: false }, 'a');
      store.createSync('notifications', { familyId: 'f1' }, 'b');
      store.createSync('notifications', { familyId: 'f2', read: false }, 'other-family');

      const touched = store.updateManySync('notifications', { familyId: 'f1', read: { not: true } }, { read: true });

      expect(touched).toBe(2);
      expect(store.getSync('notifications', 'a').read).toBe(true);
      expect(store.getSync('notifications', 'b').read).toBe(true);
      expect(store.getSync('notifications', 'other-family').read).toBe(false);
    });

    it('leaves unrelated fields intact', () => {
      store.createSync('notifications', { familyId: 'f1', title: 'hi', childId: 'c1' }, 'a');
      store.updateManySync('notifications', { familyId: 'f1' }, { read: true });

      const row = store.getSync('notifications', 'a');
      expect(row.title).toBe('hi');
      expect(row.childId).toBe('c1');
      expect(row.read).toBe(true);
    });

    it('moves updatedAt forward', () => {
      store.createSync('notifications', { familyId: 'f1' }, 'a');
      const before = store.getSync('notifications', 'a').updatedAt;
      store.updateManySync('notifications', { familyId: 'f1' }, { read: true });
      expect(store.getSync('notifications', 'a').updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
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
