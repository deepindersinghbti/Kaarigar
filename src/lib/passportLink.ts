/**
 * The one place the client builds a public passport URL.
 *
 * Owner: Track B.
 *
 * WHY THIS EXISTS. The QR on the public passport page is generated server-side
 * from resolveOrigin(), and the Share button in the app hands out a URL for the
 * same page. If those two are built by different code they will eventually
 * disagree, and the way anyone finds out is a printed card that leads somewhere
 * else. So the client does not guess an origin: it asks the server for the one
 * the QR was built from, and falls back to its own location only when it has
 * not been told yet.
 *
 * The fallback is correct in every ordinary case - the server reconstructs the
 * origin from the request the browser made, so the two agree by construction.
 * It is wrong in exactly one case, which is the case that matters: PUBLIC_ORIGIN
 * set to pin printed codes to a chosen domain. Hence the prime() call.
 */

let serverOrigin: string | null = null;

/**
 * Ask the server which origin it is publishing.
 *
 * Called once at startup, unauthenticated, and deliberately failure-tolerant:
 * a Share button that throws because a health check timed out is worse than one
 * that falls back to an origin which is almost always identical.
 */
export async function primePassportOrigin(): Promise<void> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return;
    const body = await res.json();
    if (typeof body?.publicOrigin === 'string' && body.publicOrigin) {
      serverOrigin = body.publicOrigin.replace(/\/+$/, '');
    }
  } catch {
    // Offline, or the server is asleep. Keep the fallback.
  }
}

/** The absolute, shareable URL for a passport handle. */
export function passportUrl(handle: string): string {
  const origin =
    serverOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/p/${handle}`;
}
