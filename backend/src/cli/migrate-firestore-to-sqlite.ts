/**
 * One-shot migration: Firestore + Firebase Storage  ->  local SQLite + local disk.
 *
 * Usage on the server:
 *   cd /home/odoo/crmproject/children/backend
 *   node dist/cli/migrate-firestore-to-sqlite.js --dry-run     # inspect first
 *   node dist/cli/migrate-firestore-to-sqlite.js               # do it
 *
 * Options:
 *   --dry-run              read and report, write nothing
 *   --db=<path>            target SQLite file (default: $DATABASE_PATH or ./data/children.db)
 *   --uploads=<path>       target file directory (default: ./uploads)
 *   --public-base=<prefix> URL prefix the rewritten links use (default: /uploads)
 *   --skip-files           migrate documents only, leave storage URLs untouched
 *   --from-dump=<file>     read documents from a JSON dump instead of live Firestore
 *
 * Idempotent: documents are written by primary key, so re-running re-syncs
 * rather than duplicating. Run it once with the app stopped for the real
 * cutover, so no writes land in Firestore after the snapshot is taken.
 */

import '../config/env';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { DocStore } from '../db/doc-store.service';
import { COLLECTION_NAMES } from '../db/schema';
import { getFirebaseCredentials } from '../config/env-loader';

interface Options {
  dryRun: boolean;
  dbPath: string;
  uploadsDir: string;
  publicBase: string;
  skipFiles: boolean;
  fromDump: string | null;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string): string | null => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    dryRun: argv.includes('--dry-run'),
    dbPath: get('db') || DocStore.resolveDbPath(),
    uploadsDir: get('uploads') || join(process.cwd(), 'uploads'),
    publicBase: (get('public-base') || '/uploads').replace(/\/$/, ''),
    skipFiles: argv.includes('--skip-files'),
    fromDump: get('from-dump'),
  };
}

/** Firestore Timestamps arrive as {_seconds,_nanoseconds} or as Timestamp instances. */
function normalizeValue(value: any): any {
  if (value === null || value === undefined) return value;

  if (typeof value.toDate === 'function') return value.toDate().toISOString();

  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6)).toISOString();
  }

  // A DocumentReference would silently serialize to junk; surface it instead.
  if (typeof value === 'object' && value.constructor?.name === 'DocumentReference') {
    return String(value.path);
  }

  if (Array.isArray(value)) return value.map(normalizeValue);

  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeValue(v);
    return out;
  }

  return value;
}

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'childrenevolvenext.firebasestorage.app';

/**
 * Rewrite a Firebase Storage URL to the local path. Both URL shapes the app
 * has produced over time are handled:
 *   https://storage.googleapis.com/<bucket>/avatars/x.jpg
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/avatars%2Fx.jpg?alt=media
 * Anything else is left exactly as-is.
 */
function rewriteUrl(value: string, publicBase: string): { url: string; objectPath: string | null } {
  const direct = `https://storage.googleapis.com/${BUCKET}/`;
  if (value.startsWith(direct)) {
    const objectPath = decodeURIComponent(value.slice(direct.length).split('?')[0].split('#')[0]);
    return { url: `${publicBase}/${objectPath}`, objectPath };
  }

  const apiMatch = value.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?#]+)/);
  if (apiMatch && apiMatch[1] === BUCKET) {
    const objectPath = decodeURIComponent(apiMatch[2]);
    return { url: `${publicBase}/${objectPath}`, objectPath };
  }

  return { url: value, objectPath: null };
}

/** Walk every string in a document and localize storage URLs. */
function rewriteDoc(
  value: any,
  publicBase: string,
  referenced: Set<string>,
): any {
  if (typeof value === 'string') {
    const { url, objectPath } = rewriteUrl(value, publicBase);
    if (objectPath) referenced.add(objectPath);
    return url;
  }
  if (Array.isArray(value)) return value.map((v) => rewriteDoc(v, publicBase, referenced));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteDoc(v, publicBase, referenced);
    return out;
  }
  return value;
}

async function readFromFirestore(): Promise<{ docs: Record<string, any[]>; unknown: string[] }> {
  const admin = require('firebase-admin');
  const serviceAccount = getFirebaseCredentials();
  if (!serviceAccount) throw new Error('No Firebase credentials — cannot read the source data.');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: BUCKET });
  }
  const firestore = admin.firestore();

  // Anything in Firestore that the local schema doesn't know about would be
  // dropped silently. Detect it and let the operator decide.
  const live = await firestore.listCollections();
  const liveNames = live.map((c: any) => c.id);
  const unknown = liveNames.filter((n: string) => !COLLECTION_NAMES.includes(n));

  const docs: Record<string, any[]> = {};
  for (const name of COLLECTION_NAMES) {
    const snapshot = await firestore.collection(name).get();
    docs[name] = snapshot.docs.map((d: any) => ({ id: d.id, ...normalizeValue(d.data()) }));
  }
  return { docs, unknown };
}

