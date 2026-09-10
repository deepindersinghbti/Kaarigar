import { createHash, createHmac } from 'crypto';
import type { SupportedLanguage } from '../../types';
import { getDb, isDbConnected } from '../db';
import { deriveTtsKey } from './secret';

/**
 * Two-tier, two-namespace audio cache.
 *
 * TIERS. An in-process LRU in front of Mongo. Reads go LRU -> Mongo ->
 * (caller synthesises); writes go to the LRU unconditionally and to Mongo
 * best-effort. A Mongo outage therefore degrades to "this process serves audio
 * for its own lifetime", which is the non-fatal stance server.ts already takes
 * toward the database - it must never be the reason voice output stops.
 *
 * NAMESPACES. Shared entries are app copy and carry no personal data, so they
 * are keyed by a plain sha256 of their text and served from a public,
 * immutable URL. Private entries are assistant replies carrying a worker's
 * name, a customer's name and an amount; they are keyed by HMAC so that
 * knowing the text does not yield the key, and served only against a signature
 * (see signedUrl.ts). Which namespace a string belongs to is decided
 * server-side in routes/tts.ts and is never accepted from the client.
 */

const TTS_CACHE = 'tts_cache';

/**
 * ~150 short MP3s at roughly 20 KB each is a ~3 MB ceiling - comfortable on the
 * Render free tier, and enough to hold the whole seeded UI vocabulary in all
 * three languages.
 */
const LRU_MAX = 150;

/** Private rows expire; shared copy is bounded and should persist. */
const PRIVATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CACHE_KEY_LABEL = 'kaarigar/tts-cache-key/v1';

export type TtsNamespace = 'shared' | 'private';

export interface CacheEntry {
  audio: Buffer;
  mime: string;
  provider: string;
  namespace: TtsNamespace;
  /** Present only on private entries; the signature is verified against it. */
  ownerId?: string;
}

/**
 * Both key functions take ALREADY-NORMALISED text.
 *
 * The caller normalises once and passes the result to the provider and to the
 * key, so the two can never disagree. normalizeForSpeech is idempotent, but
 * normalising in here as well would leave two places that decide what a cache
 * key means.
 */
export function sharedCacheKey(normalized: string, lang: SupportedLanguage): string {
  return createHash('sha256').update(`${lang}::${normalized}`).digest('hex');
}

/**
 * HMAC rather than a plain hash, and this is the load-bearing part of the
 * privacy design rather than a flourish.
 *
 * Assistant replies are templated. Under sha256, anyone who knew the template
 * could hash a guessed name/amount tuple and ask whether that hash returns
 * 200 - a confirmation oracle over real workers, customers and earnings.
 * Keying under a server secret means an attacker cannot compute the key at all,
 * so the oracle is gone before access control is even reached.
 */
export function privateCacheKey(ownerId: string, normalized: string, lang: SupportedLanguage): string {
  return createHmac('sha256', deriveTtsKey(CACHE_KEY_LABEL))
    .update(`${ownerId}::${lang}::${normalized}`)
    .digest('hex');
}

// --- Tier 1: in-process LRU -------------------------------------------------

// Map iteration order is insertion order, so deleting and re-inserting on every
// read makes the oldest key the least-recently-USED one, not merely the
// least-recently-written.
const lru = new Map<string, CacheEntry>();

function lruGet(hash: string): CacheEntry | null {
  const entry = lru.get(hash);
  if (!entry) return null;
  lru.delete(hash);
  lru.set(hash, entry);
  return entry;
}

function lruSet(hash: string, entry: CacheEntry): void {
  if (lru.has(hash)) lru.delete(hash);
  lru.set(hash, entry);
  while (lru.size > LRU_MAX) {
    const oldest = lru.keys().next();
    if (oldest.done) break;
    lru.delete(oldest.value);
  }
}

// --- Tier 2: Mongo ----------------------------------------------------------

let indexesReady = false;
async function ensureTtsIndexes(): Promise<void> {
  if (indexesReady) return;
  const db = getDb();
  // expireAfterSeconds: 0 expires a document when its own expiresAt passes.
  // Documents with no expiresAt field are never expired - which is exactly how
  // shared copy survives while private rows age out after 30 days.
  await db.collection(TTS_CACHE).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  indexesReady = true;
}

