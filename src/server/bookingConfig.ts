/**
 * Every deadline, limit and window the booking lifecycle depends on, in one
 * place, each overridable by an environment variable.
 *
 * Owner: Track A. See KAARIGAR_RELIABILITY_FEATURE.md §1 and §9.4.
 *
 * WHY THE VALUES ARE READ ON EVERY CALL rather than frozen at import.
 *
 * Two callers need them to change without a code change. The LATE-state demo
 * shortens ARRIVAL_GRACE_MIN and NO_SHOW_AFTER_MIN to seconds so a judge can
 * watch a no-show happen in ninety seconds instead of a day; and the test suite
 * sets a different window per case inside one process. A module-level constant
 * captured at import makes both impossible - the test would need a subprocess
 * per case, and the demo would need a redeploy. Reading process.env is a hash
 * lookup, and the sweeper touches this once per batch, not once per document.
 *
 * NO TIMERS LIVE HERE OR ANYWHERE ELSE. Render's free plan spins the container
 * down when idle, so a setTimeout holding a deadline dies with the process that
 * set it. Deadlines are DATA - a date on the booking - and are applied by
 * whatever reads the row next, or by the external sweeper. See §9.2 D8.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * A positive-integer env override, or the fallback.
 *
 * A malformed value warns and falls back rather than throwing. These are demo
 * knobs; a typo in NO_SHOW_AFTER_MIN should not take the server down at boot,
 * and silently reading it as NaN would push every booking past every deadline
 * at once - which is the loudest possible failure disguised as the quietest.
 */
function numberFromEnv(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) {
    console.warn(
      `[bookings] ${name}="${raw}" is not a number >= ${min}; using the default ${fallback}.`
    );
    return fallback;
  }
  return value;
}

/**
 * THE MASTER SWITCH for booking commitments and the reliability ledger.
 *
 * DEFAULT FALSE, and false must be byte-for-byte the behaviour that shipped
 * before this feature existed: no booking is created, no slot or arrival code
 * is required, no event is written, and the trust rubric reads its old
 * cancellation-rate source. The feature is additive until somebody turns it on.
 *
 * That is not caution for its own sake. This lands days before a demo on a
 * free-tier instance, and every route it touches is one both roles already
 * depend on - the quote flow, the customer's accept, the worker's lifecycle
 * walk. A switch that restores the known-good path in one environment variable
 * and a restart is worth more on the day than any amount of confidence in the
 * new code.
 *
 * Read through a function, not a module constant, for the same reason as the
 * windows below: the test suites flip it inside one process.
 *
 * NOT a VITE_ variable. This is a server-side decision; the client discovers
 * what a job needs from the server's responses, not from a build-time flag it
 * could disagree with.
 */
export function bookingsEnabled(): boolean {
  return String(process.env.BOOKINGS_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export interface BookingConfig {
  /** Deadline to make a FIRST RESPONSE to an urgent request, in minutes. */
  acceptWindowUrgentMin: number;
  /** Deadline to make a first response to a normal request, in minutes. */
  acceptWindowNormalMin: number;
  /**
   * Deadline to choose a slot once the price is agreed, in minutes.
   *
   * Not in the original brief. Without it, a kaarigar could quote inside the
   * accept window, watch the customer agree the price, and then simply never
   * name a time - answering the mentor's first question while dodging the
   * second. See §9.4 correction C.
   */
  scheduleWindowMin: number;
  /** arriveBy = slotEnd + this, in minutes. */
  arrivalGraceMin: number;
  /** LATE becomes NO_SHOW this long after arriveBy, in minutes. */
  noShowAfterMin: number;
  /** Minimum notice for a reschedule, in hours. */
  rescheduleMinNoticeH: number;
  /** A kaarigar cancel inside this many hours of slotStart is a late cancel. */
  lateCancelNoticeH: number;
  /** Reschedule ATTEMPTS allowed per booking. May legitimately be 0. */
  maxReschedules: number;
  /** Wrong check-in codes before the lock, per booking. */
  checkinOtpMaxAttempts: number;
  /** How long check-in stays locked after too many wrong codes, in minutes. */
  checkinLockMin: number;
  /** Documents one sweeper pass will touch per rule. */
  sweepBatchSize: number;
  /** A slot longer than this is refused, in hours. */
  maxSlotHours: number;
  /** A slot starting further ahead than this is refused, in days. */
  maxSlotDaysAhead: number;
}

export function bookingConfig(): BookingConfig {
  return {
    acceptWindowUrgentMin: numberFromEnv('ACCEPT_WINDOW_URGENT_MIN', 30),
    acceptWindowNormalMin: numberFromEnv('ACCEPT_WINDOW_NORMAL_MIN', 240),
    scheduleWindowMin: numberFromEnv('SCHEDULE_WINDOW_MIN', 1440),
    arrivalGraceMin: numberFromEnv('ARRIVAL_GRACE_MIN', 60),
    noShowAfterMin: numberFromEnv('NO_SHOW_AFTER_MIN', 1440),
    rescheduleMinNoticeH: numberFromEnv('RESCHEDULE_MIN_NOTICE_H', 12),
    lateCancelNoticeH: numberFromEnv('LATE_CANCEL_NOTICE_H', 12),
    // Zero is a legal setting: it turns reschedules off entirely.
    maxReschedules: numberFromEnv('MAX_RESCHEDULES', 1, 0),
    /**
     * NOT named OTP_MAX_ATTEMPTS. That name is already exported from
     * auth/tokens.ts for LOGIN codes, and two constants with one name across
     * two security-relevant domains is a mis-import nobody would notice.
     */
    checkinOtpMaxAttempts: numberFromEnv('CHECKIN_OTP_MAX_ATTEMPTS', 5),
    checkinLockMin: numberFromEnv('CHECKIN_LOCK_MIN', 15),
    sweepBatchSize: numberFromEnv('SWEEP_BATCH_SIZE', 200),
    maxSlotHours: numberFromEnv('MAX_SLOT_HOURS', 12),
    maxSlotDaysAhead: numberFromEnv('MAX_SLOT_DAYS_AHEAD', 14),
  };
}

/**
 * Server time, and the only clock this feature reads.
 *
 * Every function that cares about time takes `now: number = nowMs()` rather
 * than calling Date.now() inside itself, which is what lets the tests drive a
 * booking through a 24-hour no-show in a millisecond without touching a global
 * or faking timers. The brief calls this "inject a now() function"; passing it
 * as a defaulted parameter is the version of that with no mutable state in it.
 *
 * CLIENT TIME IS NEVER TRUSTED for any deadline. A device clock that is wrong,
 * or set wrong on purpose, must not be able to make a late arrival on time.
 */
export function nowMs(): number {
  return Date.now();
}

/** The first-response window for a request, in ms. */
export function acceptWindowMs(urgent: boolean): number {
  const config = bookingConfig();
  return (urgent ? config.acceptWindowUrgentMin : config.acceptWindowNormalMin) * MINUTE_MS;
}
