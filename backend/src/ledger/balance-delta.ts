/**
 * Single source of truth for how a ledger entry (type + raw amount)
 * translates to a signed delta on childProfiles.pointsBalance.
 *
 * Both LedgerService.createEntry/deleteLedgerEntry (the transactional
 * writer that maintains the denormalized balance) and
 * IntegrityCheckService.checkBalanceIntegrity (the nightly auditor that
 * recomputes sum(ledger) for comparison) MUST use this function —
 * otherwise the live balance and the recomputed expected balance will
 * disagree by construction, and integrity checks will scream forever.
 */

export type LedgerType = 'EARN' | 'SPEND' | 'BONUS' | 'PENALTY' | 'ADJUST';

export function computeBalanceDelta(type: LedgerType, amount: number): number {
  const a = amount || 0;
  if (type === 'EARN' || type === 'BONUS') return Math.abs(a);
  // `|| 0` collapses the JavaScript `-0` that `-Math.abs(0)` yields back
  // to a plain `0`. Mathematically a no-op, but it keeps the function's
  // sign invariant clean for downstream strict-equality checks.
  if (type === 'SPEND' || type === 'PENALTY') return -Math.abs(a) || 0;
  if (type === 'ADJUST') return a;
  return 0;
}

/**
 * Lifetime-earned counter delta. Unlike `computeBalanceDelta`, this only
 * counts inflow (EARN + BONUS). Used to keep a denormalized
 * `childProfiles.totalEarned` field that mirrors sum(EARN+BONUS over all
 * time) — Badge progress for POINTS-type badges asks this question every
 * time it runs, and reading a denormalized counter is O(1) vs. the legacy
 * O(history) full-ledger scan it replaces.
 *
 * ADJUST is intentionally excluded — it's used as a correcting bookkeeping
 * entry (cancellations etc.) and isn't a "real" earn for badge purposes.
 */
export function computeTotalEarnedDelta(type: LedgerType, amount: number): number {
  if (type !== 'EARN' && type !== 'BONUS') return 0;
  return Math.abs(amount || 0);
}
