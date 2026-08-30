import { timingSafeEqual } from 'crypto';

/**
 * A fixed OTP for ONE seeded demo number, for the stage demo only.
 *
 * Owner: Track A. Server-side only.
 *
 * WHY IT EXISTS. Deleting VITE_DEMO_TOKEN put login on the critical path, and
 * OTP delivery is stubbed to the server log - which on stage means reading
 * Render's dashboard mid-demo. Even with Firebase working, live SMS makes the
 * demo depend on venue reception and a 90-second delivery window. This removes
 * that dependency for one number and changes nothing for any other.
 *
 * ---------------------------------------------------------------------------
 * THE CONSTRAINTS ARE ENFORCED HERE, IN CODE, NOT BY CONVENTION.
 *
 * 1. SERVER-SIDE ONLY. None of these variables carry a VITE_ prefix, so Vite
 *    cannot inline them and they cannot reach the browser bundle. This is the
 *    exact shape of the VITE_DEMO_TOKEN mistake and the prefix is the whole
 *    reason that one shipped a live credential to every visitor.
 *
 * 2. SCOPED TO ONE NUMBER. demoOtpAccepts() returns false for any phone that is
 *    not the configured one, before the submitted code is examined at all - so
 *    for every other number the code has no influence on the result or on how
 *    long the check takes.
 *
 * 3. OFF UNLESS EXPLICITLY ENABLED. Three variables must all be present and
 *    well-formed. Absent, malformed, or DEMO_OTP_ENABLED set to anything other
 *    than "true" means off. There is no default-on path and no partial config
 *    that half-works.
 *
 * 4. THE CODE IS NEVER DISCLOSED. It is never logged, never placed in a
 *    response body, and never interpolated into an error message. Nothing in
 *    this module writes it anywhere, and nothing outside it reads it - callers
 *    get a boolean.
 * ---------------------------------------------------------------------------
 */

const E164_IN = /^\+91\d{10}$/;
const SIX_DIGITS = /^\d{6}$/;

export interface DemoOtpConfig {
  phone: string;
  /** Never log, return, or interpolate this. Compare it and discard it. */
  code: string;
}

/**
 * The active configuration, or null when the bypass is off.
 *
 * Read from the environment on every call rather than cached at module load, so
 * that a test can turn it on and off in-process and so that nothing has to
 * reason about import order. It is three string checks; it is not hot.
 */
export function resolveDemoOtp(): DemoOtpConfig | null {
  if (String(process.env.DEMO_OTP_ENABLED ?? '').trim().toLowerCase() !== 'true') {
    return null;
  }

  const phone = String(process.env.DEMO_OTP_PHONE ?? '').trim();
  const code = String(process.env.DEMO_OTP_CODE ?? '').trim();

  // Unparseable means off, not "off for this field". A half-valid config that
  // silently accepted some other number would be worse than no feature.
  if (!E164_IN.test(phone)) return null;
  if (!SIX_DIGITS.test(code)) return null;

  return { phone, code };
}

/**
 * Does the demo bypass accept this (phone, code) pair?
 *
 * ORDER IS DELIBERATE. The phone is compared first and returns immediately on a
 * mismatch, so a non-demo number never reaches the code comparison. That is
 * what makes "no behaviour change and no timing difference for any other
 * number" true rather than asserted: for those numbers the submitted code is
 * never read, so it cannot influence timing.
 *
 * The code comparison itself is constant-time. A byte-wise early return would
 * leak the code one character at a time to anyone who already knew the demo
 * number and could measure - and the demo number is not a secret.
 */
export function demoOtpAccepts(phone: string, submittedCode: string): boolean {
  const config = resolveDemoOtp();
  if (!config) return false;
  if (phone !== config.phone) return false;

  const expected = Buffer.from(config.code, 'utf8');
  const provided = Buffer.from(String(submittedCode ?? ''), 'utf8');
  if (expected.length !== provided.length) return false;

  return timingSafeEqual(expected, provided);
}

/**
 * Whether the bypass is on, for startup logging.
 *
 * Returns a boolean and the PHONE only - never the code. The phone is already
 * visible to anyone who watches the demo; the code is the part that must not
 * leave this module.
 */
export function demoOtpStatus(): { enabled: boolean; phone?: string } {
  const config = resolveDemoOtp();
  return config ? { enabled: true, phone: config.phone } : { enabled: false };
}
