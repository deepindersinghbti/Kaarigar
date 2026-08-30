import { getDb } from '../db';

/**
 * Data access for kaarigar_profiles.
 *
 * Exists because of Architecture 5.2: service boundaries are real, and no
 * module reads another module's collection directly. passport-svc owns this
 * collection; ledger-svc and (later) sync-svc and reputation-svc need to
 * resolve a user to their profile, so that lookup lives here rather than being
 * duplicated as a raw query in each of them.
 *
 * Keeping this seam now is what makes the boundary claim true rather than
 * aspirational - it is the one thing Amendment 1 promises in exchange for not
 * porting to FastAPI.
 *
 * Owner: Track A.
 */

export const PROFILES = 'kaarigar_profiles';

/**
 * The profile id for an authenticated user, or null if they have none yet.
 *
 * Ledger entries are keyed by profileId per the contract, but authentication
 * yields a uid - this is the only sanctioned way to bridge the two.
 */
export async function getProfileIdForUser(uid: string): Promise<string | null> {
  const doc = await getDb().collection(PROFILES).findOne({ userId: uid }, { projection: { _id: 1 } });
  return doc ? String(doc._id) : null;
}
