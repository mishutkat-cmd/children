import {
  computeBalanceDelta,
  computeTotalEarnedDelta,
  LedgerType,
} from './balance-delta';

/**
 * These tests are the single guardrail against the denormalized
 * pointsBalance and the integrity-check recompute disagreeing about how
 * a ledger entry signs. If a future "small refactor" of this function
 * changes any of the cases below, the live invariant breaks silently in
 * prod (and the cron will start screaming a day later).
 *
 * Behavior we are pinning down:
 *   EARN/BONUS:    always +|amount| (positive even if a buggy caller passed -10)
 *   SPEND/PENALTY: always -|amount| (negative even if a buggy caller passed -10)
 *   ADJUST:        passthrough — sign respected as given (it's the only
 *                  type a caller can use to move balance either direction)
 *   unknown type:  0 (silent, so a bad-data row doesn't crash a sum)
 */
describe('computeBalanceDelta', () => {
  describe('EARN — always positive', () => {
    it.each([
      [10, 10],
      [0, 0],
      [-7, 7], // caller bug: still positive
    ])('EARN(%i) -> %i', (input, expected) => {
      expect(computeBalanceDelta('EARN', input)).toBe(expected);
    });
  });

  describe('BONUS — always positive (alias of EARN sign-wise)', () => {
    it.each([
      [5, 5],
      [-5, 5],
    ])('BONUS(%i) -> %i', (input, expected) => {
      expect(computeBalanceDelta('BONUS', input)).toBe(expected);
    });
  });

  describe('SPEND — always negative', () => {
    it.each([
      [10, -10],
      [-10, -10], // already negative — should stay negative
      [0, 0],
    ])('SPEND(%i) -> %i', (input, expected) => {
      expect(computeBalanceDelta('SPEND', input)).toBe(expected);
    });
  });

  describe('PENALTY — always negative', () => {
    it.each([
      [3, -3],
      [-3, -3],
    ])('PENALTY(%i) -> %i', (input, expected) => {
      expect(computeBalanceDelta('PENALTY', input)).toBe(expected);
    });
  });

  describe('ADJUST — passthrough (only signed type)', () => {
    it.each([
      [10, 10],
      [-10, -10],
      [0, 0],
    ])('ADJUST(%i) -> %i', (input, expected) => {
      expect(computeBalanceDelta('ADJUST', input)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('NaN amount collapses to 0', () => {
      expect(computeBalanceDelta('EARN', NaN as any)).toBe(0);
    });

    it('undefined amount collapses to 0', () => {
      expect(computeBalanceDelta('SPEND', undefined as any)).toBe(0);
    });

    it('unknown type returns 0 (silent — bad-data rows must not poison a sum)', () => {
      expect(computeBalanceDelta('GIBBERISH' as LedgerType, 999)).toBe(0);
    });
  });

  describe('integrity-check property: signs match the denormalization writer', () => {
    // The cron audits sum(ledger) by feeding every entry through this
    // same function. If we change a rule here, both sides shift the same
    // way and the invariant holds — but we still want a regression test
    // that explicitly fixes the sign matrix.
    const matrix: Array<[LedgerType, number, number]> = [
      ['EARN', 100, 100],
      ['BONUS', 50, 50],
      ['SPEND', 30, -30],
      ['PENALTY', 20, -20],
      ['ADJUST', 7, 7],
      ['ADJUST', -7, -7],
    ];
    it.each(matrix)('%s(%i) -> %i', (type, amount, expected) => {
      expect(computeBalanceDelta(type, amount)).toBe(expected);
    });
  });
});

/**
 * totalEarned is a denormalized lifetime EARN+BONUS counter on
 * childProfiles. It exists so BadgesService can answer "how many points
 * has this child ever earned" in O(1) instead of scanning the full
 * ledger. Crucially, ONLY EARN and BONUS count — SPEND/PENALTY/ADJUST
 * are bookkeeping or outflows and must not move the counter.
 *
 * If a regression here ever lets SPEND or PENALTY contribute, badge
 * progress for POINTS-type badges starts disagreeing with the legacy
 * reducer over time, and the integrity-check cron will flag drift
 * forever. These tests pin the sign matrix.
 */
describe('computeTotalEarnedDelta', () => {
  it.each([
    ['EARN', 10, 10],
    ['EARN', 0, 0],
    ['EARN', -7, 7], // caller bug — still counts as positive earn
    ['BONUS', 5, 5],
    ['BONUS', -5, 5],
  ])('counts %s(%i) as +%i', (type, input, expected) => {
    expect(computeTotalEarnedDelta(type as LedgerType, input)).toBe(expected);
  });

  it.each([
    ['SPEND', 10],
    ['SPEND', -10],
    ['PENALTY', 3],
    ['PENALTY', -3],
    ['ADJUST', 7],
    ['ADJUST', -7],
    ['ADJUST', 0],
  ])('does NOT count %s(%i)', (type, input) => {
    expect(computeTotalEarnedDelta(type as LedgerType, input)).toBe(0);
  });

  it('NaN / undefined amount collapse to 0', () => {
    expect(computeTotalEarnedDelta('EARN', NaN as any)).toBe(0);
    expect(computeTotalEarnedDelta('BONUS', undefined as any)).toBe(0);
  });

  it('unknown type returns 0', () => {
    expect(computeTotalEarnedDelta('GIBBERISH' as LedgerType, 999)).toBe(0);
  });
});
