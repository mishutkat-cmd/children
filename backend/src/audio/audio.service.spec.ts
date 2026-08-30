import { AudioService } from './audio.service';

// Лёгкий фейк DocStore: в память, без БД. Проверяем правила согласия и
// владения, а не хранилище.
class FakeDb {
  rows = new Map<string, any>();
  profiles = [{ id: 'p1', userId: 'childUser', familyId: 'f1' }];
  users = [
    { id: 'childUser', familyId: 'f1', role: 'CHILD' },
    { id: 'otherChild', familyId: 'f1', role: 'CHILD' },
  ];
  async create(_c: string, data: any, id?: string) { this.rows.set(id ?? data.id, { ...data, createdAt: new Date() }); return id ?? data.id; }
  async get(_c: string, id: string) { return this.rows.get(id) ?? null; }
  async update(_c: string, id: string, patch: any) { this.rows.set(id, { ...this.rows.get(id), ...patch }); }
  async findMany(c: string, where: any, _o?: any, take?: number) {
    if (c === 'childProfiles') return this.profiles.filter((p) => p.userId === where.userId);
    if (c === 'users') return this.users.filter((u) => u.id === where.id && (!where.familyId || u.familyId === where.familyId));
    let out = [...this.rows.values()].filter((r) =>
      Object.entries(where).every(([k, v]) => r[k] === v));
    out = out.sort((a, b) => b.createdAt - a.createdAt);
    return take ? out.slice(0, take) : out;
  }
  async findFirst(c: string, where: any) { return (await this.findMany(c, where))[0] ?? null; }
}

const makeStorage = () => ({ save: jest.fn(async () => ({ url: '', path: '' })) }) as any;

describe('AudioService — согласие и владение', () => {
  let db: FakeDb;
  let svc: AudioService;

  beforeEach(() => {
    db = new FakeDb();
    svc = new AudioService(db as any, makeStorage());
  });

  it('создаёт запрос в статусе PENDING на профиль ребёнка', async () => {
    const req = await svc.createRequest('f1', 'parent1', 'childUser', 30);
    expect(req.status).toBe('PENDING');
    expect(req.childId).toBe('p1');
    expect(req.audioUrl).toBeNull();
  });

  it('ребёнок видит адресованный ему запрос', async () => {
    await svc.createRequest('f1', 'parent1', 'childUser', 30);
    const pending = await svc.pendingForChild('childUser', 'f1');
    expect(pending?.status).toBe('PENDING');
  });

  it('чужой ребёнок не может ни видеть, ни отклонить запрос', async () => {
    const req = await svc.createRequest('f1', 'parent1', 'childUser', 30);
    expect(await svc.pendingForChild('otherChild', 'f1')).toBeNull();
    await expect(svc.deny('otherChild', 'f1', req.id)).rejects.toBeDefined();
  });

  it('запись переводит запрос в READY с приватной ссылкой', async () => {
    const req = await svc.createRequest('f1', 'parent1', 'childUser', 30);
    await svc.fulfil('childUser', 'f1', req.id, { buffer: Buffer.from('x') } as any);
    const one = await svc.getOne('f1', req.id);
    expect(one.status).toBe('READY');
    expect(one.audioUrl).toBe(`/api/v1/files/audio/${req.id}.m4a`);
  });

  it('просроченный без ответа запрос ребёнку уже не показывается', async () => {
    const req = await svc.createRequest('f1', 'parent1', 'childUser', 30);
    // Сдвигаем время создания на 5 минут назад.
    db.rows.get(req.id).createdAt = new Date(Date.now() - 5 * 60 * 1000);
    expect(await svc.pendingForChild('childUser', 'f1')).toBeNull();
    expect((await svc.getOne('f1', req.id)).status).toBe('EXPIRED');
  });

  it('нельзя записать в чужой семье', async () => {
    const req = await svc.createRequest('f1', 'parent1', 'childUser', 30);
    await expect(
      svc.fulfil('childUser', 'f2', req.id, { buffer: Buffer.from('x') } as any),
    ).rejects.toBeDefined();
  });
});
