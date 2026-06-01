/**
 * Tiny in-memory TTL cache for the `familySettings` Firestore document.
 * Lives in its own module (not children.service) to avoid the circular
 * import that would otherwise form: ChildrenService depends on
 * MotivationService (constructor), and MotivationService is the writer
 * that needs to invalidate this cache.
 *
 * Single-process assumption: there is one PM2 worker for this service.
 * If that ever changes, replace this with a shared store (Redis, etc).
 */

const TTL_MS = 60_000;

const store = new Map<string, { value: any; expiresAt: number }>();

export function getCached(familyId: string): any | undefined {
  const hit = store.get(familyId);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(familyId);
    return undefined;
  }
  return hit.value;
}

export function setCached(familyId: string, value: any): void {
  store.set(familyId, { value, expiresAt: Date.now() + TTL_MS });
}

export function invalidateFamilySettingsCache(familyId: string): void {
  store.delete(familyId);
}
