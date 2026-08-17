import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Short-lived signed URLs for private files.
 *
 * Proof photos are displayed with a plain `<img src={proofUrl}>` and opened
 * with `window.open`. Neither sends an Authorization header, so a route that
 * only accepts a Bearer token cannot serve them at all — the images would be
 * 401 for every user.
 *
 * Firebase solved this with expiring signed URLs; this is the same idea. The
 * signature IS the authorization: a URL is only ever handed to a caller who
 * was already allowed to see the completion it belongs to, and it stops
 * working shortly afterwards.
 *
 * The key is derived from JWT_SECRET rather than being a new secret to
 * manage. It is domain-separated so a file signature can never be confused
 * with anything else signed by the same secret.
 */

const DEFAULT_TTL_SECONDS = 60 * 60;

function signingKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // The app already refuses to boot without JWT_SECRET (see JwtStrategy);
    // this is a guard against being called from a script that skipped that.
    throw new Error('JWT_SECRET is required to sign file URLs');
  }
  return createHmac('sha256', secret).update('children:file-url:v1').digest();
}

function computeSignature(objectPath: string, expiresAt: number): string {
  return createHmac('sha256', signingKey())
    .update(`${objectPath}\n${expiresAt}`)
    .digest('base64url');
}

/** `proofs/x.jpg` -> `/api/v1/files/proofs/x.jpg?exp=...&sig=...` */
export function signFileUrl(objectPath: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = computeSignature(objectPath, expiresAt);
  const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
  return `/api/v1/files/${encoded}?exp=${expiresAt}&sig=${signature}`;
}

/** Re-sign a URL we previously produced (or a bare stored path). */
export function signFileUrlFromStored(storedUrl: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const withoutQuery = storedUrl.split('?')[0];
  const objectPath = withoutQuery.startsWith('/api/v1/files/')
    ? decodeURIComponent(withoutQuery.slice('/api/v1/files/'.length))
    : withoutQuery.replace(/^\//, '');
  return signFileUrl(objectPath, ttlSeconds);
}

export function verifyFileSignature(
  objectPath: string,
  exp: string | undefined,
  sig: string | undefined,
): boolean {
  if (!exp || !sig) return false;

  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt)) return false;
  if (expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(computeSignature(objectPath, expiresAt));
  const provided = Buffer.from(sig);
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/**
 * Canonical form for storage: the bare path, with any signature stripped.
 *
 * The upload endpoint returns a signed URL (so the uploader can preview the
 * file straight away) and clients post that value back when they attach it to
 * a record. Persisting it would bake in an expiry, and the stored string would
 * no longer match the object it names.
 */
export function normalizePrivateFileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const withoutQuery = url.split('?')[0];
  return withoutQuery || null;
}
