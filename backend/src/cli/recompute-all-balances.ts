/**
 * One-shot CLI: recompute pointsBalance for every child across every
 * family, from the ledger. Run this ONCE after deploying the
 * denormalized-balance commit so the first transactional increment
 * doesn't extend a stale value.
 *
 * Usage on the server:
 *   cd /home/odoo/crmproject/children/backend
 *   node dist/cli/recompute-all-balances.js
 *
 * Safe to re-run — it's deterministic and idempotent.
 */

import '../config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FirestoreService } from '../firestore/firestore.service';
import { LedgerService } from '../ledger/ledger.service';
import { fixAllBalancesForFamily } from '../ledger/fix-balances.script';

async function main() {
  // NestFactory.createApplicationContext spins up DI without starting an
  // HTTP listener — exactly what a one-off script wants.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const firestore = app.get(FirestoreService);
  const ledgerService = app.get(LedgerService);

  console.log('[recompute-all] Gathering families...');
  const parents = await firestore.findMany('users', { role: 'PARENT' });
  const familyIds = Array.from(new Set(parents.map((p: any) => p.familyId).filter(Boolean)));
  console.log(`[recompute-all] Found ${familyIds.length} families`);

  let totalFixed = 0;
  let totalErrors = 0;

  for (const familyId of familyIds) {
    try {
      const result = await fixAllBalancesForFamily(firestore, ledgerService, familyId);
      totalFixed += result.fixed || 0;
      totalErrors += result.errors || 0;
      console.log(
        `[recompute-all] family=${familyId} fixed=${result.fixed} errors=${result.errors} skipped=${result.skipped}`,
      );
    } catch (err: any) {
      totalErrors++;
      console.error(`[recompute-all] family=${familyId} FAILED:`, err?.message);
    }
  }

  console.log(
    `[recompute-all] DONE. Families=${familyIds.length} ChildrenFixed=${totalFixed} Errors=${totalErrors}`,
  );

  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[recompute-all] Fatal:', err);
    process.exit(1);
  });
