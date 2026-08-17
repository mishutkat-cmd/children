/**
 * Clear image URLs that point at files which are not on disk.
 *
 * Three reward images were lost before the migration — they were already 404
 * in Firebase — so the UI renders a broken image. Nulling the field lets the
 * app fall back to its placeholder. The old URLs are printed before they are
 * cleared so they can be matched up with re-uploads.
 *
 * Usage:
 *   node dist/cli/clear-missing-images.js --dry-run
 *   node dist/cli/clear-missing-images.js
 *
 * Idempotent: a second run finds nothing to do.
 */

import '../config/env';
import { existsSync } from 'fs';
import { join } from 'path';
import { DocStore } from '../db/doc-store.service';

/** Collection -> fields that hold an image URL. */
const IMAGE_FIELDS: Record<string, string[]> = {
  rewards: ['imageUrl'],
  badges: ['imageUrl'],
  challenges: ['imageUrl'],
  childProfiles: ['avatarUrl'],
  users: ['avatarUrl'],
  characters: [
    'imageUrlZero',
    'imageUrlLow',
    'imageUrlHigh',
    'imageUrlsHungry',
    'imageUrlsNormal',
    'imageUrlsFull',
  ],
};

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const dbPath = (argv.find((a) => a.startsWith('--db=')) || '').split('=')[1] || DocStore.resolveDbPath();
  const uploadsDir = process.env.UPLOADS_PATH || join(process.cwd(), 'uploads');
  const publicBase = (process.env.UPLOADS_PUBLIC_BASE || '/uploads').replace(/\/$/, '');

  console.log('=== clear image URLs with no file behind them ===');
  console.log('  mode:    ', dryRun ? 'DRY RUN (no writes)' : 'WRITE');
  console.log('  database:', dbPath);
  console.log('  uploads: ', uploadsDir);
  console.log('');

  const store = new DocStore();
  store.open(dbPath);

  /** null = leave alone, '' = clear. Only local public URLs are checked. */
  const isMissing = (value: unknown): boolean => {
    if (typeof value !== 'string' || !value.startsWith(`${publicBase}/`)) return false;
    const objectPath = decodeURIComponent(value.slice(publicBase.length + 1).split('?')[0]);
    return !existsSync(join(uploadsDir, objectPath));
  };

  let cleared = 0;
  let checked = 0;

  for (const [collection, fields] of Object.entries(IMAGE_FIELDS)) {
    for (const doc of store.findManySync(collection)) {
      const patch: Record<string, any> = {};

      for (const field of fields) {
        const value = doc[field];

        if (Array.isArray(value)) {
          checked += value.length;
          const kept = value.filter((v) => !isMissing(v));
          if (kept.length !== value.length) {
            value.filter((v) => isMissing(v)).forEach((v: string) => console.log(`  ${collection}.${field}[]  ${v}`));
            patch[field] = kept;
          }
          continue;
        }

        checked++;
        if (isMissing(value)) {
          console.log(`  ${collection}.${field}   ${value}`);
          patch[field] = null;
        }
      }

      if (Object.keys(patch).length) {
        cleared += Object.keys(patch).length;
        if (!dryRun) store.updateSync(collection, doc.id, patch);
      }
    }
  }

  console.log('');
  console.log(`  checked: ${checked} image reference(s)`);
  console.log(`  ${dryRun ? 'would clear' : 'cleared'}: ${cleared}`);

  store.close();
}

main();
