import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FirestoreService } from '../firestore/firestore.service';

type LedgerType = 'EARN' | 'SPEND' | 'BONUS' | 'PENALTY' | 'ADJUST';

function computeBalanceDelta(type: LedgerType, amount: number): number {
  const a = amount || 0;
  if (type === 'EARN' || type === 'BONUS') return Math.abs(a);
  if (type === 'SPEND' || type === 'PENALTY') return -Math.abs(a);
  if (type === 'ADJUST') return a;
  return 0;
}

/**
 * Daily safety-net for the denormalized pointsBalance.
 *
 * Background: every createEntry/deleteLedgerEntry now writes to ledger
 * AND adjusts childProfiles.pointsBalance in one transaction. That makes
 * balance reads O(1), but introduces a failure mode where, if a future
 * bug ever lets an entry land without a matching increment (or vice
 * versa), the denormalized balance drifts from sum(ledger).
 *
 * This job runs once a day, compares the two for every child, and LOGS
 * mismatches. It does not auto-correct on its own — we want a human to
 * see a drift before silently overwriting it, in case the cause is the
 * profile being correct and the ledger being wrong instead.
 *
 * Operator action on a mismatch: hit the existing
 * `POST /ledger/fix-all-balances` endpoint, which deterministically
 * rebuilds pointsBalance from the ledger.
 */
@Injectable()
export class IntegrityCheckService {
  private readonly logger = new Logger(IntegrityCheckService.name);

  constructor(private firestore: FirestoreService) {}

  // 03:30 every night — after the midnight scheduler in TasksScheduler so
  // ADJUST entries it creates are already counted.
  @Cron('30 3 * * *')
  async checkBalanceIntegrity() {
    this.logger.log('[IntegrityCheck] Starting balance integrity check');

    let childrenChecked = 0;
    let mismatches = 0;

    try {
      const allChildren = await this.firestore.findMany('users', { role: 'CHILD' });

      for (const child of allChildren) {
        const childId = child.id;
        try {
          const [entries, profiles] = await Promise.all([
            this.firestore.findMany('ledgerEntries', { childId }),
            this.firestore.findMany('childProfiles', { userId: childId }),
          ]);
          if (profiles.length === 0) continue;

          const expected = entries.reduce(
            (sum: number, e: any) => sum + computeBalanceDelta(e.type, e.amount || 0),
            0,
          );
          const actual = profiles[0].pointsBalance || 0;
          childrenChecked++;

          if (expected !== actual) {
            mismatches++;
            this.logger.warn(
              `[IntegrityCheck] Balance drift: child=${childId} ` +
                `profile=${profiles[0].id} familyId=${child.familyId} ` +
                `actual=${actual} expected=${expected} diff=${expected - actual} ` +
                `entries=${entries.length}`,
            );
          }
        } catch (childErr: any) {
          this.logger.error(
            `[IntegrityCheck] Error checking child ${childId}: ${childErr?.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`[IntegrityCheck] Top-level failure: ${err?.message}`);
    }

    this.logger.log(
      `[IntegrityCheck] Done. Checked=${childrenChecked} Mismatches=${mismatches}`,
    );
  }
}
