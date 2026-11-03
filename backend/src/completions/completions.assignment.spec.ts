import { ForbiddenException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { CompletionsService } from './completions.service';

/** Ребёнок не может отметить задание, назначенное другому ребёнку. */
describe('CompletionsService assignment check', () => {
  let store: DocStore;
  let svc: CompletionsService;

  beforeEach(() => {
    store = new DocStore();
    store.open(':memory:');
    store.createSync('users', { familyId: 'f1', role: 'CHILD', login: 'masha' }, 'u1');
    store.createSync('users', { familyId: 'f1', role: 'CHILD', login: 'tima' }, 'u2');
    store.createSync('childProfiles', { userId: 'u1', name: 'Маша', pointsBalance: 0 }, 'p1');
    store.createSync('childProfiles', { userId: 'u2', name: 'Тима', pointsBalance: 0 }, 'p2');
    store.createSync('tasks', { familyId: 'f1', title: 'Только Тима', points: 10, assignedTo: 'SPECIFIC', status: 'ACTIVE' }, 't1');
    store.createSync('taskAssignments', { taskId: 't1', childId: 'p2' }, 'a1');
    const noop: any = new Proxy({}, { get: () => async () => [] });
    svc = new CompletionsService(store, noop, noop, noop, noop);
  });
  afterEach(() => store.close());

  it('refuses a child marking another child’s task', async () => {
    await expect(svc.create('u1', 'f1', { taskId: 't1' } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the assigned child pass the check', async () => {
    const err = await svc.create('u2', 'f1', { taskId: 't1' } as any).then(() => null, (e) => e);
    expect(err).not.toBeInstanceOf(ForbiddenException);
  });
});
