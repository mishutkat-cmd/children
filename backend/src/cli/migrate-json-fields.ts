/**
 * One-shot CLI: rewrite every Firestore document where a JSON-string
 * field still carries a stringified blob (legacy from before the
 * "native types" commit) back as a real Firestore map/array.
 *
 * Idempotent — safe to re-run. Only touches docs that still need it
 * (typeof === 'string'); skips already-migrated ones.
 *
 * Usage on the server:
 *   cd /home/odoo/crmproject/children/backend
 *   node dist/cli/migrate-json-fields.js
 *
 * Fields covered (collection → field):
 *   childProfiles → streakState        (object map)
 *   tasks         → daysOfWeek         (number[])
 *   challenges    → ruleJson           (object)
 *   challenges    → rewardJson         (object)
 *   challenges    → participantsJson   (string[])
 *   ledgerEntries → metaJson           (object)
 */

import '../config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FirestoreService } from '../firestore/firestore.service';

const TARGETS: Array<{ collection: string; fields: string[]; defaultFor: (f: string) => any }> = [
  { collection: 'childProfiles', fields: ['streakState'], defaultFor: () => ({}) },
  { collection: 'tasks', fields: ['daysOfWeek'], defaultFor: () => null },
  {
    collection: 'challenges',
    fields: ['ruleJson', 'rewardJson', 'participantsJson'],
    defaultFor: (f) => (f === 'participantsJson' ? [] : {}),
  },
  { collection: 'ledgerEntries', fields: ['metaJson'], defaultFor: () => null },
];

function tryParse(raw: string, fallback: any): any {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const firestore = app.get(FirestoreService);

  let totalScanned = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const target of TARGETS) {
    console.log(`[migrate-json] ${target.collection}: scanning...`);
    let scanned = 0;
    let migrated = 0;

    let docs: any[] = [];
    try {
      docs = await firestore.findMany(target.collection, {});
    } catch (err: any) {
      console.error(`[migrate-json] ${target.collection}: list failed: ${err?.message}`);
      totalErrors++;
      continue;
    }

    for (const doc of docs) {
      scanned++;
      const updates: Record<string, any> = {};
      for (const field of target.fields) {
        const raw = doc[field];
        if (typeof raw === 'string') {
          updates[field] = tryParse(raw, target.defaultFor(field));
        }
      }
      if (Object.keys(updates).length === 0) continue;

      try {
        await firestore.update(target.collection, doc.id, updates);
        migrated++;
        console.log(
          `[migrate-json] ${target.collection}/${doc.id} migrated fields: ${Object.keys(updates).join(', ')}`,
        );
      } catch (err: any) {
        console.error(
          `[migrate-json] ${target.collection}/${doc.id} update failed: ${err?.message}`,
        );
        totalErrors++;
      }
    }

    const skipped = scanned - migrated;
    totalScanned += scanned;
    totalMigrated += migrated;
    totalSkipped += skipped;
    console.log(
      `[migrate-json] ${target.collection}: scanned=${scanned} migrated=${migrated} skipped=${skipped}`,
    );
  }

  console.log(
    `[migrate-json] DONE. Scanned=${totalScanned} Migrated=${totalMigrated} Skipped=${totalSkipped} Errors=${totalErrors}`,
  );

  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate-json] Fatal:', err);
    process.exit(1);
  });
