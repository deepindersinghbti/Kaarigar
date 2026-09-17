/**
 * Server-side switches the screens need to know about, read once from
 * /api/health.
 *
 * Owner: Track B.
 *
 * WHY NOT A VITE_ FLAG. Anything here is decided by the server's environment
 * and can change with a restart, not a rebuild. A build-time copy would let the
 * screen and the server disagree about what is on - for the LATE demo, a slot
 * button the worker can see on a server that has turned it off.
 *
 * Failure-tolerant like primePassportOrigin in passportLink.ts: if the health
 * check fails, every flag reads as off, which is always the safe reading here.
 */

export interface ServerFlags {
  /** BOOKINGS_ENABLED. Decides whether booking-only controls are drawn at all. */
  bookings: boolean;
  /** Offer the demo-only "2 minutes from now" slot. See bookingDemoSlotsEnabled(). */
  bookingDemoSlots: boolean;
}

const OFF: ServerFlags = { bookings: false, bookingDemoSlots: false };

let pending: Promise<ServerFlags> | null = null;

/**
 * The flags, fetched at most once per page load and shared by every caller.
 *
 * A failed fetch is NOT cached, so a server that was asleep at first ask is
 * asked again next time rather than leaving the flags off for the session.
 */
export function getServerFlags(): Promise<ServerFlags> {
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error(`health ${res.status}`);
        const body = await res.json();
        return { bookings: body?.bookingsEnabled === true, bookingDemoSlots: body?.bookingDemoSlots === true };
      } catch {
        pending = null;
        return OFF;
      }
    })();
  }
  return pending;
}