/**
 * The driver returns BSON binary as a Binary wrapper unless promoteBuffers is
 * set, and this codebase does not set it. Accept either shape rather than
 * depending on that default.
 */
function toBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  const wrapped = (value as { buffer?: unknown })?.buffer;
  if (wrapped && Buffer.isBuffer(wrapped)) return wrapped;
  if (wrapped instanceof Uint8Array) return Buffer.from(wrapped);
  if (value instanceof Uint8Array) return Buffer.from(value);
  return null;
}

async function mongoGet(hash: string): Promise<CacheEntry | null> {
  if (!isDbConnected()) return null;
  try {
    await ensureTtsIndexes();
    const doc = await getDb().collection(TTS_CACHE).findOne({ _id: hash as never });
    if (!doc) return null;

    const audio = toBuffer(doc.audio);
    if (!audio || audio.length === 0) return null;

    const namespace: TtsNamespace = doc.namespace === 'private' ? 'private' : 'shared';

    // Touch lastUsed so a future sweep has something to sort on, and push a
    // private row's expiry out - copy still in use should not age out.
    const now = new Date();
    const update: Record<string, unknown> = { lastUsed: now };
    if (namespace === 'private') update.expiresAt = new Date(now.getTime() + PRIVATE_TTL_MS);
    void getDb().collection(TTS_CACHE)
      .updateOne({ _id: hash as never }, { $set: update })
      .catch(() => { /* a missed touch is not worth failing a playback over */ });

    return {
      audio,
      mime: typeof doc.mime === 'string' ? doc.mime : 'audio/mpeg',
      provider: typeof doc.provider === 'string' ? doc.provider : 'unknown',
      namespace,
      ownerId: typeof doc.ownerId === 'string' ? doc.ownerId : undefined,
    };
  } catch (err) {
    console.warn('[tts] cache read failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function mongoPut(hash: string, entry: CacheEntry): Promise<void> {
  if (!isDbConnected()) return;
  try {
    await ensureTtsIndexes();
    const now = new Date();
    const doc: Record<string, unknown> = {
      audio: entry.audio,
      mime: entry.mime,
      provider: entry.provider,
      namespace: entry.namespace,
      lastUsed: now,
      createdAt: now,
    };
    if (entry.namespace === 'private') {
      doc.ownerId = entry.ownerId;
      doc.expiresAt = new Date(now.getTime() + PRIVATE_TTL_MS);
    }
    await getDb().collection(TTS_CACHE).updateOne(
      { _id: hash as never },
      { $set: doc },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[tts] cache write failed:', err instanceof Error ? err.message : String(err));
  }
}

// --- Public surface ---------------------------------------------------------

/** LRU, then Mongo. A Mongo hit is promoted into the LRU. */
export async function getCached(hash: string): Promise<CacheEntry | null> {
  const hot = lruGet(hash);
  if (hot) return hot;

  const cold = await mongoGet(hash);
  if (cold) lruSet(hash, cold);
  return cold;
}

/** LRU unconditionally; Mongo best-effort and never awaited by the caller. */
export function putCached(hash: string, entry: CacheEntry): void {
  lruSet(hash, entry);
  void mongoPut(hash, entry);
}

// --- In-flight de-duplication ----------------------------------------------

const inFlight = new Map<string, Promise<CacheEntry>>();

/**
 * Collapse concurrent synthesis of the same hash into one provider call.
 *
 * Not theoretical: after speaking a reply the modal immediately prefetches the
 * likely next prompt, so two requests for one uncached string overlap by
 * design. Without this the prefetch would double the bill on exactly the
 * strings it exists to make cheap.
 */
export function withInFlight(hash: string, produce: () => Promise<CacheEntry>): Promise<CacheEntry> {
  const existing = inFlight.get(hash);
  if (existing) return existing;

  const started = produce().finally(() => inFlight.delete(hash));
  inFlight.set(hash, started);
  return started;
}

/** Test seam, mirroring __resetRateLimits in middleware/rateLimit.ts. */
export function __resetTtsCache(): void {
  lru.clear();
  inFlight.clear();
  indexesReady = false;
}
