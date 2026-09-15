import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb, isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { JOBS, createJob, ensureJobIndexes } from '../data/jobs';
import { JOB_TRANSITIONS } from '../../types';
import type { JobState, JobStateTransition } from '../../types';
import { listPublicProfiles, findOwnerIdByHandle, findAssignedKaarigars } from '../data/profiles';
import { optionalQueryString, queryString } from '../lib/query';
import { DEMO_CUSTOMER_PHONE, DEMO_CUSTOMER_NAME } from '../auth/demoCustomer';

/**
 * The customer side of the marketplace: browse kaarigars, request a job, watch
 * the request.
 *
 * Owner: Track A. Mounted at /api/kaarigars and /api/customer.
 *
 * WHY THIS IS A SEPARATE MODULE FROM jobs.ts. POST /api/jobs is a trust
 * boundary with one rule - the owner is req.user.uid and is never read from the
 * body. The customer path needs the opposite: the owner is somebody else, named
 * by the request. Those cannot be the same handler without that handler
 * containing a branch that decides whether to trust the body, and a branch like
 * that is one refactor away from being taken in the wrong case.
 *
 * So POST /api/jobs is left exactly as it was. This is a sibling with its own
 * rule, and the two share the part that must not diverge - validation and the
 * insert - by both calling data/jobs.ts createJob().
 */

export const kaarigarsRouter = Router();
export const customerRouter = Router();

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Check MONGODB_URI and the Atlas Network Access allowlist.',
  });
  return false;
}

/**
 * GET /api/kaarigars[?trade=Plumber]
 *
 * The directory a customer browses. Authenticated, because browsing the worker
 * directory is a product surface rather than a public one - /p/:handle already
 * exists for the public, unauthenticated view of a single passport.
 *
 * The response shape is PublicProfile, produced by the SAME PUBLIC_PROJECTION
 * that backs GET /p/:handle. There is no field list in this file, deliberately:
 * see the comment on listPublicProfiles in data/profiles.ts.
 */
kaarigarsRouter.get('/', requireAuth, async (_req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    const trade = optionalQueryString(_req.query.trade);
    const kaarigars = await listPublicProfiles(trade);
    return res.json({ kaarigars });
  } catch (err) {
    console.error('[customer] GET /api/kaarigars failed:', err);
    return res.status(500).json({ error: 'kaarigars_read_failed', message: 'Could not load kaarigars.' });
  }
});

/**
 * POST /api/customer/jobs
 *
 * A customer requesting work from a named kaarigar.
 *
 * WHO OWNS THE NEW JOB IS READ FROM THE REQUEST, which is the one thing
 * POST /api/jobs refuses to do - so the identifier is verified rather than
 * trusted, in two steps:
 *
 *   1. The body names a PASSPORT HANDLE, not a user id. The handle is the only
 *      identifier a customer can hold: PUBLIC_PROJECTION withholds userId from
 *      every public shape on purpose, so the browse list above cannot hand out
 *      a uid and a client has no way to invent one.
 *   2. findOwnerIdByHandle turns it into the owner's uid server-side, and
 *      returns null when no such passport exists. A handle that resolves to
 *      nothing is a 404; nothing is inserted.
 *
 * The uid written to the job is therefore one the server looked up in
 * kaarigar_profiles, never a string the client supplied.
 *
 * customerId and the initial state come from the session and from createJob
 * respectively. Neither is readable from the body.
 */
