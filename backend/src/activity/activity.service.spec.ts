import { ActivityService } from './activity.service';

class FakeDb {
  rows = new Map<string, any>();
  profiles = [{ id: 'p1', userId: 'childUser', familyId: 'f1', name: 'Kid' }];
  users = [{ id: 'childUser', familyId: 'f1', role: 'CHILD' }];
  async set(c: string, id: string, data: any) { this.rows.set(`${c}:${id}`, { ...(this.rows.get(`${c}:${id}`)||{}), ...data }); }
  async findMany(c: string, where: any) {
    if (c === 'childProfiles') return this.profiles.filter((p) => p.userId === where.userId);
    if (c === 'users') return this.users.filter((u) => u.id === where.id ? true : (u.familyId===where.familyId && u.role===where.role));
    return [...this.rows.values()].filter((r) => Object.entries(where).every(([k,v]) => r[k]===v));
  }
  async findFirst(c: string, where: any) { return (await this.findMany(c, where))[0] ?? null; }
}

describe('ActivityService', () => {
  let db: FakeDb; let svc: ActivityService;
  beforeEach(() => { db = new FakeDb(); svc = new ActivityService(db as any); });

  it('принимает срез и агрегирует по приложениям', async () => {
    await svc.report('childUser', 'f1', { date: '2026-09-02', apps: [
      { packageName: 'com.youtube', appLabel: 'YouTube', totalMs: 3600000 },
      { packageName: 'com.game', appLabel: 'Game', totalMs: 1800000 },
    ]});
    const res = await svc.forChild('f1', 'childUser', '2026-09-02');
    expect(res.totalMs).toBe(5400000);
    expect(res.apps[0].appLabel).toBe('YouTube'); // отсортировано по убыванию
    expect(res.apps).toHaveLength(2);
  });

  it('повторная отправка перезаписывает день, а не задваивает', async () => {
    await svc.report('childUser', 'f1', { date: '2026-09-02', apps: [{ packageName: 'com.youtube', totalMs: 1000 }]});
    await svc.report('childUser', 'f1', { date: '2026-09-02', apps: [{ packageName: 'com.youtube', totalMs: 5000 }]});
    const res = await svc.forChild('f1', 'childUser', '2026-09-02');
    expect(res.totalMs).toBe(5000);
    expect(res.apps).toHaveLength(1);
  });

  it('пропускает пустые/нулевые записи', async () => {
    await svc.report('childUser', 'f1', { date: '2026-09-02', apps: [
      { packageName: 'com.a', totalMs: 0 },
      { packageName: '', totalMs: 100 } as any,
    ]});
    const res = await svc.forChild('f1', 'childUser', '2026-09-02');
    expect(res.apps).toHaveLength(0);
  });

  it('итог по всем детям', async () => {
    await svc.report('childUser', 'f1', { date: '2026-09-02', apps: [{ packageName: 'com.youtube', appLabel:'YouTube', totalMs: 7200000 }]});
    const s = await svc.summary('f1', '2026-09-02');
    expect(s).toHaveLength(1);
    expect(s[0]!.totalMs).toBe(7200000);
    expect(s[0]!.topApp).toBe('YouTube');
  });
});
