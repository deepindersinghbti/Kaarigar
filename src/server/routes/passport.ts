import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb, isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { uuidv7 } from '../../lib/ids';
import type { WorkerProfile } from '../../types';
import { calculateTrustEvidence } from '../data/trustScore';
import { getProfileIdForUser } from '../data/profiles';

/**
 * passport-svc - worker profile, credentials, portfolio.
 *
 * Owner: Track A. Mounted at /api/passport.
 *
 * OBJECT-LEVEL OWNERSHIP, NOT JUST ROLE. Architecture 12.1 requires an
 * ownership check on every passport read, and with only two roles a role check
 * would let any authenticated kaarigar read any other kaarigar's passport.
 * Every query here is scoped by req.user.uid - there is no code path that takes
 * a profile id from the request.
 */

export const passportRouter = Router();

const PROFILES = 'kaarigar_profiles';

let indexesReady = false;
async function ensureIndexes() {
  if (indexesReady) return;
  const db = getDb();
  await db.collection(PROFILES).createIndex({ userId: 1 }, { unique: true });
  await db.collection(PROFILES).createIndex({ passportHandle: 1 }, { unique: true });
  indexesReady = true;
}

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Check MONGODB_URI and the Atlas Network Access allowlist.',
  });
  return false;
}

/**
 * Fields a worker may change about themselves.
 *
 * An allowlist rather than a blocklist: rating, totalJobsCount, totalEarnings,
 * verifiedStatus and trustScore are all derived from verified events elsewhere,
 * and a self-service PATCH that could raise them would make the passport
 * worthless as evidence. That is the whole product claim (section 1), so it is
 * enforced here rather than by trusting the client to omit them.
 */
const PATCHABLE = [
  'name',
  'trade',
  'ncoCode',
  'experienceYears',
  'location',
  'skills',
  'certifications',
  'photoUrl',
  'bloodGroup',
  'dailyRate',
  'bio',
] as const;

/**
 * Derive a URL-safe handle. Collisions get a short suffix rather than failing
 * signup - two Ramesh Kumars in Chandigarh is likely, not exceptional.
 */
async function allocateHandle(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'kaarigar';

  const db = getDb();
  if (!(await db.collection(PROFILES).findOne({ passportHandle: base }))) return base;

  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await db.collection(PROFILES).findOne({ passportHandle: candidate }))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * GET /api/passport/exists
 *
 * Does this user already have a passport? Answers without making one.
 *
 * THAT IS THE ENTIRE POINT, and it is why this cannot be served by calling
 * GET /api/passport/me and checking the result. /me CREATES a passport when the
 * caller has none - correct for a worker opening their own app, catastrophic as
 * an existence check, because asking the question would make the answer true.
 * A customer would be issued a kaarigar passport named "Kaarigar" merely by
 * signing in, and it would then appear in the browse list they were about to
 * use.
 *
 * Reads through getProfileIdForUser, which projects to _id and creates nothing.
 * Returns a boolean and no identifiers: the caller is deciding which screen to
 * show, not reading a profile, so the profile id has no business in the
 * response.
 */
passportRouter.get('/exists', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    const profileId = await getProfileIdForUser(req.user!.uid);
    return res.json({ hasPassport: profileId !== null });
  } catch (err) {
    console.error('[passport] GET /exists failed:', err);
    return res.status(500).json({
      error: 'passport_exists_failed',
      message: 'Could not check for a passport.',
    });
  }
});

/**
 * GET /api/passport/me
 *
 * Creates the profile on first read rather than requiring a separate onboarding
 * call. A user exists the moment they verify an OTP, so a missing profile is
 * the normal state for a new worker, not an error.
 */
passportRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    await ensureIndexes();
    const db = getDb();
    const uid = req.user!.uid;

    const existing = await db.collection(PROFILES).findOne({ userId: uid });
    if (existing) {
      const { _id, ...profile } = existing;
      const evidence = await calculateTrustEvidence(uid);
      return res.json({
        profile: {
          ...profile,
          id: String(_id),
          rating: evidence.reviews.average ?? 0,
          totalJobsCount: evidence.jobs.completed,
          trustScore: evidence.score,
        },
      });
    }

    const name = 'Kaarigar';
    const profile: WorkerProfile = {
      id: uuidv7(),
      userId: uid,
      passportHandle: await allocateHandle(name),
      name,
      trade: '',
      experienceYears: 0,
      location: '',
      phone: req.user!.phone,
      skills: [],
      certifications: [],
      rating: 0,
      totalJobsCount: 0,
      totalEarnings: 0,
      verifiedStatus: 'unverified',
      joinedDate: new Date().toISOString(),
    };

    const { id, ...rest } = profile;
    await db.collection(PROFILES).insertOne({ _id: id as never, ...rest });
    const evidence = await calculateTrustEvidence(uid);
    return res.status(201).json({
      profile: {
        ...profile,
        rating: evidence.reviews.average ?? 0,
        totalJobsCount: evidence.jobs.completed,
        trustScore: evidence.score,
      },
      isNew: true,
    });
  } catch (err) {
    console.error('[passport] GET /me failed:', err);
    return res.status(500).json({ error: 'passport_read_failed', message: 'Could not load the passport.' });
  }
});

/**
 * PATCH /api/passport/me
 *
 * Only PATCHABLE fields are applied; anything else in the body is ignored
 * silently rather than rejected, so an over-eager client cannot be used to
 * probe which fields are protected.
 */
passportRouter.patch('/me', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  for (const field of PATCHABLE) {
    if (!(field in body)) continue;
    const value = body[field];

    // Minimal shape checks. Full validation lands Day 9; these three exist now
    // because the prototype accepted negative years and absurd rates silently
    // (audit, ProfileView.tsx:129-137).
    if (field === 'experienceYears' || field === 'dailyRate') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 100000) {
        return res.status(400).json({ error: 'invalid_field', field, message: `${field} must be between 0 and 100000.` });
      }
      updates[field] = n;
      continue;
    }
    if (field === 'skills' || field === 'certifications') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        return res.status(400).json({ error: 'invalid_field', field, message: `${field} must be an array of strings.` });
      }
      updates[field] = value;
      continue;
    }
    if (typeof value !== 'string') {
      return res.status(400).json({ error: 'invalid_field', field, message: `${field} must be a string.` });
    }
    updates[field] = value.trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: 'no_updatable_fields',
      message: `Provide at least one of: ${PATCHABLE.join(', ')}.`,
    });
  }

  try {
    const db = getDb();
    const result = await db.collection(PROFILES).findOneAndUpdate(
      { userId: req.user!.uid },          // ownership is the query, not a check after the fact
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'profile_not_found', message: 'Call GET /api/passport/me first.' });
    }

    const { _id, ...profile } = result;
    const evidence = await calculateTrustEvidence(req.user!.uid);
    return res.json({
      profile: {
        ...profile,
        id: String(_id),
        rating: evidence.reviews.average ?? 0,
        totalJobsCount: evidence.jobs.completed,
        trustScore: evidence.score,
      },
    });
  } catch (err) {
    console.error('[passport] PATCH /me failed:', err);
    return res.status(500).json({ error: 'passport_update_failed', message: 'Could not update the passport.' });
  }
});
