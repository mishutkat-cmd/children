import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  let root: string;
  let service: LocalStorageService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'uploads-test-'));
    process.env.UPLOADS_PATH = join(root, 'uploads');
    process.env.UPLOADS_PRIVATE_PATH = join(root, 'uploads-private');
    process.env.UPLOADS_PUBLIC_BASE = '/uploads';
    service = new LocalStorageService();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.UPLOADS_PATH;
    delete process.env.UPLOADS_PRIVATE_PATH;
    delete process.env.UPLOADS_PUBLIC_BASE;
  });

  describe('save', () => {
    it('writes a public object under the web-served root and returns its URL', async () => {
      const result = await service.save('avatars/avatars-1-photo.jpg', Buffer.from('data'));

      expect(result.url).toBe('/uploads/avatars/avatars-1-photo.jpg');
      expect(existsSync(join(root, 'uploads', 'avatars', 'avatars-1-photo.jpg'))).toBe(true);
    });

    it('keeps proof photos out of the web-served root entirely', async () => {
      const result = await service.save('proofs/proofs-1-photo.jpg', Buffer.from('data'));

      // Firebase served these through signed URLs, never publicly. If this
      // ever lands under the public root, every child's proof photo becomes
      // world-readable.
      expect(result.url).toBe('/api/v1/files/proofs/proofs-1-photo.jpg');
      expect(existsSync(join(root, 'uploads', 'proofs', 'proofs-1-photo.jpg'))).toBe(false);
      expect(existsSync(join(root, 'uploads-private', 'proofs', 'proofs-1-photo.jpg'))).toBe(true);
    });

    it('refuses a path that escapes the upload root', async () => {
      await expect(service.save('avatars/../../../etc/passwd', Buffer.from('x'))).rejects.toThrow(
        /Invalid upload path/,
      );
    });
  });

  describe('openPrivate', () => {
    it('streams a private object', async () => {
      await service.save('proofs/p.jpg', Buffer.from('secret'));
      const stream = service.openPrivate('proofs/p.jpg');
      expect(stream).not.toBeNull();

      // Drain it rather than leaving the handle open: createReadStream opens
      // lazily, so an abandoned stream opens after afterEach has deleted the
      // temp directory and reports ENOENT against whatever test runs next.
      const content = await new Promise<string>((resolveContent, rejectContent) => {
        const chunks: Buffer[] = [];
        stream!
          .on('data', (chunk) => chunks.push(chunk as Buffer))
          .on('end', () => resolveContent(Buffer.concat(chunks).toString()))
          .on('error', rejectContent);
      });
      expect(content).toBe('secret');
    });

    it('returns null for a missing object', () => {
      expect(service.openPrivate('proofs/nope.jpg')).toBeNull();
    });

    it('refuses to serve public folders through the private route', async () => {
      await service.save('avatars/a.jpg', Buffer.from('x'));
      expect(service.openPrivate('avatars/a.jpg')).toBeNull();
    });

    it('refuses traversal out of the private root', () => {
      mkdirSync(join(root, 'uploads'), { recursive: true });
      writeFileSync(join(root, 'uploads', 'secret.txt'), 'x');
      expect(service.openPrivate('proofs/../../uploads/secret.txt')).toBeNull();
    });
  });

  describe('extractFilePathFromUrl', () => {
    it.each([
      ['/uploads/avatars/a.jpg', 'avatars/a.jpg'],
      ['/api/v1/files/proofs/p.jpg', 'proofs/p.jpg'],
      ['https://storage.googleapis.com/childrenevolvenext.firebasestorage.app/avatars/a.jpg', 'avatars/a.jpg'],
      [
        'https://firebasestorage.googleapis.com/v0/b/childrenevolvenext.firebasestorage.app/o/avatars%2Fa.jpg?alt=media',
        'avatars/a.jpg',
      ],
      ['avatars/a.jpg', 'avatars/a.jpg'],
    ])('normalizes %s', (input, expected) => {
      expect(service.extractFilePathFromUrl(input)).toBe(expected);
    });

    it('drops query strings from signed URLs', () => {
      const signed =
        'https://storage.googleapis.com/bucket/avatars/a.jpg?X-Goog-Signature=deadbeef&X-Goog-Expires=900';
      expect(service.extractFilePathFromUrl(signed)).toBe('avatars/a.jpg');
    });

    it('returns null for an unrelated URL', () => {
      expect(service.extractFilePathFromUrl('https://example.com/x.jpg')).toBeNull();
    });
  });

  describe('deleteFile', () => {
    it('deletes by the URL that was stored', async () => {
      const { url } = await service.save('avatars/a.jpg', Buffer.from('x'));
      expect(await service.deleteFile(url)).toBe(true);
      expect(existsSync(join(root, 'uploads', 'avatars', 'a.jpg'))).toBe(false);
    });

    it('deletes a row whose URL is still the pre-migration Firebase one', async () => {
      await service.save('avatars/a.jpg', Buffer.from('x'));
      const legacy = 'https://storage.googleapis.com/childrenevolvenext.firebasestorage.app/avatars/a.jpg';
      expect(await service.deleteFile(legacy)).toBe(true);
    });

    it('reports false for a missing file instead of throwing', async () => {
      // Deleting a child must not fail just because their avatar is gone.
      expect(await service.deleteFile('/uploads/avatars/missing.jpg')).toBe(false);
    });

    it('counts successes across a batch', async () => {
      await service.save('avatars/a.jpg', Buffer.from('x'));
      await service.save('avatars/b.jpg', Buffer.from('x'));
      const deleted = await service.deleteFiles([
        '/uploads/avatars/a.jpg',
        '/uploads/avatars/b.jpg',
        '/uploads/avatars/gone.jpg',
      ]);
      expect(deleted).toBe(2);
    });
  });
});
