import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
// `import =` rather than a default import: the project compiles with
// allowSyntheticDefaultImports but without esModuleInterop, so a default
// import would type-check and then emit `.default` against a CommonJS module
// that has none.
import Database = require('better-sqlite3');
import { COLLECTION_NAMES, DATE_FIELDS, buildSchemaSql, tableFor } from './schema';

const isPlainObject = (value: any): boolean =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Recursive merge, matching what Firestore's `set(..., { merge: true })` did
 * at every level rather than only the first.
 *
 * The case that matters is `perChild: { [childId]: { enabled } }`: a one-level
 * merge keeps the other children but replaces the edited child's whole object,
 * so toggling their tracking silently reset their history retention to the
 * family default. Arrays are replaced wholesale, as Firestore also did.
 */
function deepMerge(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

/**
 * Document store backed by a local SQLite file on the same host as the API.
 *
 * This replaces FirestoreService and deliberately keeps its method signatures
 * (`findMany(collection, where, orderBy, take)` and friends) so the twenty
 * services built on top of it did not have to be rewritten during the move.
 *
 * Why it is fast: Firestore answered every one of these calls with a network
 * round-trip to the `eur3` multi-region — measured at 80-400 ms each, and the
 * dashboard makes dozens. The same call here is an indexed read from a file in
 * the page cache: tens of microseconds. better-sqlite3 is synchronous, so
 * there is not even an event-loop hop; the async signatures are kept purely
 * for call-site compatibility.
 *
 * Every method has a `*Sync` twin. The async ones are the compatibility
 * facade; the sync ones are what you call inside `transaction()`, since
 * SQLite transactions cannot span an await.
 */
@Injectable()
export class DocStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocStore.name);
  private db!: Database.Database;
  private dbPath = '';

  onModuleInit() {
    this.open();
  }

  onModuleDestroy() {
    this.close();
  }

  /** Resolve the database path from env, defaulting next to the backend. */
  static resolveDbPath(): string {
    const configured = process.env.DATABASE_PATH || process.env.DB_PATH;
    if (configured) {
      return isAbsolute(configured) ? configured : join(process.cwd(), configured);
    }
    return join(process.cwd(), 'data', 'children.db');
  }

  open(dbPath = DocStore.resolveDbPath()): void {
    if (this.db) return;
    this.dbPath = dbPath;

    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);

    // WAL lets reads proceed while a write is in flight, which matters because
    // the scheduler crons write while requests are being served.
    this.db.pragma('journal_mode = WAL');
    // NORMAL is the right durability trade for WAL: survives process crash,
    // can lose the last commits only on OS/host crash. FULL costs an fsync per
    // write for a family app that already tolerated eventual consistency.
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    // Wait rather than throw SQLITE_BUSY if a cron and a request collide.
    this.db.pragma('busy_timeout = 5000');

    this.db.exec(buildSchemaSql());

    this.logger.log(`[DocStore] SQLite ready at ${dbPath}`);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined as any;
    }
  }

  /** Raw handle — for the migration script and integrity tooling only. */
  get raw(): Database.Database {
    return this.db;
  }

  getStatus(): { enabled: boolean; path: string; documents: number; reason?: string } {
    if (!this.db) {
      return { enabled: false, path: this.dbPath, documents: 0, reason: 'not opened' };
    }
    try {
      let documents = 0;
      for (const collection of COLLECTION_NAMES) {
        documents += this.countSync(collection);
      }
      return { enabled: true, path: this.dbPath, documents };
    } catch (error: any) {
      return { enabled: false, path: this.dbPath, documents: 0, reason: error?.message };
    }
  }

  // ---------------------------------------------------------------------
  // Encoding / decoding
  // ---------------------------------------------------------------------

  /**
   * Dates live in the JSON as ISO-8601 UTC strings. That is not cosmetic:
   * ISO-8601 UTC sorts lexicographically in the same order it sorts
   * chronologically, so `ORDER BY json_extract(doc,'$.createdAt')` and
   * `WHERE ... >= ?` are both correct without any date parsing in SQL.
   */
  private static toStorable(key: string, value: any): any {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (DATE_FIELDS.has(key) && typeof value === 'string') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? value : parsed.toISOString();
    }
    // A Firestore Timestamp that survived in an in-flight object.
    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }
    if (value && typeof value === 'object' && typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6)).toISOString();
    }
    return value;
  }

  private static encodeDoc(data: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const encoded = DocStore.toStorable(key, value);
      // Firestore rejected `undefined`; keep dropping it so a caller that
      // built `{ multiplier: cond ? 5 : undefined }` behaves as it did before.
      if (encoded === undefined) continue;
      out[key] = encoded;
    }
    return out;
  }

  /** Rehydrate a stored row: parse JSON, revive dates, re-attach the id. */
  private static decodeRow(row: { id: string; doc: string }): any {
    const parsed = JSON.parse(row.doc);
    const out: any = { id: row.id };
    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'id') continue;
      if (DATE_FIELDS.has(key) && typeof value === 'string') {
        const date = new Date(value);
        out[key] = isNaN(date.getTime()) ? value : date;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  /** Bind-safe scalar: SQLite takes no booleans, and JSON true indexes as 1. */
  private static toParam(key: string, value: any): any {
    const encoded = DocStore.toStorable(key, value);
    if (typeof encoded === 'boolean') return encoded ? 1 : 0;
    if (encoded === undefined) return null;
    return encoded;
  }

  private static assertFieldName(field: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
      throw new Error(`Unsafe field name: ${field}`);
    }
  }

  /** `id` is a real column; everything else is read out of the JSON. */
  private static fieldExpr(field: string): string {
    DocStore.assertFieldName(field);
    return field === 'id' ? 'id' : `json_extract(doc, '$.${field}')`;
  }

  // ---------------------------------------------------------------------
  // Query building
  // ---------------------------------------------------------------------

  private static buildWhere(where?: Record<string, any>): { sql: string; params: any[] } {
    if (!where) return { sql: '', params: [] };

    const clauses: string[] = [];
    const params: any[] = [];

    for (const [field, condition] of Object.entries(where)) {
      if (condition === undefined) continue;

      if (field === 'OR') {
        // `{ OR: [{a: 1}, {b: 2}] }` — each branch is itself a where object.
        const branches: string[] = [];
        for (const branch of condition as Record<string, any>[]) {
          const built = DocStore.buildWhere(branch);
          if (!built.sql) continue;
          branches.push(`(${built.sql})`);
          params.push(...built.params);
        }
        if (branches.length) clauses.push(`(${branches.join(' OR ')})`);
        continue;
      }

      const expr = DocStore.fieldExpr(field);

      if (condition === null) {
        clauses.push(`${expr} IS NULL`);
        continue;
      }

      if (typeof condition === 'object' && (condition as any).not !== undefined) {
        // `not` deliberately MATCHES documents where the field is absent.
        // Firestore's `!=` excluded them, which is why the services filtered
        // in memory instead (`n.read !== true` counts legacy notifications
        // that predate the field). Pushing that filter into SQL has to keep
        // the same answer, so NULL counts as "not equal".
        clauses.push(`(${expr} IS NULL OR ${expr} != ?)`);
        params.push(DocStore.toParam(field, (condition as any).not));
        continue;
      }

      if (typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
        const op = condition as Record<string, any>;
        // Range/membership operators, matching the old shim's vocabulary.
        if (op.in !== undefined) {
          const values = (op.in as any[]) ?? [];
          if (values.length === 0) {
            // An empty `in` matches nothing — say so explicitly rather than
            // dropping the clause and returning the whole collection.
            clauses.push('0 = 1');
          } else {
            clauses.push(`${expr} IN (${values.map(() => '?').join(', ')})`);
            params.push(...values.map((v) => DocStore.toParam(field, v)));
          }
        }
        if (op.gte !== undefined) {
          clauses.push(`${expr} >= ?`);
          params.push(DocStore.toParam(field, op.gte));
        }
        if (op.gt !== undefined) {
          clauses.push(`${expr} > ?`);
          params.push(DocStore.toParam(field, op.gt));
        }
        if (op.lte !== undefined) {
          clauses.push(`${expr} <= ?`);
          params.push(DocStore.toParam(field, op.lte));
        }
        if (op.lt !== undefined) {
          clauses.push(`${expr} < ?`);
          params.push(DocStore.toParam(field, op.lt));
        }
        if (
          op.in === undefined &&
          op.gte === undefined &&
          op.gt === undefined &&
          op.lte === undefined &&
          op.lt === undefined
        ) {
          // A plain object value — compare the serialized JSON.
          clauses.push(`${expr} = ?`);
          params.push(JSON.stringify(condition));
        }
        continue;
      }

      clauses.push(`${expr} = ?`);
      params.push(DocStore.toParam(field, condition));
    }

    return { sql: clauses.join(' AND '), params };
  }

  private static buildOrderBy(orderBy?: Record<string, 'asc' | 'desc'>): string {
    if (!orderBy) return '';
    const parts: string[] = [];
    let lastDir = 'DESC';
    for (const [field, direction] of Object.entries(orderBy)) {
      const expr = DocStore.fieldExpr(field);
      const dir = String(direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      lastDir = dir;
      // Deliberately NOT `(expr IS NULL) ASC, expr DESC`: that extra term
      // makes the ordering unsatisfiable from the index and forces every
      // query through a temp B-tree sort (measured: 1.9 ms vs 0.05 ms on
      // completions). Plain ordering lets SQLite walk the composite index
      // directly. Documents missing the field are still returned — Firestore
      // dropped them outright — they just sort where SQLite puts NULLs.
      parts.push(`${expr} ${dir}`);
    }
    if (!parts.length) return '';
    // Timestamps here have millisecond precision, where Firestore's had
    // nanoseconds, so two documents written in the same millisecond now tie.
    // rowid is monotonic per insert, so it breaks the tie by true insertion
    // order and keeps paginated/limited reads stable instead of arbitrary.
    parts.push(`rowid ${lastDir}`);
    return ` ORDER BY ${parts.join(', ')}`;
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  findManySync(
    collection: string,
    where?: Record<string, any>,
    orderBy?: Record<string, 'asc' | 'desc'>,
    take?: number,
  ): any[] {
    const table = tableFor(collection);
    const { sql, params } = DocStore.buildWhere(where);
    let query = `SELECT id, doc FROM ${table}`;
    if (sql) query += ` WHERE ${sql}`;
    query += DocStore.buildOrderBy(orderBy);
    if (take && take > 0) query += ` LIMIT ${Math.floor(take)}`;

    const rows = this.db.prepare(query).all(...params) as { id: string; doc: string }[];
    return rows.map(DocStore.decodeRow);
  }

  findFirstSync(collection: string, where?: Record<string, any>): any | null {
    const rows = this.findManySync(collection, where, undefined, 1);
    return rows.length ? rows[0] : null;
  }

  getSync(collection: string, id: string): any | null {
    const row = this.db
      .prepare(`SELECT id, doc FROM ${tableFor(collection)} WHERE id = ?`)
      .get(id) as { id: string; doc: string } | undefined;
    return row ? DocStore.decodeRow(row) : null;
  }

  /**
   * Sum a numeric field in SQL instead of loading the documents to add them up
   * in JavaScript.
   *
   * This is the main thing Firestore could not do, and the reason several read
   * paths pulled a child's entire ledger (hundreds of documents) on every
   * dashboard load just to produce one number.
   *
   * `absolute` sums |value|. Needed for spend totals: the sign of a SPEND
   * amount is inconsistent in stored data — some rows are positive, some
   * negative — and the JavaScript code always took Math.abs per row, so
   * summing raw values first would silently net them off against each other.
   */
  sumSync(
    collection: string,
    field: string,
    where?: Record<string, any>,
    options?: { absolute?: boolean },
  ): number {
    const expr = DocStore.fieldExpr(field);
    const value = options?.absolute ? `ABS(${expr})` : expr;
    const { sql, params } = DocStore.buildWhere(where);
    let query = `SELECT COALESCE(SUM(${value}), 0) AS total FROM ${tableFor(collection)}`;
    if (sql) query += ` WHERE ${sql}`;
    const row = this.db.prepare(query).get(...params) as { total: number };
    return row.total || 0;
  }

  countSync(collection: string, where?: Record<string, any>): number {
    const { sql, params } = DocStore.buildWhere(where);
    let query = `SELECT COUNT(*) AS n FROM ${tableFor(collection)}`;
    if (sql) query += ` WHERE ${sql}`;
    const row = this.db.prepare(query).get(...params) as { n: number };
    return row.n;
  }

  // ---------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------

  createSync(
    collection: string,
    data: Record<string, any>,
    docId?: string,
    options?: { preserveTimestamps?: boolean },
  ): string {
    const id = docId || data.id || crypto.randomUUID();
    const now = new Date().toISOString();

    // createdAt/updatedAt are server-assigned, exactly as the Firestore shim
    // did with serverTimestamp() — application callers cannot spoof them.
    //
    // `preserveTimestamps` is the one exception, for importing existing
    // documents whose real timestamps must survive. Without it an import
    // silently restamps the entire dataset with the moment of the import,
    // which destroys every createdAt-ordered list in the product.
    const { createdAt, updatedAt, id: _i, ...rest } = data;
    const keep = options?.preserveTimestamps === true;
    const doc = {
      ...DocStore.encodeDoc(rest),
      createdAt: (keep && DocStore.toStorable('createdAt', createdAt)) || now,
      updatedAt: (keep && DocStore.toStorable('updatedAt', updatedAt)) || now,
    };

    this.db
      .prepare(`INSERT OR REPLACE INTO ${tableFor(collection)} (id, doc) VALUES (?, ?)`)
      .run(id, JSON.stringify(doc));
    return id;
  }

  updateSync(collection: string, id: string, data: Record<string, any>): void {
    const table = tableFor(collection);
    const row = this.db.prepare(`SELECT doc FROM ${table} WHERE id = ?`).get(id) as
      | { doc: string }
      | undefined;
    if (!row) {
      // Firestore's update() rejects a missing document; keep that contract so
      // callers relying on the throw keep working.
      throw new Error(`Document ${id} not found in collection ${collection}`);
    }

    const current = JSON.parse(row.doc);
    const { id: _i, createdAt: _c, ...rest } = data;
    const patch = DocStore.encodeDoc(rest);
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };

    this.db.prepare(`UPDATE ${table} SET doc = ? WHERE id = ?`).run(JSON.stringify(next), id);
  }

  /**
   * Atomic read-modify-write of numeric fields — the replacement for
   * `FieldValue.increment`. Only meaningful inside `transaction()`, which is
   * how the ledger uses it.
   */
  incrementSync(collection: string, id: string, deltas: Record<string, number>, extra?: Record<string, any>): void {
    const table = tableFor(collection);
    const row = this.db.prepare(`SELECT doc FROM ${table} WHERE id = ?`).get(id) as
      | { doc: string }
      | undefined;
    if (!row) throw new Error(`Document ${id} not found in collection ${collection}`);

    const current = JSON.parse(row.doc);
    for (const [field, delta] of Object.entries(deltas)) {
      if (!delta) continue;
      const base = typeof current[field] === 'number' ? current[field] : 0;
      current[field] = base + delta;
    }
    Object.assign(current, DocStore.encodeDoc(extra ?? {}));
    current.updatedAt = new Date().toISOString();

    this.db.prepare(`UPDATE ${table} SET doc = ? WHERE id = ?`).run(JSON.stringify(current), id);
  }

  /**
   * Create-or-merge by id — the equivalent of Firestore's
   * `doc(id).set(data, { merge: true })`.
   *
   * With `merge` the patch is applied over the existing document and
   * `createdAt` is preserved; without it the document is replaced wholesale.
   * Unlike `updateSync`, a missing document is created rather than an error,
   * which is what the settings and last-known-location writes rely on.
   *
   * `mergeNested` additionally merges one level down, for the case Firestore
   * handled natively: `perChild: { [childId]: patch }` must not wipe the other
   * children's settings.
   */
  setSync(
    collection: string,
    id: string,
    data: Record<string, any>,
    options?: { merge?: boolean; mergeNested?: boolean },
  ): void {
    const table = tableFor(collection);
    const row = this.db.prepare(`SELECT doc FROM ${table} WHERE id = ?`).get(id) as
      | { doc: string }
      | undefined;

    const now = new Date().toISOString();
    const { id: _i, ...rest } = data;
    const patch = DocStore.encodeDoc(rest);

    let next: Record<string, any>;
    if (!row) {
      next = { ...patch, createdAt: patch.createdAt ?? now, updatedAt: now };
    } else if (options?.merge) {
      const current = JSON.parse(row.doc);
      next = options.mergeNested ? deepMerge(current, patch) : { ...current, ...patch };
      next.createdAt = current.createdAt ?? now;
      next.updatedAt = now;
    } else {
      next = { ...patch, createdAt: patch.createdAt ?? now, updatedAt: now };
    }

    this.db
      .prepare(`INSERT OR REPLACE INTO ${table} (id, doc) VALUES (?, ?)`)
      .run(id, JSON.stringify(next));
  }

  deleteSync(collection: string, id: string): void {
    this.db.prepare(`DELETE FROM ${tableFor(collection)} WHERE id = ?`).run(id);
  }

  /**
   * Apply the same patch to every matching document, in one statement.
   * Replaces read-all-then-update-each loops. Returns the number of rows
   * touched.
   *
   * The patch is merged into each document's JSON, so unrelated fields are
   * preserved exactly as `updateSync` does.
   */
  updateManySync(collection: string, where: Record<string, any>, patch: Record<string, any>): number {
    const table = tableFor(collection);
    const encoded = DocStore.encodeDoc({ ...patch });
    encoded.updatedAt = new Date().toISOString();

    const { sql, params } = DocStore.buildWhere(where);
    // json_patch merges the two objects server-side; no round-trip through
    // JavaScript, and no chance of clobbering a concurrent write to another
    // field of the same document.
    let query = `UPDATE ${table} SET doc = json_patch(doc, ?)`;
    if (sql) query += ` WHERE ${sql}`;
    return this.db.prepare(query).run(JSON.stringify(encoded), ...params).changes;
  }

  /**
   * Bulk delete by predicate. Firestore had no such thing — callers looped
   * over paged reads and issued batched deletes — so this collapses those
   * loops into one statement. Returns the number of rows removed.
   */
  deleteManySync(collection: string, where?: Record<string, any>): number {
    const { sql, params } = DocStore.buildWhere(where);
    let query = `DELETE FROM ${tableFor(collection)}`;
    if (sql) query += ` WHERE ${sql}`;
    return this.db.prepare(query).run(...params).changes;
  }

  /**
   * Run `fn` inside a single SQLite transaction. The callback must be
   * synchronous — SQLite transactions are per-connection and cannot survive an
   * await. Use the `*Sync` methods inside.
   *
   * IMMEDIATE takes the write lock up front, so a concurrent writer fails fast
   * at BEGIN instead of halfway through with SQLITE_BUSY_SNAPSHOT.
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn).immediate();
  }

  // ---------------------------------------------------------------------
  // Async facade — the surface the services were already written against
  // ---------------------------------------------------------------------

  async findMany(
    collection: string,
    where?: Record<string, any>,
    orderBy?: Record<string, 'asc' | 'desc'>,
    take?: number,
  ): Promise<any[]> {
    return this.findManySync(collection, where, orderBy, take);
  }

  async findFirst(collection: string, where?: Record<string, any>): Promise<any | null> {
    return this.findFirstSync(collection, where);
  }

  async findUnique(collection: string, where: Record<string, any>): Promise<any | null> {
    return this.findFirstSync(collection, where);
  }

  async count(collection: string, where?: Record<string, any>): Promise<number> {
    return this.countSync(collection, where);
  }

  async create(collection: string, data: Record<string, any>, docId?: string): Promise<string> {
    return this.createSync(collection, data, docId);
  }

  async update(collection: string, id: string, data: Record<string, any>): Promise<void> {
    this.updateSync(collection, id, data);
  }

  async delete(collection: string, id: string): Promise<void> {
    this.deleteSync(collection, id);
  }

  async set(
    collection: string,
    id: string,
    data: Record<string, any>,
    options?: { merge?: boolean; mergeNested?: boolean },
  ): Promise<void> {
    this.setSync(collection, id, data, options);
  }

  async deleteMany(collection: string, where?: Record<string, any>): Promise<number> {
    return this.deleteManySync(collection, where);
  }

  async updateMany(
    collection: string,
    where: Record<string, any>,
    patch: Record<string, any>,
  ): Promise<number> {
    return this.updateManySync(collection, where, patch);
  }

  async sum(
    collection: string,
    field: string,
    where?: Record<string, any>,
    options?: { absolute?: boolean },
  ): Promise<number> {
    return this.sumSync(collection, field, where, options);
  }

  async get(collection: string, id: string): Promise<any | null> {
    return this.getSync(collection, id);
  }

  /** Kept for signature compatibility with the old Firestore shim. */
  async doc(collection: string, docId: string): Promise<any> {
    const found = this.getSync(collection, docId);
    if (!found) throw new Error(`Document ${docId} not found in collection ${collection}`);
    return found;
  }

  async runTransaction<T>(fn: () => T): Promise<T> {
    return this.transaction(fn);
  }
}
