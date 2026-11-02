import { RewardsService } from './rewards.service';

// Фейк DocStore в памяти: проверяем правила цены, а не хранилище.
class FakeDb {
  rows = new Map<string, any>();
  async create(_c: string, data: any, id?: string) { this.rows.set(id ?? data.id, { ...data }); return id ?? data.id; }
  async update(_c: string, id: string, patch: any) { this.rows.set(id, { ...this.rows.get(id), ...patch }); }
  async findMany(_c: string, where: any) {
    return [...this.rows.values()].filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  }
  async findFirst(c: string, where: any) { return (await this.findMany(c, where))[0] ?? null; }
}

const child = { userId: 'kid', role: 'CHILD', familyId: 'f1' } as any;
const parent = { userId: 'mom', role: 'PARENT', familyId: 'f1' } as any;

describe('RewardsService — цену желания ставит родитель', () => {
  let db: FakeDb;
  let svc: RewardsService;

  beforeEach(() => {
    db = new FakeDb();
    svc = new RewardsService(db as any);
  });

  it('желание ребёнка создаётся без цены, даже если цену прислали', async () => {
    const r: any = await svc.create('f1', { title: 'Велосипед', type: 'ITEM', costPoints: 1 }, child);
    expect(r.costPoints).toBe(0);
    expect(r.needsPrice).toBe(true);
  });

  it('ребёнок не может поменять цену своего желания', async () => {
    const r: any = await svc.create('f1', { title: 'Велосипед', type: 'ITEM' }, child);
    const u: any = await svc.update(r.id, 'f1', { costPoints: 5, title: 'Велик' }, child);
    expect(u.costPoints).toBe(0);
    expect(u.title).toBe('Велик');
  });

  it('родитель назначает цену — желание больше не ждёт цены', async () => {
    const r: any = await svc.create('f1', { title: 'Велосипед', type: 'ITEM' }, child);
    const u: any = await svc.update(r.id, 'f1', { costPoints: 2000 }, parent);
    expect(u.costPoints).toBe(2000);
    expect(u.needsPrice).toBe(false);
  });

  it('родитель без цены награду не создаёт', async () => {
    await expect(svc.create('f1', { title: 'Кино', type: 'EVENT' }, parent)).rejects.toThrow('Укажите цену');
  });
});