customerRouter.post('/jobs', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const handle = queryString((req.body ?? {}).kaarigarHandle);
  if (!handle) {
    return res.status(400).json({
      error: 'invalid_field',
      field: 'kaarigarHandle',
      message: 'kaarigarHandle is required - the passport handle of the kaarigar being asked.',
    });
  }

  try {
    const kaarigarUid = await findOwnerIdByHandle(handle);
    if (!kaarigarUid) {
      return res.status(404).json({
        error: 'kaarigar_not_found',
        message: `No kaarigar with passport handle "${handle}".`,
      });
    }

    const uid = req.user!.uid;
    const input = { ...req.body,
      ...(req.user!.phone === DEMO_CUSTOMER_PHONE ? { customerName: DEMO_CUSTOMER_NAME } : {}),
      customerPhone: req.user!.phone,
      paymentMethod: 'pending',
      agreedPrice: undefined,
    };
    const outcome = await createJob(kaarigarUid, input, { actorId: uid, customerId: uid });

    if (outcome.status === 'rejected') {
      return res.status(400).json({ error: 'invalid_field', field: outcome.field, message: outcome.message });
    }
    if (outcome.status === 'conflict') {
      console.warn(`[customer] id conflict: ${String((req.body ?? {}).id)} requested by uid=${uid}`);
      return res.status(409).json({
        error: 'id_conflict',
        message: 'That id is already in use. Generate a new one and retry.',
      });
    }
    if (outcome.status === 'duplicate') {
      return res.status(200).json({ job: outcome.job, idempotentReplay: true });
    }
    return res.status(201).json({ job: outcome.job });
  } catch (err) {
    console.error('[customer] POST /jobs failed:', err);
    return res.status(500).json({ error: 'job_request_failed', message: 'Could not send the request.' });
  }
});

/**
 * GET /api/customer/jobs - the caller's requests, newest first.
 *
 * Scoped by customerId the same way GET /api/jobs is scoped by kaarigarId:
 * ownership is part of the filter, not a check applied to loaded rows, so there
 * is no path where someone else's request is read and then discarded.
 *
 * Same sort as GET /api/jobs - { date: -1, _id: -1 } - so a customer and a
 * kaarigar looking at the same job see it in the same position relative to its
 * neighbours. Two list endpoints over one collection that order differently is
 * a bug report waiting to be filed against the wrong screen.
 */
/**
 * POST /api/customer/jobs/:id/accept - the customer agrees to the worker's quote.
 *
 * THE PRICE IS NOT IN THE REQUEST. The body is not read at all. agreedPrice is
 * copied from the quotedPrice already stored on the job, so a customer cannot
 * accept at a number of their own choosing, and a replay cannot carry a
 * different one. There is deliberately no field here to tamper with.
 *
 * Ownership and state are both part of the FILTER, not checks applied after
 * loading: { customerId: uid, status: 'QUOTED' }. One atomic findOneAndUpdate
 * therefore means two clicks cannot both accept, and the job cannot be accepted
 * out of a state the table does not permit it from.
 *
 * The transition is still validated against JOB_TRANSITIONS rather than
 * hardcoded, so this endpoint cannot outlive a change to the table.
 *
 * `by` on the history entry is the CUSTOMER's uid - the first entry in a job's
 * history written by someone other than the worker. That is what makes
 * ACCEPTED meaningfully different from a self-asserted worker state.
 */
customerRouter.post('/jobs/:id/accept', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  if (!JOB_TRANSITIONS.QUOTED.includes('ACCEPTED')) {
    console.error('[customer] JOB_TRANSITIONS no longer allows QUOTED -> ACCEPTED');
    return res.status(500).json({ error: 'transition_unavailable', message: 'Accepting a quote is not currently possible.' });
  }

  try {
    const db = getDb();
    const uid = req.user!.uid;

    const job = await db.collection(JOBS).findOne({ _id: req.params.id as never, customerId: uid });
    if (!job) {
      return res.status(404).json({ error: 'job_not_found', message: 'No such request for this customer.' });
    }

    // Already accepted is reported as success, not as a conflict: the customer
    // pressed the button twice, or retried on a flaky connection, and the
    // outcome they wanted is the outcome that holds.
    if (job.status !== 'QUOTED') {
      if (job.status === 'ACCEPTED') {
        const { _id, ...j } = job;
        return res.json({ job: { ...j, id: String(_id) }, alreadyAccepted: true });
      }
      return res.status(409).json({
        error: 'not_quoted',
        message: `Only a quoted request can be accepted. This one is ${String(job.status)}.`,
        status: job.status,
      });
    }

    const quoted = Number(job.quotedPrice);
    if (!Number.isFinite(quoted) || quoted <= 0) {
      // A QUOTED job with no usable price is a server-side inconsistency, not
      // customer error. Do not invent a price to get past it.
      console.error(`[customer] job ${req.params.id} is QUOTED with unusable quotedPrice=${String(job.quotedPrice)}`);
      return res.status(409).json({
        error: 'quote_incomplete',
        message: 'This request has no valid quoted price yet. Ask the kaarigar to send the price again.',
      });
    }

    const entry: JobStateTransition = { state: 'ACCEPTED', at: new Date().toISOString(), by: uid };
    const updated = await db.collection(JOBS).findOneAndUpdate(
      { _id: req.params.id as never, customerId: uid, status: 'QUOTED' },
      { $set: { status: 'ACCEPTED', agreedPrice: quoted }, $push: { stateHistory: entry as never } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(409).json({
        error: 'concurrent_transition',
        message: 'The request changed while you were accepting it. Reload and try again.',
      });
    }

    const { _id, ...j } = updated;
    return res.json({ job: { ...j, id: String(_id) } });
  } catch (err) {
    console.error('[customer] POST /jobs/:id/accept failed:', err);
    return res.status(500).json({ error: 'accept_failed', message: 'Could not accept the quote.' });
  }
});

