/**
 * Repair createdAt/updatedAt on documents imported by an early run of
 * migrate-firestore-to-sqlite.
 *
 * The first version of the migration restored the original timestamps through
 * DocStore.updateSync — which deliberately strips createdAt so application
 * callers cannot spoof it. The restore therefore did nothing, and every
 * imported document ended up stamped with the moment of the import. Anything
 * ordered by createdAt (notifications, ledger history, task lists) lost its
 * ordering, and the day-attribution fallback in day-points.ts started treating
 * old entries as if they had been created today.
 *
 * This reads the original timestamps back out of Firestore and writes ONLY
 * those two fields, leaving every other field exactly as it is now. Documents
 * created after the cutover do not exist in Firestore and are left alone.
 *
 * Usage on the server:
 *   cd /home/odoo/crmproject/children/backend
 *   node dist/cli/repair-timestamps.js --dry-run
 *   node dist/cli/repair-timestamps.js
 *
 * Idempotent: re-running rewrites the same values.
 */

import '../config/env';
import { readFileSync } from 'fs';
import { DocStore } from '../db/doc-store.service';
import { COLLECTION_NAMES } from '../db/schema';
import { getFirebaseCredentials } from '../config/env-loader';

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'childrenevolvenext.firebasestorage.app';

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6)).toISOString();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

async function readOriginals(fromDump: string | null): Promise<Record<string, Map<string, { createdAt: string | null; updatedAt: string | null }>>> {
  const out: Record<string, Map<string, any>> = {};

  if (fromDump) {
    const raw = JSON.parse(readFileSync(fromDump, 'utf8'));
    for (const name of COLLECTION_NAMES) {
      const map = new Map();
      for (const doc of raw[name] || []) {
        map.set(doc.id, { createdAt: toIso(doc.createdAt), updatedAt: toIso(doc.updatedAt) });
      }
      out[name] = map;
    }
    return out;
  }

  const admin = require('firebase-admin');
  const serviceAccount = getFirebaseCredentials();
  if (!serviceAccount) throw new Error('No Firebase credentials — cannot read the original timestamps.');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: BUCKET });
  }
  const firestore = admin.firestore();

  for (const name of COLLECTION_NAMES) {
    const snapshot = await firestore.collection(name).get();
    const map = new Map();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      map.set(doc.id, { createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt) });
    }
    out[name] = map;
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const fromDump = (argv.find((a) => a.startsWith('--from-dump=')) || '').split('=')[1] || null;
  const dbPath = (argv.find((a) => a.startsWith('--db=')) || '').split('=')[1] || DocStore.resolveDbPath();

  console.log('=== repair createdAt/updatedAt ===');
  console.log('  mode:    ', dryRun ? 'DRY RUN (no writes)' : 'WRITE');
  console.log('  database:', dbPath);
  console.log('  source:  ', fromDump ? `dump ${fromDump}` : 'live Firestore');
  console.log('');

  const originals = await readOriginals(fromDump);

  const store = new DocStore();
  store.open(dbPath);
  const raw = store.raw;

  let repaired = 0;
  let alreadyCorrect = 0;
  let notInSource = 0;
  let noTimestamp = 0;

  for (const collection of COLLECTION_NAMES) {
    const source = originals[collection];
    const rows = raw.prepare(`SELECT id, doc FROM "${collection}"`).all() as { id: string; doc: string }[];
    if (rows.length === 0) continue;

    // json_set writes just these two paths; every other field keeps whatever
    // the running application has since written to it.
    const update = raw.prepare(
      `UPDATE "${collection}" SET doc = json_set(doc, '$.createdAt', ?, '$.updatedAt', ?) WHERE id = ?`,
    );

    let collectionRepaired = 0;
    const apply = raw.transaction(() => {
      for (const row of rows) {
        const original = source?.get(row.id);
        if (!original) {
          // Written after the cutover — nothing to restore.
          notInSource++;
          continue;
        }
        if (!original.createdAt && !original.updatedAt) {
          noTimestamp++;
          continue;
        }

        const current = JSON.parse(row.doc);
        const createdAt = original.createdAt ?? current.createdAt ?? null;
        const updatedAt = original.updatedAt ?? current.updatedAt ?? createdAt;

        if (current.createdAt === createdAt && current.updatedAt === updatedAt) {
          alreadyCorrect++;
          continue;
        }
        if (!dryRun) update.run(createdAt, updatedAt, row.id);
        collectionRepaired++;
      }
    });
    apply();

    repaired += collectionRepaired;
    if (collectionRepaired) {
      console.log(`  ${collection.padEnd(18)} ${String(collectionRepaired).padStart(6)} repaired / ${rows.length} rows`);
    }
  }

  console.log('');
  console.log(`  repaired:        ${repaired}`);
  console.log(`  already correct: ${alreadyCorrect}`);
  console.log(`  not in source:   ${notInSource}  (written after the cutover, left alone)`);
  console.log(`  no timestamp:    ${noTimestamp}`);

  if (!dryRun) {
    console.log('\n--- verification: distinct createdAt days per collection ---');
    for (const collection of COLLECTION_NAMES) {
      const n = store.countSync(collection);
      if (!n) continue;
      const days = raw
        .prepare(`SELECT COUNT(DISTINCT substr(json_extract(doc,'$.createdAt'), 1, 10)) AS d FROM "${collection}"`)
        .get() as { d: number };
      console.log(`  ${collection.padEnd(18)} ${String(days.d).padStart(4)} distinct day(s) across ${n} rows`);
    }
  }

  store.close();
  console.log('\nDone.');
}

main().catch((error) => {
  console.error('[repair] FAILED:', error);
  process.exit(1);
});
