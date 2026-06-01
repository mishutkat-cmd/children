import {
  getCached,
  setCached,
  invalidateFamilySettingsCache,
} from './family-settings-cache';

/**
 * Cache semantics we depend on:
 *   - miss returns undefined (caller knows to refetch),
 *   - set + immediate get returns the same value,
 *   - expiry: after TTL passes, getCached behaves as a miss,
 *   - invalidate erases a single key without touching others,
 *   - cached value is returned by reference (caller can mutate it; we
 *     accept that because conversionRate is rarely mutated and this is
 *     a process-local optimization, not a contract).
 *
 * The cache TTL is currently 60 000ms; we drive time via Jest's modern
 * fake timers so the test runs instantly.
 */
describe('familySettingsCache', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
    // Reset between tests — internal Map persists across imports.
    invalidateFamilySettingsCache('fam-a');
    invalidateFamilySettingsCache('fam-b');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('miss returns undefined for an unset key', () => {
    expect(getCached('fam-a')).toBeUndefined();
  });

  it('set + get round-trip returns the stored value', () => {
    setCached('fam-a', { conversionRate: 10 });
    expect(getCached('fam-a')).toEqual({ conversionRate: 10 });
  });

  it('expires after the TTL (60s)', () => {
    setCached('fam-a', { conversionRate: 10 });
    jest.advanceTimersByTime(59_999);
    expect(getCached('fam-a')).toEqual({ conversionRate: 10 }); // still warm
    jest.advanceTimersByTime(2);
    expect(getCached('fam-a')).toBeUndefined(); // crossed TTL
  });

  it('invalidate removes a single key without touching siblings', () => {
    setCached('fam-a', { conversionRate: 10 });
    setCached('fam-b', { conversionRate: 20 });
    invalidateFamilySettingsCache('fam-a');
    expect(getCached('fam-a')).toBeUndefined();
    expect(getCached('fam-b')).toEqual({ conversionRate: 20 });
  });

  it('invalidate is safe on an unset key (no throw)', () => {
    expect(() => invalidateFamilySettingsCache('fam-never-set')).not.toThrow();
  });

  it('storing null is a real value, distinct from miss', () => {
    // The loader stores `null` when familySettings doc does not exist for
    // a family — that's a real cache entry that should suppress a refetch
    // for the next TTL window.
    setCached('fam-a', null);
    expect(getCached('fam-a')).toBeNull();
    expect(getCached('fam-a')).not.toBeUndefined();
  });

  it('overwriting refreshes the expiry', () => {
    setCached('fam-a', { conversionRate: 10 });
    jest.advanceTimersByTime(59_000);
    setCached('fam-a', { conversionRate: 99 });
    jest.advanceTimersByTime(59_000); // 118s total since first set, but only 59s since latest
    expect(getCached('fam-a')).toEqual({ conversionRate: 99 });
  });
});
