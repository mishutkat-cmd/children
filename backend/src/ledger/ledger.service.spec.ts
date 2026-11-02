import { BadRequestException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { LedgerService } from './ledger.service';
import { ExchangesService } from '../exchanges/exchanges.service';

/**
 * Баланс и списания на настоящем SQLite: проверки, которые защищают от
 * ухода в минус и двойного списания, живут внутри транзакции ledger.
 */
describe('LedgerService guards', () => {
  let store: DocStore;
  let ledger: LedgerService;

  beforeEach(() => {
    store = new DocStore();
    store.open(':memory:');
    store.createSync('users', { familyId: 'f1', role: 'CHILD', login: 'kid' }, 'u1');
    store.createSync('childProfiles', { userId: 'u1', name: 'Kid', pointsBalance: 0, totalEarned: 0 }, 'p1');
    const badges = { checkAndAwardBadges: async () => [] } as any;
    ledger = new LedgerService(store, badges);
  });

  afterEach(() => store.close());

  const balance = () => store.getSync('childProfiles', 'p1').pointsBalance;

  it('refuses a spend that would take the balance below zero', async () => {
    await ledger.createEntry('f1', 'u1', 'EARN', 'COMPLETION', 100, 'c1');
    await expect(
      ledger.createEntry('f1', 'u1', 'SPEND', 'EXCHANGE', -150, 'e1', undefined, { requireSufficientBalance: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(balance()).toBe(100);
  });

  it('does not write the same spend twice', async () => {
    await ledger.createEntry('f1', 'u1', 'EARN', 'COMPLETION', 100, 'c1');
    const spend = () =>
      ledger.createEntry('f1', 'u1', 'SPEND', 'EXCHANGE', -40, 'e1', undefined, {
        requireSufficientBalance: true,
        uniqueRef: true,
      });
    await spend();
    await expect(spend()).rejects.toBeInstanceOf(BadRequestException);
    expect(balance()).toBe(60);
  });

  it('approving pending exchanges cannot overdraw the balance', async () => {
    await ledger.createEntry('f1', 'u1', 'EARN', 'COMPLETION', 100, 'c1');
    const exchanges = new ExchangesService(store, ledger);
    store.createSync('exchanges', { familyId: 'f1', childId: 'p1', pointsSpent: 100, status: 'PENDING' }, 'x1');
    store.createSync('exchanges', { familyId: 'f1', childId: 'p1', pointsSpent: 100, status: 'PENDING' }, 'x2');

    await exchanges.approve('x1', 'f1');
    await expect(exchanges.approve('x2', 'f1')).rejects.toBeInstanceOf(BadRequestException);

    expect(balance()).toBe(0);
    expect(store.getSync('exchanges', 'x2').status).toBe('PENDING');
  });

  it('a parent cannot create an exchange for another family’s child', async () => {
    const exchanges = new ExchangesService(store, ledger);
    await expect(exchanges.create('u1', 'other-family', { cashCents: 100 })).rejects.toThrow('Child not found');
  });
});
