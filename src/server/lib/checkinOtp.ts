import { createHmac, randomInt, timingSafeEqual } from 'crypto';

/**
 * The arrival code: a 4-digit number the customer holds and the kaarigar types
 * on the doorstep.
 *
 * Owner: Track A. See KAARIGAR_RELIABILITY_FEATURE.md §3 and §9.2 D7.
 *
 * WHAT THIS CODE ACTUALLY PROVES, and therefore what must never leak. The
 * kaarigar can only produce it by being in front of the customer. That is the
 * entire evidentiary value of ON_TIME, and it evaporates the moment a
 * kaarigar-facing response contains the code or its hash - a worker who can
 * read either can check in from the other side of the city. Every read path
 * strips it; see shapeBooking in data/bookings.ts, which is the one function
 * allowed to turn a stored booking into a client-facing one.
 *
 * KEYED HMAC, NOT sha256(otp + bookingId) as §3 sketched. A 4-digit code has
 * ten thousand possible values and the booking id is known to anyone holding
 * the row, so an unkeyed digest is ten thousand guesses on a laptop the moment
 * the database leaks - which is to say, no protection at all. With a secret in
 * the construction the digest is worthless without the key.
 *
 * ITS OWN SECRET, not JWT_SECRET. CLAUDE.md forbids rotating JWT_SECRET because
 * doing so invalidates every outstanding review link; hanging a third mechanism
 * off it would make that constraint harder still. CHECKIN_OTP_SECRET can be
 * rotated freely - the blast radius is that open bookings need a re-issued
 * code, which is recoverable, unlike silently breaking review links.
 */

const MIN_SECRET_LENGTH = 32;

/**
 * Fail loudly and at first use rather than hashing with a default.
 *
 * Deliberately not read at import: the server must still boot and serve every
 * unrelated route when this one variable is missing, exactly as tokens.ts does.
 * The failure surfaces on the first check-in, naming the variable and how to
 * generate it, instead of as a dead process at deploy time.
 */
function secret(): string {
  const value = process.env.CHECKIN_OTP_SECRET;
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `CHECKIN_OTP_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters. ` +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return value;
}

/**
 * A 4-digit code, zero-padded, from a CSPRNG.
 *
 * randomInt, not Math.random: this is a credential that gates the one piece of
 * evidence in the system a worker cannot self-assert, and a predictable
 * sequence would let one be guessed from a previous booking's code.
 *
 * Four digits is the brief's choice and is right for the user - it is read
 * aloud or off a screen by someone who may not read well. The attempt cap and
 * the lock below are what make a short code safe, not its length.
 */
export function generateCheckinOtp(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

/**
 * The stored form. Bound to the booking id, so a code lifted from one booking
 * cannot be replayed against another even if the same digits come up twice.
 */
export function hashCheckinOtp(code: string, bookingId: string): string {
  return createHmac('sha256', secret()).update(`${bookingId}:${code}`).digest('hex');
}

/**
 * Constant-time comparison. A length check first, because timingSafeEqual
 * throws on mismatched buffers - and a stored value that is not valid hex
 * (a truncated write, a hand-edited document) must read as "wrong code" rather
 * than as a 500 that tells the caller something interesting.
 */
export function checkinOtpMatches(code: string, bookingId: string, expected: string): boolean {
  if (typeof expected !== 'string' || expected.length === 0) return false;

  const actual = Buffer.from(hashCheckinOtp(code, bookingId), 'hex');
  const target = Buffer.from(expected, 'hex');
  if (actual.length !== target.length) return false;

  return timingSafeEqual(actual, target);
}
