import { Injectable, Logger } from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, promises as fsp, ReadStream } from 'fs';
import { dirname, join, normalize, resolve, sep } from 'path';

/**
 * File storage on the VPS's own disk — the replacement for Firebase Storage.
 *
 * Two folder classes, and the distinction is load-bearing:
 *
 *   public  (avatars, badges, rewards, wishlist, characters) — written under
 *           the web-served root and handed out as `/uploads/...`. These were
 *           already world-readable in Firebase (`makePublic()`), so nothing
 *           is being weakened.
 *
 *   private (proofs) — photos a child uploads as proof of a task. Firebase
 *           served these through short-lived signed URLs, i.e. NOT public.
 *           They are written outside the web-served root so no static handler
 *           can reach them, and are read back only through the authenticated
 *           route in UploadsController.
 */
@Injectable()
export class LocalStorageService {
  private readonly logger = new Logger(LocalStorageService.name);

  /** Folders whose contents may be served by the static handler. */
  static readonly PUBLIC_FOLDERS = ['avatars', 'badges', 'rewards', 'wishlist', 'characters'] as const;
  static readonly PRIVATE_FOLDERS = ['proofs', 'audio'] as const;

  /** Web-served root. Everything under it is reachable at `${publicBase}/...`. */
  get publicRoot(): string {
    return process.env.UPLOADS_PATH || join(process.cwd(), 'uploads');
  }

  /** Never web-served. Defaults to a sibling of the public root. */
  get privateRoot(): string {
    return process.env.UPLOADS_PRIVATE_PATH || join(dirname(this.publicRoot), 'uploads-private');
  }

  get publicBase(): string {
    return (process.env.UPLOADS_PUBLIC_BASE || '/uploads').replace(/\/$/, '');
  }

  static isPublicFolder(folder: string): boolean {
    return (LocalStorageService.PUBLIC_FOLDERS as readonly string[]).includes(folder);
  }

  private rootFor(folder: string): string {
    return LocalStorageService.isPublicFolder(folder) ? this.publicRoot : this.privateRoot;
  }

  /**
   * Resolve a relative object path against a root, refusing anything that
   * escapes it. Paths here originate in stored URLs, so `../../etc/passwd`
   * must not be able to reach outside the upload directories.
   */
  private safeJoin(root: string, relativePath: string): string | null {
    // Normalize and then CHECK — deliberately no "strip the leading ../"
    // sanitizing step. Stripping would rewrite `avatars/../../../etc/passwd`
    // into `etc/passwd`, which lands back inside the root and so passes the
    // containment check: the sanitizer defeats the guard, and the file ends
    // up somewhere the returned URL does not point to. Refusing is the only
    // safe answer for a path that escapes.
    const target = resolve(root, normalize(relativePath));
    const base = resolve(root);
    if (target !== base && !target.startsWith(base + sep)) {
      this.logger.warn(`Refusing path outside the upload root: ${relativePath}`);
      return null;
    }
    return target;
  }

  /**
   * Persist an uploaded buffer. `objectPath` is the folder-prefixed name the
   * caller already built (e.g. `avatars/avatars-123-photo.jpg`), so URLs stay
   * in the same shape they had in Firebase Storage.
   */
  async save(objectPath: string, buffer: Buffer): Promise<{ url: string; path: string }> {
    const folder = objectPath.split('/')[0];
    const root = this.rootFor(folder);
    const target = this.safeJoin(root, objectPath);
    if (!target) throw new Error(`Invalid upload path: ${objectPath}`);

    mkdirSync(dirname(target), { recursive: true });
    await fsp.writeFile(target, buffer);

    const url = LocalStorageService.isPublicFolder(folder)
      ? `${this.publicBase}/${objectPath}`
      : `/api/v1/files/${objectPath}`;

    this.logger.log(`Stored ${objectPath} (${buffer.length} bytes)`);
    return { url, path: target };
  }

