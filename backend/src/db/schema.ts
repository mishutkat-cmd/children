/**
 * Local-database schema: one table per former Firestore collection.
 *
 * Layout is deliberately document-shaped — `id TEXT PRIMARY KEY` plus a
 * `doc` JSON blob — so the migration off Firestore is a storage swap, not a
 * rewrite of 11k lines of business logic. The documents in production are
 * irregular (optional fields, `childId` that is sometimes a userId and
 * sometimes a childProfile id, legacy docs missing `read`/`status`), and a
 * normalized schema would have to encode all of that ambiguity up front.
 * JSON storage keeps the exact semantics; indexes on the fields we actually
 * query give us the speed.
 *
 * SQLite indexes expressions, so `json_extract(doc, '$.familyId')` is a real
 * indexed lookup, not a scan.
 */

/** Fields that hold a point in time. Stored as ISO-8601 UTC, revived to Date on read. */
export const DATE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'performedAt',
  'approvedAt',
  'deliveredAt',
  'decidedAt',
  'earnedAt',
  'requestedAt',
  'startDate',
  'endDate',
  'lastCompletionAt',
  'capturedAt',
  'receivedAt',
  'refreshRequestedAt',
  'revokedAt',
  'lastUsedAt',
  'expiresAt',
]);

/**
 * Indexes, one entry per collection. Each entry is a list of index
 * definitions, and each definition is the ordered list of fields it covers.
 *
 * These are transcriptions of the `where`/`orderBy` pairs the services
 * actually issue — the same role Firestore's composite indexes played, minus
 * the runtime "index missing" failure. Column order matters: equality fields
 * first, the sort field last, so SQLite can satisfy the filter AND the
 * ordering from one index instead of filtering and then sorting into a temp
 * B-tree.
 */
export const COLLECTIONS: Record<string, string[][]> = {
  users: [['familyId', 'role'], ['email'], ['login'], ['role']],
  childProfiles: [['userId']],
  tasks: [
    ['familyId', 'status'],
    ['familyId', 'createdAt'],
  ],
  taskAssignments: [['taskId'], ['childId']],
  completions: [
    ['childId', 'status', 'performedAt'],
    // Ordering column included so the per-task history page is a straight
    // index walk. Filtering on (childId, taskId) alone left SQLite sorting
    // every one of that task's completions into a temp B-tree just to take
    // the newest twenty.
    ['childId', 'taskId', 'performedAt'],
    ['childId', 'performedAt'],
    ['familyId', 'status', 'createdAt'],
    ['taskId'],
  ],
  ledgerEntries: [
    ['childId', 'createdAt'],
    ['familyId', 'type', 'createdAt'],
    ['childId', 'refType', 'refId'],
  ],
  wishlist: [['childId', 'priority'], ['rewardId']],
  rewards: [['familyId', 'status']],
  exchanges: [
    ['familyId', 'status', 'createdAt'],
    ['childId', 'status'],
  ],
  badges: [['familyId', 'createdAt']],
  childBadges: [['childId', 'badgeId']],
  notifications: [
    ['familyId', 'createdAt'],
    ['familyId', 'read'],
    ['childId'],
  ],
  characters: [['familyId', 'createdAt']],
  challenges: [['familyId', 'status']],
  streakRules: [['familyId']],
  familySettings: [['familyId']],
  decayRules: [['familyId']],
  deviceTokens: [['userId', 'deviceId'], ['userId']],
  // Geolocation. `locationPoints` is the only collection that grows without
  // bound, so it carries an index on expiresAt for the retention sweep —
  // Firestore expired these through a TTL policy, which SQLite has no
  // equivalent for (see LocationsService.purgeExpiredPoints).
  locationPoints: [['childId', 'capturedAt'], ['familyId', 'capturedAt'], ['expiresAt']],
  childLocations: [['familyId'], ['childId']],
  locationSettings: [['familyId']],
  // Аудио «послушать, что вокруг» с согласия ребёнка.
  audioRequests: [['familyId', 'createdAt'], ['childId', 'status']],
  audioConsent: [['childId'], ['familyId']],
  _kv: [],
};

export const COLLECTION_NAMES = Object.keys(COLLECTIONS);

/** Table names are derived from a fixed allowlist, never from user input. */
export function tableFor(collection: string): string {
  if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, collection)) {
    throw new Error(`Unknown collection: ${collection}`);
  }
  return `"${collection}"`;
}

/** Full DDL. Safe to run on every boot — everything is IF NOT EXISTS. */
export function buildSchemaSql(): string {
  const parts: string[] = [];
  for (const [collection, indexes] of Object.entries(COLLECTIONS)) {
    const table = tableFor(collection);
    parts.push(
      `CREATE TABLE IF NOT EXISTS ${table} (\n` +
        `  id  TEXT PRIMARY KEY,\n` +
        `  doc TEXT NOT NULL\n` +
        `);`,
    );
    for (const fields of indexes) {
      // Index names come from the same allowlist as the tables, so nothing
      // here is user-controlled.
      const name = `idx_${collection}_${fields.join('_')}`;
      const columns = fields.map((f) => `json_extract(doc, '$.${f}')`).join(', ');
      parts.push(`CREATE INDEX IF NOT EXISTS "${name}" ON ${table} (${columns});`);
    }
  }
  return parts.join('\n');
}