/**
 * POST /api/customer/jobs/:id/decline
 *
 * The other answer to a quote. The price is refused but the work is still
 * wanted, so the request goes back to REQUESTED and the kaarigar can quote
 * again - see the QUOTED note in JOB_TRANSITIONS.
 *
 * Like accept, this reads NO price from the body. A customer naming their own
 * figure is negotiation, which this release does not have; declining says only
 * "not this number".
 *
 * The withdrawn quotedPrice is unset rather than left in place. That is the
 * invariant the state edge depends on, not a tidy-up.
 */
/**
 * The most a customer may counter on one job before they must simply answer.
 *
 * Counted from stateHistory rather than stored: every trip back writes a
 * REQUESTED entry, so the rounds are already recorded and a separate tally
 * could only drift from them. See countCustomerReturns.
 */
const MAX_COUNTERS = 2;

/**
 * How many times this customer has already sent the job BACK to the worker.
 *
 * A counter and a plain decline take the SAME edge, so their shape cannot tell
 * them apart. Two things together can:
 *
 *   - who wrote the entry. The other way into REQUESTED is the worker
 *     withdrawing their own quote, and that entry is authored by the worker.
 *   - whether a QUOTED came first. THE JOB'S OPENING REQUESTED IS ALSO WRITTEN
 *     BY THE CUSTOMER - createJob records them as the actor - so counting by
 *     author alone counts the request itself as a round and trips the cap one
 *     counter early. Only a REQUESTED that follows a QUOTED is a trip back.
 *
 * Declines counting toward the cap is deliberate. The cap exists to bound the
 * haggle, and "decline, get a new quote, decline again" is the same loop with
 * the numbers left implicit.
 */
function countCustomerReturns(history: JobStateTransition[] | undefined, uid: string): number {
  let quoted = false;
  let returns = 0;
  for (const t of history ?? []) {
    if (t.state === 'QUOTED') quoted = true;
    else if (quoted && t.state === 'REQUESTED' && t.by === uid) returns += 1;
  }
  return returns;
}

/**
 * POST /api/customer/jobs/:id/decline  - "not this number"
 * POST /api/customer/jobs/:id/counter  - "not this number, try mine"
 *
 * ONE EDGE, TWO DOORS. Both send the job QUOTED -> REQUESTED and clear the
 * withdrawn quotedPrice; they differ only in whether a counterPrice goes with
 * it. Sharing the body keeps the ownership filter, the atomic status guard and
 * the stale-quote clearing identical between them - three things that would
 * eventually diverge if written twice.
 *
 * THE COUNTER PRICE IS READ FROM THE BODY, and it is the only price field on
 * this router that ever is. That is safe for exactly one reason, which must
 * stay true: counterPrice binds nobody. It asks the kaarigar to quote at that
 * figure. For it to become money owed, the worker has to take QUOTED again -
 * writing THEIR OWN quotedPrice - and the customer has to accept that quote,
 * which copies the worker's number into agreedPrice. A customer who counters
 * at 1 and is never re-quoted has achieved nothing.
 *
 * Never let this field reach agreedPrice, and never let accept read it.
 */