  /**
   * Identify a stored file by its leading bytes, restricted to the image types
   * the upload endpoint accepts.
   *
   * Deliberately not derived from the file extension: the extension comes from
   * a client-supplied filename, and trusting it to pick a Content-Type would
   * hand an attacker the ability to have their bytes served as any type they
   * like. Returns null for anything that is not one of the four known types,
   * which the caller turns into a 404.
   */
  async sniffContentType(objectPath: string): Promise<string | null> {
    const folder = objectPath.split('/')[0];
    const target = this.safeJoin(this.rootFor(folder), objectPath);
    if (!target) return null;

    let handle: fsp.FileHandle | undefined;
    try {
      handle = await fsp.open(target, 'r');
      const buffer = Buffer.alloc(12);
      const { bytesRead } = await handle.read(buffer, 0, 12, 0);
      if (bytesRead < 12) return null;

      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
      if (
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
      ) return 'image/png';
      if (
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
        (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
      ) return 'image/gif';
      if (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
      ) return 'image/webp';

      // Аудио-записи ребёнка: контейнер MP4/M4A начинается с box 'ftyp'
      // (байты 4..8), запись expo-audio на iOS и Android ложится именно в него.
      if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return 'audio/mp4';
      }

      return null;
    } catch {
      return null;
    } finally {
      await handle?.close();
    }
  }

  /** Open a private object for streaming. Returns null when it does not exist. */
  openPrivate(objectPath: string): ReadStream | null {
    const folder = objectPath.split('/')[0];
    if (LocalStorageService.isPublicFolder(folder)) return null;
    const target = this.safeJoin(this.privateRoot, objectPath);
    if (!target || !existsSync(target)) return null;
    return createReadStream(target);
  }

  /**
   * Delete by stored URL or bare path. Accepts the local `/uploads/...` form
   * and the legacy Firebase URLs, because rows written before the migration
   * may still carry the old shape.
   */
  async deleteFile(urlOrPath: string): Promise<boolean> {
    if (!urlOrPath) return false;

    const objectPath = this.extractFilePathFromUrl(urlOrPath);
    if (!objectPath) {
      this.logger.warn(`Could not derive a path from: ${urlOrPath}`);
      return false;
    }

    const folder = objectPath.split('/')[0];
    const target = this.safeJoin(this.rootFor(folder), objectPath);
    if (!target) return false;

    try {
      await fsp.unlink(target);
      this.logger.log(`Deleted ${objectPath}`);
      return true;
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        this.logger.warn(`File does not exist: ${objectPath}`);
        return false;
      }
      // Deliberately non-fatal: a failed file delete must never block deleting
      // the database row that points at it.
      this.logger.error(`Error deleting ${objectPath}: ${error.message}`);
      return false;
    }
  }

  async deleteFiles(urlsOrPaths: string[]): Promise<number> {
    if (!urlsOrPaths?.length) return 0;
    const results = await Promise.allSettled(urlsOrPaths.map((u) => this.deleteFile(u)));
    const deleted = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
    this.logger.log(`Deleted ${deleted}/${urlsOrPaths.length} files`);
    return deleted;
  }

  /**
   * Normalize any URL shape this product has ever stored down to an object
   * path like `avatars/x.jpg`.
   */
  extractFilePathFromUrl(url: string): string | null {
    if (!url) return null;

    const stripQuery = (s: string) => s.split('?')[0].split('#')[0];

    // Current local forms.
    if (url.startsWith(`${this.publicBase}/`)) {
      return decodeURIComponent(stripQuery(url.slice(this.publicBase.length + 1)));
    }
    if (url.startsWith('/api/v1/files/')) {
      return decodeURIComponent(stripQuery(url.slice('/api/v1/files/'.length)));
    }

    // Legacy Firebase forms.
    const direct = url.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/);
    if (direct) return decodeURIComponent(stripQuery(direct[1]));

    const api = url.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)/);
    if (api) return decodeURIComponent(api[1]);

    // A bare relative path.
    if (!url.includes('://')) return decodeURIComponent(stripQuery(url.replace(/^\//, '')));

    return null;
  }
}
