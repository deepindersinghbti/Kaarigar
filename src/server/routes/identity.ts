import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID, randomInt } from 'crypto';
import { uuidv7 } from '../../lib/ids';
import { getDb, isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { demoOtpAccepts } from '../auth/demoOtp';
import { DEMO_CUSTOMER_PHONE, DEMO_CUSTOMER_NAME, demoCustomerEnabled, demoCustomerAccepts } from '../auth/demoCustomer';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashOtp,
  otpMatches,
  ACCESS_TTL_SECONDS,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  type AuthUser,
  type Role,
} from '../auth/tokens';

/**
 * identity-svc - phone OTP auth, roles, sessions.
 *
 * FALLBACK PATH (plan, Day 2 decision point). Firebase phone OTP could not be
 * verified: a valid reCAPTCHA token was produced and Google returned
 * INVALID_APP_CREDENTIAL, after billing, provider, region policy, authorized
 * domains and API key were all confirmed correct. Per the plan this falls back
 * to our own OTP endpoint with IDENTICAL ARCHITECTURE AND STUBBED DELIVERY ONLY.
 *
 * What is real: the challenge lifecycle, hashed codes, expiry, attempt caps,
 * single use, request throttling, signed JWTs, 15-minute access tokens,
 * rotating refresh tokens with reuse detection, and the users collection.
 *
 * What is stubbed: the SMS itself. The code is written to the server log
 * instead of being sent. SAY THIS PLAINLY ON STAGE - 14.1 endorses labelled
 * stubs and warns that claiming an integration you do not have is the fastest
 * way to lose a panel.
 *
 * Owner: Track A. Mounted at /api/auth.
 */

export const identityRouter = Router();

const CHALLENGES = 'otp_challenges';
const USERS = 'users';

/** Requests allowed per phone number inside the challenge TTL. */
const MAX_CHALLENGES_PER_WINDOW = 3;

const E164_IN = /^\+91\d{10}$/;

let indexesReady = false;
async function ensureIndexes() {
  if (indexesReady) return;
  const db = getDb();
  await db.collection(CHALLENGES).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection(CHALLENGES).createIndex({ phone: 1, createdAt: -1 });
  await db.collection(USERS).createIndex({ phone: 1 }, { unique: true });
  indexesReady = true;
}

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Authentication requires the database. Check MONGODB_URI and the Atlas allowlist.',
  });
  return false;
}

/**
 * POST /api/auth/otp/request
 *
 * Generates a code, stores only its hash, and logs the code server-side.
 * Answers the same way whether or not the number has been seen before - a
 * differing response would turn this into a phone-number enumeration oracle.
 */
identityRouter.post('/otp/request', async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const phone = String(req.body?.phone ?? '').trim();
  if (phone === DEMO_CUSTOMER_PHONE && !demoCustomerEnabled()) {
    return res.status(503).json({ error: 'customer_demo_disabled', message: 'The customer demo login has not been configured on this server.' });
  }
  if (!E164_IN.test(phone)) {
    return res.status(400).json({
      error: 'invalid_phone',
      message: 'phone must be E.164 for India: +91 followed by 10 digits.',
    });
  }

  try {
    await ensureIndexes();
    const db = getDb();
    const now = new Date();

    const recent = await db.collection(CHALLENGES).countDocuments({
      phone,
      createdAt: { $gt: new Date(now.getTime() - OTP_TTL_SECONDS * 1000) },
    });
    if (recent >= MAX_CHALLENGES_PER_WINDOW) {
      return res.status(429).json({
        error: 'too_many_requests',
        message: `At most ${MAX_CHALLENGES_PER_WINDOW} codes per ${OTP_TTL_SECONDS / 60} minutes.`,
      });
    }

    const challengeId = randomUUID();
    const code = String(randomInt(0, 1000000)).padStart(6, '0');

    await db.collection(CHALLENGES).insertOne({
      _id: challengeId as never,
      phone,
      codeHash: hashOtp(code, challengeId),
      attempts: 0,
      consumedAt: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    });

    // THE STUB. Real delivery would replace exactly this line.
    if (phone !== DEMO_CUSTOMER_PHONE) console.log(
      '\n[auth] ===== STUBBED OTP DELIVERY =====\n' +
      `[auth]  phone: ${phone}\n` +
      `[auth]  code : ${code}\n` +
      `[auth]  valid: ${OTP_TTL_SECONDS / 60} minutes\n` +
      '[auth] ================================\n'
    );

    return res.status(201).json({
      challengeId,
      expiresInSeconds: OTP_TTL_SECONDS,
      delivery: phone === DEMO_CUSTOMER_PHONE ? 'customer_demo_code' : 'stubbed_server_log',
      // Convenience for local work only. Absent in production, so the deployed
      // build cannot leak a code even if this endpoint is scraped.
      ...(process.env.NODE_ENV !== 'production' && phone !== DEMO_CUSTOMER_PHONE ? { devCode: code } : {}),
    });
  } catch (err) {
    console.error('[auth] otp/request failed:', err);
    return res.status(500).json({ error: 'otp_request_failed', message: 'Could not create a challenge.' });
  }
});

/**
 * POST /api/auth/otp/verify
 *
 * Consumes the challenge, upserts the user on first login, and issues a real
 * signed access + refresh pair.
 */
