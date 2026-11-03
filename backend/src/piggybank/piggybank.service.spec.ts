import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { LedgerService } from '../ledger/ledger.service';
import { ExchangesService } from '../exchanges/exchanges.service';
import { PiggybankService } from './piggybank.service';

describe('PiggybankService', () => {
  let store: DocStore;
  let ledger: LedgerService;
  let svc: PiggybankService;
  const kid = { userId: 'u1', familyId: 'f1', role: 'CHILD' } as any;
  const parent = { userId: 'par', familyId: 'f1', role: 'PARENT' } as any;
  const stranger = { userId: 'x', familyId: 'f2', role: 'PARENT' } as any;

  beforeEach(async () => {
    store = new DocStore();
    store.open(':memory:');
    store.createSync('users', { familyId: 'f1', role: 'CHILD', login: 'masha' }, 'u1');
    store.createSync('childProfiles', { userId: 'u1', name: 'Маша', pointsBalance: 0, totalEarned: 0 }, 'p1');
    store.createSync('familySettings', { familyId: 'f1', conversionRate: 10 }, 'fs1');
    store.createSync('rewards', { familyId: 'f1', title: 'Лего', moneyValueCents: 50000, costPoints: 5000, status: 'ACTIVE', scope: 'PERSONAL' }, 'r1');
    store.createSync('wishlist', { childId: 'p1', rewardId: 'r1', isFavorite: true }, 'w1');
    ledger = new LedgerService(store, { checkAndAwardBadges: async () => [] } as any);
    svc = new PiggybankService(store, new ExchangesService(store, ledger));
    await ledger.createEntry('f1', 'u1', 'EARN', 'COMPLETION', 300, 'c1');
  });
  afterEach(() => store.close());

  it('records cash and refuses to spend more than the wallet has', async () => {
    let s = await svc.cash(kid, 20000, 'бабушка');
    expect(s.walletCents).toBe(20000);
    await expect(svc.cash(kid, -30000)).rejects.toBeInstanceOf(BadRequestException);
    s = await svc.cash(kid, -5000, 'мороженое');
    expect(s.walletCents).toBe(15000);
  });

  it('converts stars to hryvnias at the family rate', async () => {
    const s = await svc.convert(kid, 250);
    expect(s.walletCents).toBe(2500); // 250 звёзд / 10 = 25 грн
    expect(s.pointsBalance).toBe(50);
    await expect(svc.convert(kid, 100)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves money onto a goal and back, never below zero', async () => {
    await svc.cash(kid, 10000);
    let s = await svc.allocate(kid, 'r1', 8000);
    expect(s.walletCents).toBe(2000);
    expect(s.goals[0].savedCents).toBe(8000);
    await expect(svc.allocate(kid, 'r1', 5000)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.allocate(kid, 'r1', -9000)).rejects.toBeInstanceOf(BadRequestException);
    s = await svc.allocate(kid, 'r1', -3000);
    expect(s.walletCents).toBe(5000);
    expect(s.goals[0].savedCents).toBe(5000);
  });

  it('a child marks a goal bought only when fully saved', async () => {
    await svc.cash(kid, 60000);
    await svc.allocate(kid, 'r1', 30000);
    await expect(svc.goalDone(kid, 'r1')).rejects.toBeInstanceOf(ForbiddenException);
    await svc.allocate(kid, 'r1', 20000);
    const s = await svc.goalDone(kid, 'r1');
    expect(s.goals[0].bought).toBe(true);
    expect(s.goals[0].savedCents).toBe(0);
    expect(s.walletCents).toBe(10000);
  });

  it('a parent works with own family kids only', async () => {
    await expect(svc.summary(parent)).rejects.toBeInstanceOf(BadRequestException);
    await svc.cash(parent, 1000, 'карманные', 'u1');
    expect((await svc.summary(parent, 'p1')).walletCents).toBe(1000);
    await expect(svc.summary(stranger, 'u1')).rejects.toThrow('Ребёнок не найден');
  });
});
