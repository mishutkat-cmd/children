/**
 * Find every APPROVED completion whose EARN ledger entry never got
 * written (the `undefined`-in-metaJson regression killed createEntry
 * transactions silently for two days), and replay the award through
 * LedgerService.createEntry — which now strips undefined defensively,
 * so the same input goes through cleanly and bumps pointsBalance via
 * the same transactional path the normal flow uses.
 *
 * Idempotent: if a matching ledger entry already exists for the
 * completion (refType=COMPLETION, refId=completion.id, type=EARN), it
 * is skipped.
 *
 * Usage on the server, after deploying the fix:
 *   cd /home/odoo/crmproject/children/backend
 *   node dist/cli/backfill-missing-earn-entries.js
 */

import '../config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FirestoreService } from '../firestore/firestore.service';
import { LedgerService } from '../ledger/ledger.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const firestore = app.get(FirestoreService);
  const ledger = app.get(LedgerService);

  console.log('[backfill] scanning APPROVED completions...');
  const completions = await firestore.findMany('completions', { status: 'APPROVED' });
  console.log(`[backfill] candidates: ${completions.length}`);

  let scanned = 0;
  let skippedAlreadyHas = 0;
  let skippedNoPoints = 0;
  let skippedNoUser = 0;
  let healed = 0;
  let errors = 0;

  for (const c of completions) {
    scanned++;

    const points = c.pointsAwarded || 0;
    if (points <= 0) {
      skippedNoPoints++;
      continue;
    }

    // completion.childId is the childProfile.id; the ledger uses the
    // user's userId. Resolve.
    const childProfile = await firestore.findFirst('childProfiles', { id: c.childId });
    const userId = childProfile?.userId;
    if (!userId || typeof userId !== 'string') {
      skippedNoUser++;
      console.warn(`[backfill] no userId for completion=${c.id} childId=${c.childId}`);
      continue;
    }

    const existing = await firestore.findMany('ledgerEntries', {
      refType: 'COMPLETION',
      refId: c.id,
      type: 'EARN',
    });
    if (existing.length > 0) {
      skippedAlreadyHas++;
      continue;
    }

    const task = await firestore.findFirst('tasks', { id: c.taskId });

    try {
      await ledger.createEntry(
        c.familyId,
        userId,
        'EARN',
        'COMPLETION',
        points,
        c.id,
        {
          taskTitle: task?.title ?? 'Unknown',
          basePoints: task?.points ?? points,
          backfilled: true,
          backfilledAt: new Date().toISOString(),
        },
      );
      healed++;
      console.log(`[backfill] healed completion=${c.id} userId=${userId} +${points}`);
    } catch (err: any) {
      errors++;
      console.error(`[backfill] FAILED completion=${c.id} userId=${userId}: ${err?.message}`);
    }
  }

  console.log(
    `[backfill] DONE scanned=${scanned} healed=${healed} ` +
      `skipped_already_has=${skippedAlreadyHas} skipped_no_points=${skippedNoPoints} ` +
      `skipped_no_user=${skippedNoUser} errors=${errors}`,
  );

  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill] fatal:', err);
    process.exit(1);
  });
