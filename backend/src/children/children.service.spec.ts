import { ChildrenService, publicUser } from './children.service';

// Фейк DocStore в памяти: проверяем, что наружу не уходят секреты пользователя.
class FakeDb {
  tables = new Map<string, Map<string, any>>();
  t(c: string) {
    if (!this.tables.has(c)) this.tables.set(c, new Map());
    return this.tables.get(c)!;
  }
  async create(c: string, data: any, id?: string) { const k = id ?? data.id; this.t(c).set(k, { createdAt: new Date(), ...data, id: k }); return k; }
  async update(c: string, id: string, patch: any) { this.t(c).set(id, { ...this.t(c).get(id), ...patch }); }
  async findMany(c: string, where: any = {}) { return [...this.t(c).values()].filter((r) => Object.entries(where).every(([k, v]) => r[k] === v)); }
  async findFirst(c: string, where: any) { return (await this.findMany(c, where))[0] ?? null; }
  async count(c: string, where: any = {}) { return (await this.findMany(c, where)).length; }
}

const SECRETS = ['passwordHash', 'secretHash', 'secretFails', 'secretLockedUntil'];

function expectNoSecrets(obj: any) {
  for (const f of SECRETS) expect(obj).not.toHaveProperty(f);
}

describe('ChildrenService: секреты не уходят клиенту', () => {
  let db: FakeDb;
  let svc: ChildrenService;

  beforeEach(async () => {
    db = new FakeDb();
    svc = new ChildrenService(db as any, {} as any, {} as any, {} as any, {} as any);
    await db.create('users', {
      id: 'kid', login: 'masha', role: 'CHILD', familyId: 'f1',
      passwordHash: '$2a$10$hash', secretHash: '$2a$10$secret', secretFails: 2, secretLockedUntil: new Date(),
    }, 'kid');
    await db.create('childProfiles', { id: 'p1', userId: 'kid', name: 'Маша' }, 'p1');
  });

  it('findAll (GET /children) без хэшей и счётчиков', async () => {
    const list = await svc.findAll('f1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'kid', login: 'masha', childProfile: { name: 'Маша' } });
    expectNoSecrets(list[0]);
  });

  it('findOne, update и create без хэшей', async () => {
    expectNoSecrets(await svc.findOne('kid', 'f1'));
    expectNoSecrets(await svc.update('kid', 'f1', { pin: '1234' } as any));
    const created = await svc.create('f1', { login: 'petya', name: 'Петя', pin: '5678' } as any);
    expect(created.login).toBe('petya');
    expectNoSecrets(created);
    // Сам PIN при этом сохранён.
    expect((await db.findFirst('users', { login: 'petya' })).passwordHash).toBeTruthy();
  });

  it('findAllParents без хэшей', async () => {
    await db.create('users', { id: 'mom', login: 'mama', role: 'PARENT', familyId: 'f1', passwordHash: 'x' }, 'mom');
    expectNoSecrets((await svc.findAllParents('f1'))[0]);
  });

  it('publicUser не трогает обычные поля', () => {
    expect(publicUser({ id: 'a', login: 'b', passwordHash: 'c' } as any)).toEqual({ id: 'a', login: 'b' });
  });
});
