import { getDb } from '../db';
import { areaOf, type Area } from '../../lib/areas';
import type { WorkerProfile } from '../../types';

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

/**
 * The fields a public passport page may show.
 *
 * An ALLOWLIST, and a deliberately narrow one. Architecture section 8 specifies
 * "only fields the worker marked public", but WorkerProfile carries no
 * per-field visibility flag and types.ts is frozen, so per-field control is a
 * V1 change. Until it exists, the safe reading of that requirement is to
 * publish only what a customer needs in order to decide whether to trust this
 * worker, and nothing else.
 *
 * Excluded, and why - each of these is a privacy defect if it leaks, not a
 * missing feature:
 *   phone          PII. Section 12.2 data minimisation. A public page that
 *                  publishes a phone number is a scraping target, and the
 *                  worker never consented to that.
 *   totalEarnings  Income is the private core of the product. Section 4F makes
 *                  every income disclosure consent-mediated with a named
 *                  purpose and an expiry. A public page is the exact opposite.
 *   dailyRate      A negotiating position. Mol-Bhav publishes bands for a task
 *                  (section 4C), never one worker's private floor.
 *   bloodGroup     Health data. A customer hiring a plumber has no use for it.
 *   userId         Internal identifier; nothing outside the server needs it.
 *
 * Derived with Pick from the frozen contract rather than declared as a new
 * interface, so this adds no second definition of a profile that could drift
 * from types.ts.
 */
export type PublicProfile = Pick<
  WorkerProfile,
  | 'passportHandle'
  | 'name'
  | 'trade'
  | 'ncoCode'
  | 'experienceYears'
  | 'location'
  | 'skills'
  | 'certifications'
  | 'rating'
  | 'totalJobsCount'
  | 'verifiedStatus'
  | 'joinedDate'
  | 'bio'
>;

const PUBLIC_PROJECTION = {
  _id: 0,
  passportHandle: 1,
  name: 1,
  trade: 1,
  ncoCode: 1,
  experienceYears: 1,
  location: 1,
  skills: 1,
  certifications: 1,
  rating: 1,
  totalJobsCount: 1,
  verifiedStatus: 1,
  joinedDate: 1,
  bio: 1,
} as const;

/**
 * Look up a passport by its public handle, or null if there is no such handle.
 *
 * The projection is applied in the QUERY, not after it, so the excluded fields
 * never enter the process at all. A later refactor cannot accidentally spread
 * a full document into a template, because the full document was never loaded.
 *
 * Unauthenticated by design - this backs GET /p/:handle. That is safe only
 * because of the projection above, which is why the two live together here
 * rather than the projection sitting in the route.
 */
export async function findPublicProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const doc = await getDb()
    .collection(PROFILES)
    .findOne({ passportHandle: handle }, { projection: PUBLIC_PROJECTION });
  return (doc as PublicProfile | null) ?? null;
}

/**
 * Every passport, for the customer-facing browse list. Backs GET /api/kaarigars.
 *
 * SAME PUBLIC_PROJECTION AS findPublicProfileByHandle ABOVE - the identifier,
 * not a copy of the field list. That is the whole reason this function lives
 * here instead of in the route: a second list of field names in a second file
 * is a privacy guarantee maintained in two places, and the failure mode is
 * silent. Add a field to WorkerProfile and the passport page keeps hiding it
 * while the directory starts publishing it, with nothing failing to say so.
 *
 * Returning PublicProfile[] means `phone`, `totalEarnings`, `dailyRate` and
 * `bloodGroup` are not merely unrendered - they never leave the database, and
 * the type will not let a caller reach for them.
 *
 * Sorted by rating, then name for a stable order under equal ratings. No
 * pagination: the locked scope seeds six passports, and a limit/cursor pair
 * that is never exercised is a code path that is never tested.
 *
 * `trade` is matched case-insensitively through a collation rather than a
 * regex, so nothing from the query string is ever compiled as a pattern.
 */
