import { MongoClient, ServerApiVersion } from 'mongodb';
import type { Db } from 'mongodb';

/**
 * MongoDB Atlas connection for the Kaarigar backend.
 *
 * Ownership: Track A. Route modules must reach the database only through
 * `getDb()` — no module opens its own client, and no module reads another
 * module's collections directly (Architecture §5.2 boundary discipline).
 *
 * Deliberately contains no schemas or collection typings. Those land after
 * `types.ts` is expanded and frozen in the Day 1 morning session.
 */

const DEFAULT_DB_NAME = 'kaarigar';

/**
 * Atlas' own default is 30s. That is the single worst value for this project:
 * an IP missing from the Atlas Network Access allowlist produces a *timeout*,
 * not an auth error, so a 30s hang reads as a bug in whichever route was called.
 * Eight seconds fails fast enough to be obviously a connection problem.
 */
const SERVER_SELECTION_TIMEOUT_MS = 8_000;

let client: MongoClient | null = null;
let db: Db | null = null;
let lastError: Error | null = null;

/**
 * Connect once, at boot. Idempotent.
 *
 * Never throws. A missing URI or an unreachable cluster must not stop the
 * server from starting — until the Day 3 migration the app is still served
 * entirely from localStorage, and the plan's rule is that the app runs on
 * every single day of the schedule.
 */
export async function connectDb(): Promise<Db | null> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    lastError = new Error('MONGODB_URI is not set');
    console.warn(
      '[db] MONGODB_URI is not set — starting without a database.\n' +
      '     Copy .env.example to .env and add the Atlas connection string.'
    );
    return null;
  }

  try {
    client = new MongoClient(uri, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      retryWrites: true,
    });

    await client.connect();
    await client.db('admin').command({ ping: 1 });

    db = client.db(process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME);
    lastError = null;
    console.log(`[db] connected to MongoDB Atlas — database "${db.databaseName}"`);
    return db;
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    client = null;
    db = null;
    console.error('[db] connection failed:', lastError.message);
    if (/timed out|ETIMEDOUT|ServerSelection/i.test(lastError.message)) {
      console.error(
        '[db] A timeout almost always means this machine\'s IP is not in the Atlas\n' +
        '     Network Access allowlist — NOT that the URI or password is wrong.\n' +
        '     Check Atlas -> Network Access before debugging any route or auth code.\n' +
        '     Home broadband IPs change; an entry that worked yesterday may not today.'
      );
    }
    return null;
  }
}

/**
 * For route modules. Throws if the database is unavailable, so a route that
 * genuinely needs Mongo fails with a clear message instead of returning
 * plausible-looking empty data — the failure mode the audit flagged twice.
 */
export function getDb(): Db {
  if (!db) {
    throw new Error(
      `Database unavailable${lastError ? `: ${lastError.message}` : ''}. ` +
      'Check MONGODB_URI and the Atlas Network Access allowlist.'
    );
  }
  return db;
}

/** Non-throwing probe, for /api/health and for guarding optional reads. */
export function isDbConnected(): boolean {
  return db !== null;
}

/** Last connection error, for surfacing in health output. */
export function getDbError(): string | null {
  return lastError ? lastError.message : null;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[db] connection closed');
  }
}