async function sendBackToWorker(req: Request, res: Response, mode: 'decline' | 'counter') {
  if (!dbGuard(res)) return;

  if (!JOB_TRANSITIONS.QUOTED.includes('REQUESTED')) {
    console.error('[customer] JOB_TRANSITIONS no longer allows QUOTED -> REQUESTED');
    return res.status(500).json({ error: 'transition_unavailable', message: 'Answering a quote is not currently possible.' });
  }

  let counterPrice: number | undefined;
  if (mode === 'counter') {
    const raw = (req.body ?? {}).counterPrice;
    counterPrice = Number(raw);
    if (raw === undefined || !Number.isFinite(counterPrice) || counterPrice <= 0) {
      return res.status(400).json({
        error: 'invalid_counter_price',
        field: 'counterPrice',
        message: 'counterPrice must be a positive number.',
      });
    }
  }

  try {
    const db = getDb();
    const uid = req.user!.uid;

    const job = await db.collection(JOBS).findOne({ _id: req.params.id as never, customerId: uid });
    if (!job) {
      return res.status(404).json({ error: 'job_not_found', message: 'No such request for this customer.' });
    }

    /**
     * Declining twice is the same retry case accept handles: the state they
     * asked for is the state that holds, so report it as success.
     *
     * BUT REQUESTED ALONE DOES NOT MEAN DECLINED. A brand-new request that has
     * never been quoted sits in REQUESTED too, and decline clears quotedPrice,
     * so the price cannot tell the two apart either. stateHistory can: a job
     * now in REQUESTED that has ever been QUOTED got there by being declined.
     * Without this a customer could "decline" a quote nobody has sent and be
     * told it worked.
     *
     * A COUNTER IS NOT REPLAYED THIS WAY. Two counters carrying two different
     * figures are two different intentions, not one retried, and answering the
     * second with "you already did that" would silently discard the new number.
     * A repeated counter fails the state check below like any other action on a
     * job that has moved on.
     */
    if (job.status !== 'QUOTED') {
      const everQuoted = (job.stateHistory as JobStateTransition[] | undefined)?.some((t) => t.state === 'QUOTED');
      if (mode === 'decline' && job.status === 'REQUESTED' && everQuoted) {
        const { _id, ...j } = job;
        return res.json({ job: { ...j, id: String(_id) }, alreadyDeclined: true });
      }
      return res.status(409).json({
        error: 'not_quoted',
        message: `Only a quoted request can be ${mode === 'counter' ? 'countered' : 'declined'}. This one is ${String(job.status)}.`,
        status: job.status,
      });
    }

    /**
     * The cap, checked only for a counter. A customer who is out of rounds can
     * still accept the quote in front of them, decline it outright, or cancel -
     * what they lose is the ability to keep naming new figures.
     */
    if (mode === 'counter') {
      const used = countCustomerReturns(job.stateHistory as JobStateTransition[] | undefined, uid);
      if (used >= MAX_COUNTERS) {
        return res.status(409).json({
          error: 'counter_limit_reached',
          message: 'You have already sent this request back twice. You can accept this price, decline it, or cancel the request.',
          used,
          limit: MAX_COUNTERS,
        });
      }
    }

    const entry: JobStateTransition = { state: 'REQUESTED', at: new Date().toISOString(), by: uid };
    const updated = await db.collection(JOBS).findOneAndUpdate(
      { _id: req.params.id as never, customerId: uid, status: 'QUOTED' },
      {
        // The withdrawn quote always goes. counterPrice is SET on a counter and
        // UNSET on a plain decline - declining after countering must not leave
        // the old figure standing as though it were still being asked for.
        $set: { status: 'REQUESTED', ...(mode === 'counter' ? { counterPrice } : {}) },
        $unset: { quotedPrice: '', ...(mode === 'counter' ? {} : { counterPrice: '' }) },
        $push: { stateHistory: entry as never },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(409).json({
        error: 'concurrent_transition',
        message: 'The request changed while you were answering it. Reload and try again.',
      });
    }

    const { _id, ...j } = updated;
    return res.json({ job: { ...j, id: String(_id) } });
  } catch (err) {
    console.error(`[customer] POST /jobs/:id/${mode} failed:`, err);
    return res.status(500).json({ error: `${mode}_failed`, message: 'Could not answer the quote.' });
  }
}

customerRouter.post('/jobs/:id/decline', requireAuth, (req, res) => sendBackToWorker(req, res, 'decline'));
customerRouter.post('/jobs/:id/counter', requireAuth, (req, res) => sendBackToWorker(req, res, 'counter'));

/**
 * POST /api/customer/jobs/:id/cancel
 *
 * The customer calls the whole thing off.
 *
 * NARROWER THAN THE STATE MACHINE ON PURPOSE. JOB_TRANSITIONS allows CANCELLED
 * from SCHEDULED and IN_PROGRESS as well, and the worker's route still does -
 * a worker who turns up to a locked door needs that. The CUSTOMER's button
 * stops at ACCEPTED, because past that point the kaarigar has committed a slot
 * or is already working, and a one-tap cancel would write off their day with no
 * conversation. Those cases are a phone call, not a button.
 *
 * CUSTOMER_CANCELLABLE is the single list; the transition table is still
 * consulted per state, so this cannot outlive an edge being removed from it.
 */
const CUSTOMER_CANCELLABLE: JobState[] = ['REQUESTED', 'QUOTED', 'ACCEPTED'];

/**
 * The job states in which a customer may see their kaarigar's phone number.
 *
 * The line is ACCEPTED: at that point a price has been agreed and the worker is
 * coming to this person's home, so the two of them plainly need to be able to
 * reach each other - and the cancel route above tells the customer to phone
 * rather than cancel once work has been scheduled, which is not advice they can
 * act on without a number.
 *
 * REQUESTED and QUOTED are excluded because nothing has been agreed yet;
 * browsing and asking for prices must not be a way to harvest phone numbers
 * from the directory. CANCELLED is excluded because the engagement is over.
 *
 * DISPUTED IS INCLUDED, which it was not when this list was first written. Back
 * then the state was unreachable and the assumption was that a dispute ended
 * the engagement. It does not: DISPUTED -> IN_PROGRESS means the kaarigar comes
 * back to put the work right, and a customer who has just said "this is not
 * done" is the last person who should lose the ability to ring them.
 *
 * This is NOT a relaxation of the public projection rule. That rule governs
 * PUBLIC_PROJECTION in data/profiles.ts, which backs /p/:handle and the browse
 * directory - responses to anyone, about any worker. This is a response to one
 * authenticated customer about the worker on their own job.
 */
const CONTACT_VISIBLE_STATES: JobState[] = ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'SETTLED', 'REVIEWED', 'DISPUTED'];