export async function listPublicProfiles(trade?: string, near?: Area): Promise<PublicProfile[]> {
  const filter = trade ? { trade } : {};
  const docs = await getDb()
    .collection(PROFILES)
    .find(filter, { projection: PUBLIC_PROJECTION })
    .collation({ locale: 'en', strength: 2 })
    .sort({ rating: -1, name: 1 })
    .toArray();

  const profiles = docs as unknown as PublicProfile[];
  if (!near) return profiles;

  /**
   * Area ranking is applied HERE rather than in the query, because the area is
   * derived from free text by areaOf() and Mongo cannot run that. The set is
   * six seeded passports with no pagination (see above), so sorting them in
   * process costs nothing; if this list ever grows past a screenful, the area
   * belongs in a stored field and this becomes a query again.
   *
   * A PARTITION, NOT A FILTER. Workers elsewhere stay in the list, below the
   * local ones. A customer in Zirakpur with no plumber in Zirakpur should see
   * the Mohali plumber, not an empty screen - the ordering is a preference, and
   * turning it into a hard filter would make the feature worse the emptier the
   * directory is.
   *
   * Array.prototype.sort is stable in every supported engine, so the rating and
   * name order established by the query above survives inside each group.
   */
  return [...profiles].sort((a, b) => {
    const aNear = areaOf(a.location) === near ? 0 : 1;
    const bNear = areaOf(b.location) === near ? 0 : 1;
    return aNear - bNear;
  });
}

/**
 * The display name for a user id, for surfaces that know the worker only as a
 * job's kaarigarId - the review form, which reaches the worker through a job
 * rather than through a handle.
 *
 * Falls back to a neutral label rather than an empty string, so a profile that
 * has not been named yet renders as "this kaarigar" instead of a page with a
 * hole where a person should be.
 */
export async function findDisplayNameByUserId(uid: string): Promise<string> {
  const doc = await getDb()
    .collection(PROFILES)
    .findOne({ userId: uid }, { projection: { name: 1 } });
  const name = doc && typeof doc.name === 'string' ? doc.name.trim() : '';
  return name || 'this kaarigar';
}

/**
 * The owner's user id for a passport handle. SERVER-SIDE JOIN KEY ONLY.
 *
 * Reviews are stored against subjectId, which is the kaarigar's user id, but
 * PublicProfile deliberately withholds userId - so the passport page needs this
 * to fetch a worker's reviews without that id ever entering the shape that gets
 * rendered.
 *
 * Kept as a separate call rather than widening PUBLIC_PROJECTION on purpose:
 * the projection is the privacy guarantee, and adding a field to it "just for
 * the server" is exactly how such a guarantee erodes.
 */
export async function findOwnerIdByHandle(handle: string): Promise<string | null> {
  const doc = await getDb()
    .collection(PROFILES)
    .findOne({ passportHandle: handle }, { projection: { userId: 1 } });
  return doc && typeof doc.userId === 'string' ? doc.userId : null;
}

/**
 * The kaarigar behind each of a customer's jobs, keyed by the worker's uid.
 *
 * WHY THIS IS NOT listPublicProfiles. That function answers "who could I
 * hire?" for anyone browsing; this answers "who is doing MY job?" for one
 * customer about workers they have already engaged. Different question,
 * different audience, so it gets its own allowlist rather than widening
 * PUBLIC_PROJECTION - see the note on findOwnerIdByHandle about why adding a
 * field to that projection "just for this one caller" is how it erodes.
 *
 * PHONE IS FETCHED HERE AND GATED BY THE CALLER, which breaks the
 * projection-in-the-query pattern the public reads use. It has to: visibility
 * depends on the STATE OF EACH JOB, and one kaarigar can hold several of this
 * customer's jobs at once in different states. A projection is per query, not
 * per row, so it cannot express the rule. The gate therefore lives in the
 * customer jobs route, which is the only caller - see CONTACT_VISIBLE_STATES.
 *
 * Nothing else from the profile is returned. totalEarnings, dailyRate and
 * bloodGroup are as absent here as they are from the public shape.
 */
export interface AssignedKaarigar {
  passportHandle: string;
  name: string;
  trade: string;
  phone: string;
}

export async function findAssignedKaarigars(uids: string[]): Promise<Map<string, AssignedKaarigar>> {
  const wanted = [...new Set(uids.filter((u) => typeof u === 'string' && u))];
  if (wanted.length === 0) return new Map();

  const docs = await getDb()
    .collection(PROFILES)
    .find({ userId: { $in: wanted } }, { projection: { _id: 0, userId: 1, passportHandle: 1, name: 1, trade: 1, phone: 1 } })
    .toArray();

  return new Map(
    docs.map((d) => [
      String(d.userId),
      {
        passportHandle: String(d.passportHandle ?? ''),
        name: String(d.name ?? '').trim() || 'this kaarigar',
        trade: String(d.trade ?? ''),
        phone: String(d.phone ?? ''),
      },
    ])
  );
}
