import { JwtService } from '@nestjs/jwt';
import { PairingService } from './pairing.service';

// Фейк DocStore в памяти: проверяем правила подключения, а не хранилище.
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
}

describe('PairingService', () => {
  let db: FakeDb;
  let jwt: JwtService;
  let svc: PairingService;

  beforeEach(async () => {
    db = new FakeDb();
    jwt = new JwtService({ secret: 'test-secret-test-secret-test-secret' });
    svc = new PairingService(db as any, jwt);
    await db.create('users', { id: 'kid', login: 'masha', role: 'CHILD', familyId: 'f1' }, 'kid');
    await db.create('childProfiles', { id: 'p1', userId: 'kid', name: 'Маша' }, 'p1');
    await db.create('users', { id: 'mom', login: 'mama', role: 'PARENT', familyId: 'f1' }, 'mom');
    await db.create('users', { id: 'other', login: 'x', role: 'CHILD', familyId: 'f2' }, 'other');
  });

  it('код подключает телефон один раз и даёт сессию, которую можно отозвать', async () => {
    const { code } = await svc.createCode('f1', 'kid');
    expect(code).toMatch(/^\d{6}$/);
    const res = await svc.claimCode(code, 'dev-1', 'ios');
    expect(res.child.name).toBe('Маша');
    expect(res.hasSecret).toBe(false);
    const payload: any = jwt.decode(res.accessToken);
    expect(payload).toMatchObject({ sub: 'kid', role: 'CHILD', familyId: 'f1' });
    expect(await svc.checkSession(payload.sid, 'kid', 'f1')).toBe(true);

    await expect(svc.claimCode(code, 'dev-2')).rejects.toThrow();

    await svc.revokeDevice('f1', payload.sid);
    expect(await svc.checkSession(payload.sid, 'kid', 'f1')).toBe(false);
  });

  it('новый код гасит прежний; чужого ребёнка подключить нельзя', async () => {
    const first = await svc.createCode('f1', 'kid');
    await svc.createCode('f1', 'kid');
    await expect(svc.claimCode(first.code, 'dev')).rejects.toThrow();
    await expect(svc.createCode('f1', 'other')).rejects.toThrow();
  });

  it('семейный компьютер: вход по секрету, блокировка после 5 ошибок', async () => {
    await svc.setSecret('kid', ['cat', 'sun', 'fish']);
    const { familyPcToken } = await svc.enableFamilyPc('f1', 'mom');
    const kids = await svc.familyPcKids(familyPcToken);
    expect(kids.map((k) => k.name)).toEqual(['Маша']);

    const ok = await svc.familyPcLogin(familyPcToken, 'kid', ['cat', 'sun', 'fish']);
    const p: any = jwt.decode(ok.accessToken);
    expect(p.role).toBe('CHILD');
    expect(await svc.checkSession(p.sid, 'kid', 'f1')).toBe(true);

    for (let i = 0; i < 5; i++) await expect(svc.familyPcLogin(familyPcToken, 'kid', ['dog', 'sun', 'fish'])).rejects.toThrow();
    await expect(svc.familyPcLogin(familyPcToken, 'kid', ['cat', 'sun', 'fish'])).rejects.toThrow(/15 минут/);

    await svc.resetSecret('f1', 'kid');
    await expect(svc.familyPcLogin(familyPcToken, 'kid', ['cat', 'sun', 'fish'])).rejects.toThrow(/не задан/);
  });

  it('секрет — ровно 3 картинки из набора', async () => {
    await expect(svc.setSecret('kid', ['cat', 'sun'])).rejects.toThrow();
    await expect(svc.setSecret('kid', ['cat', 'sun', 'unicorn'])).rejects.toThrow();
  });

  it('приглашение добавляет взрослого в ту же семью и работает один раз', async () => {
    const { token } = await svc.createInvite('f1', 'mom');
    expect((await svc.describeInvite(token)).kids).toEqual(['Маша']);
    const res = await svc.acceptInvite(token, { login: 'papa', password: 'password123' });
    expect(res.user).toMatchObject({ role: 'PARENT', familyId: 'f1' });
    await expect(svc.acceptInvite(token, { login: 'papa2', password: 'password123' })).rejects.toThrow();
  });
});