customerRouter.post('/jobs/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    const db = getDb();
    const uid = req.user!.uid;

    const job = await db.collection(JOBS).findOne({ _id: req.params.id as never, customerId: uid });
    if (!job) {
      return res.status(404).json({ error: 'job_not_found', message: 'No such request for this customer.' });
    }

    const current = job.status as JobState;

    if (current === 'CANCELLED') {
      const { _id, ...j } = job;
      return res.json({ job: { ...j, id: String(_id) }, alreadyCancelled: true });
    }

    if (!CUSTOMER_CANCELLABLE.includes(current) || !JOB_TRANSITIONS[current].includes('CANCELLED')) {
      return res.status(409).json({
        error: 'not_cancellable',
        message: `A request can only be cancelled before the kaarigar starts. This one is ${current}. Please call them instead.`,
        status: current,
      });
    }

    const entry: JobStateTransition = { state: 'CANCELLED', at: new Date().toISOString(), by: uid };
    const updated = await db.collection(JOBS).findOneAndUpdate(
      { _id: req.params.id as never, customerId: uid, status: current },
      { $set: { status: 'CANCELLED' }, $push: { stateHistory: entry as never } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(409).json({
        error: 'concurrent_transition',
        message: 'The request changed while you were cancelling it. Reload and try again.',
      });
    }

    const { _id, ...j } = updated;
    return res.json({ job: { ...j, id: String(_id) } });
  } catch (err) {
    console.error('[customer] POST /jobs/:id/cancel failed:', err);
    return res.status(500).json({ error: 'cancel_failed', message: 'Could not cancel the request.' });
  }
});

