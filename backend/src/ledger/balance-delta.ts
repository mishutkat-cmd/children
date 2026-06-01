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
