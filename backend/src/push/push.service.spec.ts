import { DocStore } from '../db/doc-store.service';
import { PushService } from './push.service';

describe('PushService tokens', () => {
  let store: DocStore;
  let push: PushService;

  beforeEach(() => {
    store = new DocStore();
    store.open(':memory:');
    push = new PushService(store);
  });
  afterEach(() => store.close());

  it('re-registering a token moves it to the latest user', async () => {
    await push.register('kid1', 'f1', 'token-aaaaaaaaaa', 'android');
    await push.register('kid2', 'f1', 'token-aaaaaaaaaa', 'android');
    const rows = await store.findMany('pushTokens', {});
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe('kid2');
  });

  it('a user cannot remove someone else’s token', async () => {
    await push.register('kid1', 'f1', 'token-aaaaaaaaaa', 'android');
    await push.remove('intruder', 'token-aaaaaaaaaa');
    expect(await store.findMany('pushTokens', {})).toHaveLength(1);
    await push.remove('kid1', 'token-aaaaaaaaaa');
    expect(await store.findMany('pushTokens', {})).toHaveLength(0);
  });

  it('without FCM credentials sending is a quiet no-op', async () => {
    delete process.env.FCM_SERVICE_ACCOUNT_FILE;
    await push.register('kid1', 'f1', 'token-aaaaaaaaaa', 'android');
    await expect(push.sendToUser('kid1', { title: 't', body: 'b' })).resolves.toBe(0);
  });
});
