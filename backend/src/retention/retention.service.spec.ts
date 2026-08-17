import { DocStore } from '../db/doc-store.service';
import { RetentionService } from './retention.service';

describe('RetentionService', () => {
  let store: DocStore;
  let service: RetentionService;
  const OLD_ENV = { ...process.env };

  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  };

  /** createdAt is server-stamped, so a fixture needs it written afterwards. */
  const notification = (id: string, ageDays: number) => {
    store.createSync('notifications', { familyId: 'f1', title: id }, id);
    store.raw
      .prepare("UPDATE notifications SET doc = json_set(doc, '$.createdAt', ?) WHERE id = ?")
      .run(daysAgo(ageDays).toISOString(), id);
  };

  beforeEach(() => {
    store = new DocStore();
    store.open(':memory:');
    service = new RetentionService(store);
    delete process.env.NOTIFICATIONS_RETENTION_DAYS;
    delete process.env.COMPLETIONS_RETENTION_DAYS;
  });

  afterEach(() => {
    store.close();
    process.env = { ...OLD_ENV };
  });

  describe('notifications', () => {
    beforeEach(() => {
      notification('fresh', 1);
      notification('edge', 29);
      notification('old', 45);
      notification('ancient', 400);
    });

    it('removes only what is past the window', async () => {
      process.env.NOTIFICATIONS_RETENTION_DAYS = '30';
      expect(await service.sweepNotifications()).toBe(2);
      expect(store.getSync('notifications', 'fresh')).not.toBeNull();
      expect(store.getSync('notifications', 'edge')).not.toBeNull();
      expect(store.getSync('notifications', 'old')).toBeNull();
      expect(store.getSync('notifications', 'ancient')).toBeNull();
    });

    it('counts without deleting in dry-run', async () => {
      process.env.NOTIFICATIONS_RETENTION_DAYS = '30';
      expect(await service.sweepNotifications(true)).toBe(2);
      expect(store.countSync('notifications')).toBe(4);
    });

    it('defaults to 30 days when unset', async () => {
      expect(await service.sweepNotifications()).toBe(2);
    });

    it('is disabled by a zero or invalid window', async () => {
      process.env.NOTIFICATIONS_RETENTION_DAYS = '0';
      expect(await service.sweepNotifications()).toBe(0);
      process.env.NOTIFICATIONS_RETENTION_DAYS = 'nonsense';
      expect(await service.sweepNotifications()).toBe(0);
      expect(store.countSync('notifications')).toBe(4);
    });
  });

  describe('completions', () => {
    beforeEach(() => {
      store.createSync('completions', { childId: 'c1', performedAt: daysAgo(2) }, 'recent');
      store.createSync('completions', { childId: 'c1', performedAt: daysAgo(90) }, 'old');
    });

    it('is off unless explicitly configured', async () => {
      // This deletes the record of what a child actually did, which the ledger,
      // badges and the parent's statistics all read. It must never start
      // running because someone deployed.
      expect(await service.sweepCompletions()).toBe(0);
      expect(store.countSync('completions')).toBe(2);
    });

    it('expires by performedAt, not by row age, once configured', async () => {
      process.env.COMPLETIONS_RETENTION_DAYS = '30';
      expect(await service.sweepCompletions()).toBe(1);
      expect(store.getSync('completions', 'recent')).not.toBeNull();
      expect(store.getSync('completions', 'old')).toBeNull();
    });

    it('reports what it would delete without touching anything', async () => {
      process.env.COMPLETIONS_RETENTION_DAYS = '30';
      expect(await service.sweepCompletions(true)).toBe(1);
      expect(store.countSync('completions')).toBe(2);
    });
  });

  it('sweeps both in one pass', async () => {
    notification('old', 60);
    store.createSync('completions', { childId: 'c1', performedAt: daysAgo(90) }, 'old');
    process.env.NOTIFICATIONS_RETENTION_DAYS = '30';
    process.env.COMPLETIONS_RETENTION_DAYS = '30';

    expect(await service.sweep()).toEqual({ notifications: 1, completions: 1 });
  });
});
