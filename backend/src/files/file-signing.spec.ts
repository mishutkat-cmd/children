import { signFileUrl, signFileUrlFromStored, verifyFileSignature } from './file-signing';
import { signDeep } from './sign-private-urls.interceptor';

describe('private file URL signing', () => {
  const OLD_SECRET = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-use';
  });

  afterEach(() => {
    if (OLD_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = OLD_SECRET;
  });

  const parse = (url: string) => {
    const [path, query] = url.split('?');
    const params = new URLSearchParams(query);
    return { path, exp: params.get('exp') ?? undefined, sig: params.get('sig') ?? undefined };
  };

  it('produces a URL that verifies', () => {
    const { exp, sig } = parse(signFileUrl('proofs/photo.jpg'));
    expect(verifyFileSignature('proofs/photo.jpg', exp, sig)).toBe(true);
  });

  it('does not verify for a different file', () => {
    const { exp, sig } = parse(signFileUrl('proofs/photo.jpg'));
    // Otherwise one valid link would unlock every other proof photo.
    expect(verifyFileSignature('proofs/someone-else.jpg', exp, sig)).toBe(false);
  });

  it('rejects a tampered expiry', () => {
    const { sig } = parse(signFileUrl('proofs/photo.jpg'));
    const farFuture = String(Math.floor(Date.now() / 1000) + 999999);
    expect(verifyFileSignature('proofs/photo.jpg', farFuture, sig)).toBe(false);
  });

  it('rejects an expired signature', () => {
    const { path, sig } = parse(signFileUrl('proofs/photo.jpg', -10));
    const exp = new URLSearchParams(signFileUrl('proofs/photo.jpg', -10).split('?')[1]).get('exp')!;
    expect(path).toBe('/api/v1/files/proofs/photo.jpg');
    expect(verifyFileSignature('proofs/photo.jpg', exp, sig)).toBe(false);
  });

  it('rejects a missing or garbage signature', () => {
    const exp = String(Math.floor(Date.now() / 1000) + 600);
    expect(verifyFileSignature('proofs/photo.jpg', exp, undefined)).toBe(false);
    expect(verifyFileSignature('proofs/photo.jpg', exp, 'not-a-signature')).toBe(false);
    expect(verifyFileSignature('proofs/photo.jpg', undefined, 'x')).toBe(false);
  });

  it('does not verify under a different secret', () => {
    const { exp, sig } = parse(signFileUrl('proofs/photo.jpg'));
    process.env.JWT_SECRET = 'a-completely-different-secret-value-here';
    expect(verifyFileSignature('proofs/photo.jpg', exp, sig)).toBe(false);
  });

  it('percent-encodes path segments but keeps the separators', () => {
    const { path } = parse(signFileUrl('proofs/holiday photo #2.jpg'));
    expect(path).toBe('/api/v1/files/proofs/holiday%20photo%20%232.jpg');
  });

  it('re-signs a stored bare URL', () => {
    const { exp, sig } = parse(signFileUrlFromStored('/api/v1/files/proofs/photo.jpg'));
    expect(verifyFileSignature('proofs/photo.jpg', exp, sig)).toBe(true);
  });

  it('re-signs a URL that already carries a stale signature', () => {
    const stale = signFileUrl('proofs/photo.jpg', -10);
    const { exp, sig } = parse(signFileUrlFromStored(stale));
    expect(verifyFileSignature('proofs/photo.jpg', exp, sig)).toBe(true);
  });
});

describe('signing responses on the way out', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-use';
  });

  it('signs a proofUrl nested anywhere in the response', () => {
    const body = signDeep({
      recentCompletions: [
        { id: 'c1', proofUrl: '/api/v1/files/proofs/a.jpg', task: { title: 'x' } },
        { id: 'c2', proofUrl: null },
      ],
      related: { completion: { proofUrl: '/api/v1/files/proofs/b.jpg' } },
    });

    expect(body.recentCompletions[0].proofUrl).toMatch(/^\/api\/v1\/files\/proofs\/a\.jpg\?exp=\d+&sig=.+/);
    expect(body.related.completion.proofUrl).toMatch(/^\/api\/v1\/files\/proofs\/b\.jpg\?exp=\d+&sig=.+/);
    expect(body.recentCompletions[1].proofUrl).toBeNull();
  });

  it('leaves public URLs and ordinary strings alone', () => {
    const body = signDeep({
      avatarUrl: '/uploads/avatars/a.jpg',
      title: 'Do the dishes',
      external: 'https://example.com/api/v1/files/x.jpg',
    });

    expect(body.avatarUrl).toBe('/uploads/avatars/a.jpg');
    expect(body.title).toBe('Do the dishes');
    expect(body.external).toBe('https://example.com/api/v1/files/x.jpg');
  });

  it('passes Dates through untouched', () => {
    const when = new Date('2026-08-16T10:00:00.000Z');
    const body = signDeep({ performedAt: when });
    expect(body.performedAt).toBeInstanceOf(Date);
    expect(body.performedAt.toISOString()).toBe(when.toISOString());
  });

  it('handles null, arrays and primitives', () => {
    expect(signDeep(null)).toBeNull();
    expect(signDeep(42)).toBe(42);
    expect(signDeep([['/api/v1/files/proofs/a.jpg']])[0][0]).toContain('sig=');
  });
});
