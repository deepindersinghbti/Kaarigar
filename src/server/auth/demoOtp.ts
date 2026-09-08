import { timingSafeEqual } from 'crypto';

/**
 * A fixed OTP for the seeded demo numbers, for the stage demo only.
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
 * 2. SCOPED TO AN EXPLICIT LIST. demoOtpAccepts() returns false for any phone
 *    that is not on the configured list, before the submitted code is examined
 *    at all - so for every other number the code has no influence on the result
 *    or on how long the check takes. The list is whatever DEMO_OTP_PHONE names
 *    and nothing else; there is no pattern, prefix or wildcard form.
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

/**
 * A ceiling on how many numbers one variable may enable.
 *
 * The demo has two actors; four is slack, not a policy. It exists so that a
 * mangled value - a pasted column, a stray join - cannot quietly turn the
 * bypass on for a crowd. Over the cap is off, like every other malformed case.
 */
const MAX_DEMO_PHONES = 4;

export interface DemoOtpConfig {
  /** Every number the fixed code is accepted for. Never empty. */
  phones: string[];
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

  /**
   * One number, or several separated by commas.
   *
   * The VARIABLE IS UNCHANGED and so is render.yaml, which declares
   * DEMO_OTP_PHONE as sync:false with no literal. A value containing no comma
   * yields a one-element list, which is exactly the previous behaviour - so an
   * existing deployment keeps working without anyone touching it first, and
   * there is no window during a rollout where login is half-configured.
   */
  const phones = String(process.env.DEMO_OTP_PHONE ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  const code = String(process.env.DEMO_OTP_CODE ?? '').trim();

  // Unparseable means off, not "off for this field". A half-valid config that
  // silently accepted some other number would be worse than no feature.
  //
  // ALL-OR-NOTHING ACROSS THE LIST, for the same reason. One malformed entry
  // disables the bypass entirely rather than being dropped from it: silently
  // ignoring an entry turns a typo into "the demo account did not work on
  // stage", discovered live, with nothing anywhere saying why.
  if (phones.length === 0 || phones.length > MAX_DEMO_PHONES) return null;
  if (!phones.every((entry) => E164_IN.test(entry))) return null;
  if (!SIX_DIGITS.test(code)) return null;

  return { phones, code };
}

/**
 * Does the demo bypass accept this (phone, code) pair?
 *
 * ORDER IS DELIBERATE. The phone is matched first and returns immediately when
 * it is not on the list, so a non-demo number never reaches the code
 * comparison. That is what makes "no behaviour change and no timing difference
 * for any other number" true rather than asserted: for those numbers the
 * submitted code is never read, so it cannot influence timing. includes() over
 * a list of at most MAX_DEMO_PHONES preserves that - the work it does depends
 * on the configured list, never on the submitted code.
 *
 * The code comparison itself is constant-time. A byte-wise early return would
 * leak the code one character at a time to anyone who already knew the demo
 * number and could measure - and the demo number is not a secret.
 */
export function demoOtpAccepts(phone: string, submittedCode: string): boolean {
  const config = resolveDemoOtp();
  if (!config) return false;
  if (!config.phones.includes(phone)) return false;

  const expected = Buffer.from(config.code, 'utf8');
  const provided = Buffer.from(String(submittedCode ?? ''), 'utf8');
  if (expected.length !== provided.length) return false;

  return timingSafeEqual(expected, provided);
}

/**
 * Whether the bypass is on, for startup logging.
 *
 * Returns a boolean and the PHONES only - never the code. The numbers are
 * already visible to anyone who watches the demo; the code is the part that
 * must not leave this module.
 */
export function demoOtpStatus(): { enabled: boolean; phones?: string[] } {
  const config = resolveDemoOtp();
  return config ? { enabled: true, phones: config.phones } : { enabled: false };
}
