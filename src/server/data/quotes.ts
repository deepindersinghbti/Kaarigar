import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../db';
import { uuidv7 } from '../../lib/ids';
import type { SharedQuoteBand, SharedQuoteInput, SharedQuoteRecord } from '../../data/quoteTypes';

export const SHARED_QUOTES = 'shared_quotes';

type QuoteCreateOutcome =
  | { status: 'created'; token: string; quote: SharedQuoteRecord }
  | { status: 'rejected'; field: string; message: string };

let indexesReady = false;

export async function ensureSharedQuoteIndexes(): Promise<void> {
  if (indexesReady) return;
  await getDb().collection(SHARED_QUOTES).createIndex({ tokenHash: 1 }, { unique: true });
  indexesReady = true;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function band(value: unknown): SharedQuoteBand | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const p25 = amount(source.p25);
  const p50 = amount(source.p50);
  const p75 = amount(source.p75);
  if (p25 === null || p50 === null || p75 === null) return undefined;
  return {
    p25,
    p50,
    p75,
    seededFrom: text(source.seededFrom, 600) || undefined,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSharedQuote(ownerId: string, input: unknown): Promise<QuoteCreateOutcome> {
  const body = (input ?? {}) as Partial<SharedQuoteInput>;
  const language = body.language === 'en' || body.language === 'hi' || body.language === 'pa'
    ? body.language
    : null;
  if (!language) return { status: 'rejected', field: 'language', message: 'language must be en, hi, or pa.' };

  const workerName = text(body.workerName, 120);
  const trade = text(body.trade, 80);
  const tradeLabel = text(body.tradeLabel, 120);
  const location = text(body.location, 160);
  const taskCode = text(body.taskCode, 80);
  const taskLabel = text(body.taskLabel, 160);
  if (!workerName) return { status: 'rejected', field: 'workerName', message: 'workerName is required.' };
  if (!trade || !tradeLabel) return { status: 'rejected', field: 'trade', message: 'trade is required.' };
  if (!taskCode || !taskLabel) return { status: 'rejected', field: 'task', message: 'task is required.' };

  const labour = amount(body.labour);
  const materials = amount(body.materials);
  const visitCharge = amount(body.visitCharge);
  if (labour === null) return { status: 'rejected', field: 'labour', message: 'labour must be a non-negative number.' };
  if (materials === null) return { status: 'rejected', field: 'materials', message: 'materials must be a non-negative number.' };
  if (visitCharge === null) return { status: 'rejected', field: 'visitCharge', message: 'visitCharge must be a non-negative number.' };

  await ensureSharedQuoteIndexes();
  const token = randomBytes(24).toString('base64url');
  const id = uuidv7();
  const createdAt = new Date().toISOString();
  const quote: SharedQuoteRecord = {
    id,
    createdAt,
    language,
    workerName,
    trade,
    tradeLabel,
    location,
    taskCode,
    taskLabel,
    labour,
    materials,
    visitCharge,
    band: band(body.band),
  };

  await getDb().collection(SHARED_QUOTES).insertOne({
    _id: id as never,
    ownerId,
    tokenHash: hashToken(token),
    ...quote,
  });
  return { status: 'created', token, quote };
}

export async function findSharedQuote(token: string): Promise<SharedQuoteRecord | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  await ensureSharedQuoteIndexes();
  const doc = await getDb().collection(SHARED_QUOTES).findOne(
    { tokenHash: hashToken(token) },
    { projection: { _id: 0, ownerId: 0, tokenHash: 0 } },
  );
  return doc ? doc as unknown as SharedQuoteRecord : null;
}
