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


  it('сворачивает приложения в категории', async () => {
    await svc.report('childUser', 'f1', { date: '2026-09-02', apps: [
      { packageName: 'com.google.android.youtube', appLabel: 'YouTube', totalMs: 3600000 },
      { packageName: 'com.roblox.client', appLabel: 'Roblox', totalMs: 1800000 },
      { packageName: 'org.telegram.messenger', appLabel: 'Telegram', totalMs: 600000 },
    ]});
    const res: any = await svc.forChild('f1', 'childUser', '2026-09-02');
    const cats = Object.fromEntries(res.categories.map((c: any) => [c.category, c.totalMs]));
    expect(cats['Видео']).toBe(3600000);
    expect(cats['Игры']).toBe(1800000);
    expect(cats['Мессенджеры']).toBe(600000);
    expect(res.categories[0].category).toBe('Видео'); // отсортировано по убыванию
  });

  it('история за 7 дней содержит сегодняшний итог и среднее', async () => {
    await svc.report('childUser', 'f1', { date: new Date().toISOString().slice(0,10), apps: [
      { packageName: 'com.google.android.youtube', totalMs: 3600000 },
    ]});
    const h: any = await svc.history('f1', 'childUser', 7);
    expect(h.series).toHaveLength(7);
    expect(h.series[6].totalMs).toBe(3600000); // последний день — сегодня
    expect(h.avgMs).toBe(3600000);
  });

});