function readFromDump(path: string): { docs: Record<string, any[]>; unknown: string[] } {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const docs: Record<string, any[]> = {};
  for (const name of COLLECTION_NAMES) {
    docs[name] = (raw[name] || []).map((d: any) => normalizeValue(d));
  }
  const unknown = Object.keys(raw).filter((n) => !COLLECTION_NAMES.includes(n));
  return { docs, unknown };
}

async function downloadFiles(uploadsDir: string, referenced: Set<string>, dryRun: boolean) {
  const admin = require('firebase-admin');
  const bucket = admin.storage().bucket(BUCKET);
  const [files] = await bucket.getFiles();

  let downloaded = 0;
  let bytes = 0;
  const present = new Set<string>();

  for (const file of files) {
    present.add(file.name);
    if (file.name.endsWith('/')) continue; // directory placeholder

    const target = join(uploadsDir, file.name);
    bytes += Number(file.metadata?.size || 0);

    if (dryRun) {
      downloaded++;
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      file
        .createReadStream()
        .on('error', reject)
        .pipe(createWriteStream(target))
        .on('error', reject)
        .on('finish', () => resolve());
    });
    downloaded++;
  }

  // A URL in the database with no object behind it becomes a broken image
  // after the cutover. Better to know now than from a user report.
  const missing = [...referenced].filter((p) => !present.has(p));
  const orphaned = [...present].filter((p) => !p.endsWith('/') && !referenced.has(p));

  return { downloaded, bytes, missing, orphaned };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log('=== Firestore -> SQLite migration ===');
  console.log('  mode:      ', options.dryRun ? 'DRY RUN (no writes)' : 'WRITE');
  console.log('  database:  ', options.dbPath);
  console.log('  uploads:   ', options.uploadsDir);
  console.log('  public URL:', options.publicBase + '/...');
  console.log('  source:    ', options.fromDump ? `dump ${options.fromDump}` : 'live Firestore');
  console.log('');

  const { docs, unknown } = options.fromDump
    ? readFromDump(options.fromDump)
    : await readFromFirestore();

  if (unknown.length) {
    console.error('!! Firestore has collections this build does not know about:', unknown.join(', '));
    console.error('!! They will NOT be migrated. Add them to src/db/schema.ts and re-run.');
    if (!options.dryRun) {
      console.error('!! Refusing to migrate a partial dataset. Aborting.');
      process.exit(1);
    }
  }

  // Localize storage URLs before writing, collecting which objects are actually referenced.
  const referenced = new Set<string>();
  const prepared: Record<string, any[]> = {};
  for (const [collection, list] of Object.entries(docs)) {
    prepared[collection] = options.skipFiles
      ? list
      : list.map((d) => rewriteDoc(d, options.publicBase, referenced));
  }

  const store = new DocStore();
  if (!options.dryRun) store.open(options.dbPath);

  let written = 0;
  console.log('--- documents ---');
  for (const collection of COLLECTION_NAMES) {
    const list = prepared[collection] || [];
    if (!options.dryRun && list.length) {
      // One transaction per collection: either the whole collection lands or
      // none of it does, so a failure never leaves a half-migrated table.
      store.transaction(() => {
        for (const doc of list) {
          const { id, createdAt, updatedAt, ...rest } = doc;
          store.createSync(collection, rest, id);
          // createSync server-stamps the timestamps; a migration must keep the
          // originals, so restore them directly.
          const restored: Record<string, any> = {};
          if (createdAt) restored.createdAt = createdAt;
          if (updatedAt) restored.updatedAt = updatedAt;
          if (Object.keys(restored).length) store.updateSync(collection, id, restored);
        }
      });
    }
    written += list.length;
    console.log(`  ${collection.padEnd(18)} ${String(list.length).padStart(6)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(18)} ${String(written).padStart(6)}`);

  if (!options.skipFiles) {
    console.log('\n--- files ---');
    const result = await downloadFiles(options.uploadsDir, referenced, options.dryRun);
    console.log(`  objects:    ${result.downloaded} (${(result.bytes / 1048576).toFixed(1)} MB)`);
    console.log(`  referenced: ${referenced.size}`);
    if (result.missing.length) {
      console.error(`  !! ${result.missing.length} URL(s) point at objects that do not exist:`);
      for (const p of result.missing.slice(0, 20)) console.error(`     ${p}`);
    }
    if (result.orphaned.length) {
      console.log(`  note: ${result.orphaned.length} object(s) in the bucket are not referenced by any document`);
    }
  }

  if (!options.dryRun) {
    console.log('\n--- verification ---');
    let mismatches = 0;
    for (const collection of COLLECTION_NAMES) {
      const expected = (prepared[collection] || []).length;
      const actual = store.countSync(collection);
      if (expected !== actual) {
        console.error(`  !! ${collection}: expected ${expected}, stored ${actual}`);
        mismatches++;
      }
    }
    console.log(mismatches === 0 ? '  all collection counts match' : `  ${mismatches} MISMATCH(ES)`);
    store.close();
    if (mismatches) process.exit(1);
  }

  console.log('\nDone.');
}

main().catch((error) => {
  console.error('[migrate] FAILED:', error);
  process.exit(1);
});