/**
 * The customer's two answers to a completion claim.
 *
 * POST /jobs/:id/confirm  - yes, it is done      -> SETTLED
 * POST /jobs/:id/dispute  - no, it is not        -> DISPUTED
 *
 * Both are the same shape as accept one step earlier, and share a helper for
 * the same reason `act` does on the client: the two differ only in the target
 * state, and writing them twice is how the ownership filter or the atomic
 * guard ends up present in one and missing from the other.
 *
 * NEITHER READS THE BODY. There is no note, no amount, no evidence field -
 * confirming says only "done", disputing says only "not done". A dispute that
 * carried a reason would need moderation to be worth anything, and nothing
 * here moderates it.
 *
 * `by` on the history entry is the CUSTOMER's uid, which is the whole point:
 * SETTLED on a customer's job is the second state in its history that the
 * worker could not have written alone.
 */
async function answerCompletion(
  req: Request,
  res: Response,
  next: Extract<JobState, 'SETTLED' | 'DISPUTED'>,
) {
  if (!dbGuard(res)) return;

  if (!JOB_TRANSITIONS.COMPLETED.includes(next)) {
    console.error(`[customer] JOB_TRANSITIONS no longer allows COMPLETED -> ${next}`);
    return res.status(500).json({ error: 'transition_unavailable', message: 'Answering a completed job is not currently possible.' });
  }

  try {
    const db = getDb();
    const uid = req.user!.uid;

    const job = await db.collection(JOBS).findOne({ _id: req.params.id as never, customerId: uid });
    if (!job) {
      return res.status(404).json({ error: 'job_not_found', message: 'No such request for this customer.' });
    }

    // Same retry philosophy as accept and decline: the state they asked for is
    // the state that holds, so a double tap is success rather than a conflict.
    if (job.status !== 'COMPLETED') {
      if (job.status === next) {
        const { _id, ...j } = job;
        return res.json({ job: { ...j, id: String(_id) }, alreadyAnswered: true });
      }
      return res.status(409).json({
        error: 'not_completed',
        message: `Only a completed job can be confirmed or disputed. This one is ${String(job.status)}.`,
        status: job.status,
      });
    }

    const entry: JobStateTransition = { state: next, at: new Date().toISOString(), by: uid };
    const updated = await db.collection(JOBS).findOneAndUpdate(
      { _id: req.params.id as never, customerId: uid, status: 'COMPLETED' },
      { $set: { status: next }, $push: { stateHistory: entry as never } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(409).json({
        error: 'concurrent_transition',
        message: 'The job changed while you were answering it. Reload and try again.',
      });
    }

    const { _id, ...j } = updated;
    return res.json({ job: { ...j, id: String(_id) } });
  } catch (err) {
    console.error(`[customer] POST /jobs/:id/${next === 'SETTLED' ? 'confirm' : 'dispute'} failed:`, err);
    return res.status(500).json({ error: 'completion_answer_failed', message: 'Could not record your answer.' });
  }
}

customerRouter.post('/jobs/:id/confirm', requireAuth, (req, res) => answerCompletion(req, res, 'SETTLED'));
customerRouter.post('/jobs/:id/dispute', requireAuth, (req, res) => answerCompletion(req, res, 'DISPUTED'));

customerRouter.get('/jobs', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    await ensureJobIndexes();
    const docs = await getDb()
      .collection(JOBS)
      .find({ customerId: req.user!.uid })
      .sort({ date: -1, _id: -1 })
      .toArray();

    /**
     * Each request carries the kaarigar it went to. Without this the list shows
     * WHAT was asked and what state it is in, but not WHO was asked - two
     * requests to two different workers are indistinguishable.
     *
     * One batched lookup, not one per row.
     */
    const byUid = await findAssignedKaarigars(docs.map((d) => String(d.kaarigarId)));

    return res.json({
      jobs: docs.map(({ _id, ...j }) => {
        const k = byUid.get(String(j.kaarigarId));
        return {
          ...j,
          id: String(_id),
          kaarigar: k
            ? {
                passportHandle: k.passportHandle,
                name: k.name,
                trade: k.trade,
                // The phone is released only once this job is actually going
                // ahead - see CONTACT_VISIBLE_STATES.
                ...(CONTACT_VISIBLE_STATES.includes(j.status as JobState) ? { phone: k.phone } : {}),
              }
            : undefined,
        };
      }),
    });
  } catch (err) {
    console.error('[customer] GET /jobs failed:', err);
    return res.status(500).json({ error: 'customer_jobs_read_failed', message: 'Could not load your requests.' });
  }
});
