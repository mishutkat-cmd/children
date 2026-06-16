/**
 * One-shot CLI: for every childProfile, compute
 *   totalEarned     = sum of EARN + BONUS amounts across all ledger entries
 *   lastCompletionAt = createdAt of the most recent COMPLETION-refType entry
 * and write both back to the profile. Run ONCE after the denormalization
 * commit so the first new createEntry transaction starts from real
 * values instead of from missing fields.
 *
 *   cd /home/odoo/crmproject/children/backend
 *   node dist/cli/backfill-totalearned-lastcompletion.js
 *
 * Idempotent — safe to re-run. Doesn't touch pointsBalance (handled by
 * recompute-all-balances.js which was already shipped in Phase 1).
 */

import '../config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FirestoreService } from '../firestore/firestore.service';
import { computeTotalEarnedDelta } from '../ledger/balance-delta';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const firestore = app.get(FirestoreService);

  console.log('[backfill-totals] loading childProfiles...');
  const profiles = await firestore.findMany('childProfiles', {});
  console.log(`[backfill-totals] profiles=${profiles.length}`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const profile of profiles) {
    const userId = profile.userId;
    if (!userId || typeof userId !== 'string') {
      console.warn(`[backfill-totals] skip profile=${profile.id} — non-string userId`);
      skipped++;
      continue;
    }
    try {
      const entries = await firestore.findMany('ledgerEntries', { childId: userId });

      let totalEarned = 0;
      let lastCompletionAt: Date | null = null;
      for (const e of entries) {
        totalEarned += computeTotalEarnedDelta(e.type, e.amount || 0);
        if (e.refType === 'COMPLETION') {
          const created = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
          if (
            !isNaN(created.getTime()) &&
            (!lastCompletionAt || created > lastCompletionAt)
          ) {
            lastCompletionAt = created;
          }
        }
      }

      const patch: Record<string, any> = { totalEarned };
      if (lastCompletionAt) patch.lastCompletionAt = lastCompletionAt;
      await firestore.update('childProfiles', profile.id, patch);
      updated++;
      console.log(
        `[backfill-totals] profile=${profile.id} userId=${userId} ` +
          `totalEarned=${totalEarned} ` +
          `lastCompletionAt=${lastCompletionAt?.toISOString() ?? 'none'} ` +
          `(scanned ${entries.length} entries)`,
      );
    } catch (err: any) {
      errors++;
      console.error(`[backfill-totals] profile=${profile.id} FAILED: ${err?.message}`);
    }
  }

  console.log(
    `[backfill-totals] DONE updated=${updated} skipped=${skipped} errors=${errors}`,
  );
  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill-totals] fatal:', err);
    process.exit(1);
  });
