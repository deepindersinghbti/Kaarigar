import type { Request } from 'express';

/**
 * The absolute origin this server is reachable at.
 *
 * Shared by every surface that has to put a URL into something a person will
 * later open from somewhere else - the passport QR, and the review link. Those
 * two must agree, because a QR and a review link that disagree about the host
 * are two different deployments as far as a phone is concerned.
 *
 * PUBLIC_ORIGIN wins when set: it is the only way to be certain a PRINTED code
 * matches the domain the project actually demos on. Otherwise the origin is
 * reconstructed from the request. Render terminates TLS at its proxy and
 * forwards the original scheme in x-forwarded-proto, so reading req.protocol
 * alone yields "http" behind the proxy and bakes a mixed-content warning into
 * every link generated there.
 */
export function resolveOrigin(req: Request): string {
  const configured = process.env.PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/+$/, '');

  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
  const proto = forwarded || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}
