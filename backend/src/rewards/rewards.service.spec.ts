import { RewardsService } from './rewards.service';

// Фейк DocStore в памяти с поддержкой { in: [...] }.
class FakeDb {
  tables = new Map<string, Map<string, any>>();
  t(c: string) {
    if (!this.tables.has(c)) this.tables.set(c, new Map());
    return this.tables.get(c)!;
  }
  match(r: any, where: any) {
    return Object.entries(where).every(([k, v]: [string, any]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(r[k]) : r[k] === v));
  }
  async create(c: string, data: any, id?: string) { const k = id ?? data.id; this.t(c).set(k, { createdAt: new Date(), ...data, id: k }); return k; }
  async update(c: string, id: string, patch: any) { this.t(c).set(id, { ...this.t(c).get(id), ...patch }); }
  async findMany(c: string, where: any = {}) { return [...this.t(c).values()].filter((r) => this.match(r, where)); }
  async findFirst(c: string, where: any) { return (await this.findMany(c, where))[0] ?? null; }
}

describe('RewardsService: ребёнок не видит чужие цели', () => {
  let db: FakeDb;
  let svc: RewardsService;
  const parent = { userId: 'p1', familyId: 'f1', role: 'PARENT' } as any;
  const masha = { userId: 'u-masha', familyId: 'f1', role: 'CHILD' } as any;
  const tima = { userId: 'u-tima', familyId: 'f1', role: 'CHILD' } as any;

  beforeEach(async () => {
    db = new FakeDb();
    svc = new RewardsService(db as any);
    await db.create('users', { id: 'p1', familyId: 'f1', role: 'PARENT' });
    await db.create('users', { id: 'u-masha', familyId: 'f1', role: 'CHILD' });
    await db.create('users', { id: 'u-tima', familyId: 'f1', role: 'CHILD' });
    await db.create('childProfiles', { id: 'cp-masha', userId: 'u-masha' });
    await db.create('childProfiles', { id: 'cp-tima', userId: 'u-tima' });
  });

  it('личная цель видна только хозяину, магазин и семейная — всем', async () => {
    await svc.create('f1', { title: 'LEGO', costPoints: 3000, type: 'ITEM', ownerChildId: 'u-masha' } as any, parent);
    await svc.create('f1', { title: 'Мороженое', costPoints: 100, type: 'ITEM' } as any, parent);
    await svc.create('f1', { title: 'Аквапарк', costPoints: 2800, type: 'EVENT', scope: 'FAMILY' } as any, parent);
    await svc.create('f1', { title: 'Наушники', type: 'ITEM' } as any, tima);

    const forMasha = (await svc.findAll('f1', undefined, masha)).map((r: any) => r.title).sort();
    const forTima = (await svc.findAll('f1', undefined, tima)).map((r: any) => r.title).sort();
    const forParent = (await svc.findAll('f1', undefined, parent)).length;

    expect(forMasha).toEqual(['LEGO', 'Аквапарк', 'Мороженое']);
    expect(forTima).toEqual(['Аквапарк', 'Мороженое', 'Наушники']);
    expect(forParent).toBe(4);
  });

  it('старая награда без scope в чужом списке целей скрыта', async () => {
    await db.create('rewards', { id: 'r-old', familyId: 'f1', title: 'Велосипед', costPoints: 5000, createdByUserId: 'p1', status: 'ACTIVE' });
    await db.create('wishlist', { id: 'w1', childId: 'cp-masha', rewardId: 'r-old' });
    expect((await svc.findAll('f1', undefined, masha)).map((r: any) => r.id)).toContain('r-old');
    expect((await svc.findAll('f1', undefined, tima)).map((r: any) => r.id)).not.toContain('r-old');
  });
});