identityRouter.post('/otp/verify', async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const challengeId = String(req.body?.challengeId ?? '').trim();
  const code = String(req.body?.code ?? '').trim();
  if (!challengeId || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'challengeId and a 6-digit code are required.',
    });
  }

  try {
    const db = getDb();
    const challenge = await db.collection(CHALLENGES).findOne({ _id: challengeId as never });

    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
      return res.status(400).json({
        error: 'challenge_invalid',
        message: 'Challenge is unknown, already used, or expired.',
      });
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'too_many_attempts', message: 'Too many attempts. Request a new code.' });
    }

    /**
     * The real hashed code, or the demo bypass for one configured number.
     *
     * demoOtpAccepts() is false whenever the bypass is off, and false for every
     * phone that is not the configured one - checked before the submitted code
     * is examined - so this line changes nothing for any other number.
     *
     * It sits INSIDE the existing guards on purpose. The challenge must still
     * exist, be unconsumed, be unexpired, and be under the attempt cap before
     * we get here, so the bypass shortens the code, never the flow.
     */
    // The reserved demo identity uses its own code, never the worker's code
    // or the stubbed SMS code. Ordinary phone authentication is unchanged.
    const accepted = challenge.phone === DEMO_CUSTOMER_PHONE
      ? demoCustomerAccepts(challenge.phone, code)
      : otpMatches(code, challengeId, challenge.codeHash) || demoOtpAccepts(challenge.phone as string, code);

    if (!accepted) {
      await db.collection(CHALLENGES).updateOne({ _id: challengeId as never }, { $inc: { attempts: 1 } });
      return res.status(401).json({
        error: 'incorrect_code',
        attemptsRemaining: OTP_MAX_ATTEMPTS - (challenge.attempts + 1),
      });
    }

    // Single use: burn the challenge before issuing anything.
    await db.collection(CHALLENGES).updateOne(
      { _id: challengeId as never },
      { $set: { consumedAt: new Date() } }
    );

    const phone = challenge.phone as string;
    const now = new Date();
    const existing = await db.collection(USERS).findOne({ phone });

    let user: AuthUser;
    if (existing) {
      if (phone === DEMO_CUSTOMER_PHONE &&
          (existing.roles?.length !== 1 || existing.roles[0] !== 'customer')) {
        return res.status(409).json({ error: 'demo_identity_conflict', message: 'This demo identifier already belongs to another role. An administrator must review it; no account was changed.' });
      }
      await db.collection(USERS).updateOne({ phone }, { $set: { lastLoginAt: now } });
      user = { uid: String(existing._id), phone, roles: existing.roles as Role[] };
    } else {
      // D5: contract ids are v7. Mixing v4 and v7 in one collection breaks
      // the sort silently. Challenge ids below stay v4 - ephemeral, never sorted.
      const uid = uuidv7();
      const roles: Role[] = phone === DEMO_CUSTOMER_PHONE ? ['customer'] : ['kaarigar'];
      await db.collection(USERS).insertOne({
        _id: uid as never,
        phone,
        roles,
        ...(phone === DEMO_CUSTOMER_PHONE ? { name: DEMO_CUSTOMER_NAME, demo: true } : {}),
        createdAt: now,
        lastLoginAt: now,
      });
      user = { uid, phone, roles };
    }

    const refresh = signRefreshToken(user.uid);
    await db.collection(USERS).updateOne(
      { _id: user.uid as never },
      { $set: { refreshJti: refresh.jti, refreshFamily: refresh.family, refreshRevoked: false } }
    );

    return res.json({
      accessToken: signAccessToken(user),
      refreshToken: refresh.token,
      expiresInSeconds: ACCESS_TTL_SECONDS,
      user,
      isNewUser: !existing,
    });
  } catch (err) {
    console.error('[auth] otp/verify failed:', err);
    return res.status(500).json({ error: 'otp_verify_failed', message: 'Could not verify the code.' });
  }
});

/**
 * POST /api/auth/refresh - rotate, with reuse detection (12.1).
 *
 * Presenting a refresh token that has already been rotated means the token was
 * captured. The whole family is revoked rather than just that token, because a
 * legitimate holder and an attacker are indistinguishable at this point.
 */
identityRouter.post('/refresh', async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const token = String(req.body?.refreshToken ?? '').trim();
  if (!token) return res.status(400).json({ error: 'invalid_request', message: 'refreshToken is required.' });

  try {
    const claims = verifyRefreshToken(token);
    const db = getDb();
    const record = await db.collection(USERS).findOne({ _id: claims.sub as never });

    if (!record || record.refreshRevoked) {
      return res.status(401).json({ error: 'refresh_revoked', message: 'Session revoked. Sign in again.' });
    }

    if (record.refreshJti !== claims.jti) {
      await db.collection(USERS).updateOne(
        { _id: claims.sub as never },
        { $set: { refreshRevoked: true, refreshRevokedAt: new Date() } }
      );
      console.warn(`[auth] refresh token reuse detected for uid=${claims.sub}; family revoked`);
      return res.status(401).json({
        error: 'refresh_reuse_detected',
        message: 'This session has been revoked for security. Sign in again.',
      });
    }

    const user: AuthUser = {
      uid: String(record._id),
      phone: record.phone as string,
      roles: record.roles as Role[],
    };
    const rotated = signRefreshToken(user.uid, claims.family);
    await db.collection(USERS).updateOne(
      { _id: user.uid as never },
      { $set: { refreshJti: rotated.jti } }
    );

    return res.json({
      accessToken: signAccessToken(user),
      refreshToken: rotated.token,
      expiresInSeconds: ACCESS_TTL_SECONDS,
    });
  } catch {
    return res.status(401).json({ error: 'invalid_refresh_token', message: 'Refresh token could not be verified.' });
  }
});

/** GET /api/auth/me - proves requireAuth works end to end. */
identityRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});
