/**
 * Run the retention sweep by hand.
 *
 * The same code the nightly cron runs, so a dry run here tells you exactly
 * what the cron will do tonight.
 *
 *   node dist/cli/retention.js --dry-run
 *   node dist/cli/retention.js
 *
 * Windows come from the environment:
 *   NOTIFICATIONS_RETENTION_DAYS  default 30
 *   COMPLETIONS_RETENTION_DAYS    default 0 (off — see retention.service.ts)
 */

import '../config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RetentionService } from '../retention/retention.service';
import { DocStore } from '../db/doc-store.service';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const retention = app.get(RetentionService);
  const db = app.get(DocStore);

  const notificationDays = RetentionService.windowDays('NOTIFICATIONS_RETENTION_DAYS', 30);
  const completionDays = RetentionService.windowDays('COMPLETIONS_RETENTION_DAYS', 0);

  console.log('=== retention ===');
  console.log('  mode:         ', dryRun ? 'DRY RUN (no writes)' : 'WRITE');
  console.log('  notifications:', notificationDays > 0 ? `keep ${notificationDays} days` : 'disabled');
  console.log('  completions:  ', completionDays > 0 ? `keep ${completionDays} days` : 'disabled');
  console.log('');

  const notificationsBefore = db.countSync('notifications');
  const completionsBefore = db.countSync('completions');

  const notifications = await retention.sweepNotifications(dryRun);
  const completions = await retention.sweepCompletions(dryRun);

  const verb = dryRun ? 'would remove' : 'removed';
  console.log(`  notifications: ${verb} ${notifications} of ${notificationsBefore}  ->  ${notificationsBefore - notifications} left`);
  console.log(`  completions:   ${verb} ${completions} of ${completionsBefore}  ->  ${completionsBefore - completions} left`);

  if (completions > 0) {
    // Worth stating plainly: this is not housekeeping, it removes the record
    // the rest of the product reads.
    console.log('');
    console.log('  NOTE: completions are referenced by ledger entries, counted by badge');
    console.log('        conditions, and totalled as "tasks completed" for parents.');
    console.log('        Removing them changes those figures permanently.');
  }

  await app.close();
  process.exit(0);
}

main().catch((error) => {
  console.error('[retention] FAILED:', error);
  process.exit(1);
});
