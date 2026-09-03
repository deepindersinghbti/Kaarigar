import { Router, urlencoded } from 'express';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';

import { isDbConnected } from '../db';
import { findPublicProfileByHandle, findDisplayNameByUserId, findOwnerIdByHandle } from '../data/profiles';
import { resolveOrigin } from '../lib/origin';
import type { PublicProfile } from '../data/profiles';
import { createReview, summariseFor } from '../data/reviews';
import type { ReviewSummary } from '../data/reviews';
import { calculateTrustScore } from '../data/trustScore';
import { gateReviewToken } from './reputation';
import type { ReviewRatings, TrustScore } from '../../types';

/**
 * public - server-rendered surfaces that require no login and no app install.
 *
 * Owner: Track C
 * Mounted at: / (the site root, NOT under /api)
 *
 * Surface (Architecture section 8):
 *   GET /p/:handle   public passport page + printable QR (section 4A, Tier 1)
 *   GET /r/:token    HMAC-signed, job-bound, single-use review link  (not built)
 *
 * MOUNT ORDER MATTERS. These are the only routes that live at the site root,
 * which puts them in direct competition with the SPA. The bootstrap registers
 * this router BEFORE the Vite dev middleware and BEFORE the production
 * catch-all that serves index.html; mounted after either one, /p/:handle
 * silently returns the React shell instead of the rendered page, and it will
 * look like a routing bug in the app rather than an ordering mistake here.
 *
 * These routes are Express SSR and have no dependency on react-router, so
 * Track C never waits on Track B.
 */

export const publicRouter = Router();

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

/**
 * HTML-escape every interpolated value. NON-NEGOTIABLE on this page.
 *
 * name, bio, skills, certifications, trade and location are all in passport-svc's
 * PATCHABLE allowlist, which means a worker sets them and this page renders them
 * to strangers with no login. That is a stored-XSS path straight from a PATCH
 * body to a public page, so escaping happens in one place and every template
 * hole below goes through it.
 */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * The page is fully self-contained: styles inline, QR inline as SVG, no
 * external stylesheet and no JavaScript.
 *
 * WHY NOT REUSE THE APP'S COMPILED TAILWIND. Vite emits it as
 * /assets/index-<contenthash>.css and that hash changes on every build, so
 * referencing it from an Express template means either parsing dist/index.html
 * at runtime or hardcoding a filename that silently 404s after the next deploy.
 * The visual language below is matched to DigitalPassport.tsx by hand instead.
 *
 * The self-contained form also buys the thing this page exists for: it is one
 * request. Section 13 budgets a cold start under 2.5s on Android 8 over 2G, and
 * a customer scanning a QR on a worksite is exactly that user. No stylesheet
 * round trip, no font blocking, no layout shift.
 */
const STYLES = `
:root{color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  background:#f9fafb;color:#111827;line-height:1.5;
  -webkit-font-smoothing:antialiased;padding:16px
}
.wrap{max-width:640px;margin:0 auto}
.eyebrow{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.dot{width:9px;height:9px;border-radius:50%;background:#22c55e;flex:none}
.eyebrow span{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#15803d}
h1{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-bottom:2px}
.sub{font-size:13px;color:#6b7280;margin-bottom:18px}
.trust{margin-top:20px;padding:16px;border:1px solid #e5e7eb;border-radius:18px;background:#f9fafb}
.trust-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.trust-title{font-size:13px;font-weight:900;color:#111827}
.trust-score{font-size:24px;font-weight:900;color:#f97316}
.trust-note{font-size:11px;color:#6b7280;margin-top:3px}
.trust-row{display:grid;grid-template-columns:1fr 42px;gap:10px;align-items:center;margin-top:12px}
.trust-label{font-size:11px;color:#374151;font-weight:700}
.trust-bar{height:7px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin-top:5px}
.trust-fill{height:100%;background:#f97316;border-radius:99px}
.trust-value{font-size:11px;font-weight:900;color:#6b7280;text-align:right}

.card{
  position:relative;background:#111827;color:#fff;border-radius:24px;
  padding:24px;border:2px solid rgba(251,146,60,.8);overflow:hidden;
  box-shadow:0 25px 50px -12px rgba(0,0,0,.25)
}
.card::before{
  content:"";position:absolute;top:-60px;right:-60px;width:280px;height:280px;
  background:rgba(249,115,22,.10);border-radius:50%;filter:blur(40px);pointer-events:none
}
.card>*{position:relative;z-index:1}

.chead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
  border-bottom:1px solid rgba(249,115,22,.3);padding-bottom:16px;margin-bottom:22px}
.crest{width:46px;height:46px;border-radius:14px;background:#f97316;display:flex;
  align-items:center;justify-content:center;font-size:22px;flex:none}
.ctitle-sm{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fb923c}
.ctitle{font-size:16px;font-weight:800;letter-spacing:-.01em}
.badge{display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,.2);
  color:#4ade80;font-size:11px;font-weight:900;padding:4px 11px;border-radius:999px;
  border:1px solid rgba(34,197,94,.4);white-space:nowrap}
.badge.pending{background:rgba(148,163,184,.18);color:#cbd5e1;border-color:rgba(148,163,184,.4)}
.handle{font-size:10px;color:#9ca3af;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:5px;text-align:right}

.bio-row{display:flex;gap:18px;align-items:center;margin-bottom:20px}
.avatar{width:88px;height:88px;border-radius:18px;background:#f97316;padding:4px;flex:none}
.avatar div{width:100%;height:100%;background:#111827;border-radius:14px;display:flex;
  align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fb923c;
  border:1px solid rgba(251,146,60,.3)}
.who h2{font-size:22px;font-weight:800;line-height:1.15}
.who .trade{color:#fb923c;font-weight:700;font-size:14px}
.who .loc{font-size:12px;color:#9ca3af;margin-top:2px}

.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:rgba(17,24,39,.9);
  border:1px solid #1f2937;border-radius:16px;padding:12px;text-align:center;margin-bottom:18px}
.stats .k{font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px}
.stats .v{font-size:17px;font-weight:900}
.stats div:nth-child(2){border-left:1px solid #1f2937;border-right:1px solid #1f2937}
.v-o{color:#fb923c}.v-g{color:#4ade80}.v-a{color:#fdba74}

.sec{margin-bottom:16px}
.sec-h{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;
  letter-spacing:.08em;margin-bottom:7px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{background:rgba(17,24,39,.9);border:1px solid rgba(251,146,60,.4);color:#fed7aa;
  font-size:12px;padding:5px 10px;border-radius:12px;font-weight:600}
.cert{display:flex;align-items:center;gap:8px;font-size:12px;color:#d1d5db;
  background:rgba(17,24,39,.6);padding:9px;border-radius:12px;border:1px solid #1f2937;margin-bottom:5px}
.bio{font-size:13px;color:#d1d5db}

.qrow{margin-top:22px;padding-top:20px;border-top:1px solid rgba(31,41,55,.8);
  display:flex;align-items:center;gap:16px}
.qbox{background:#fff;padding:8px;border-radius:16px;flex:none;line-height:0}
.qbox svg{display:block;width:104px;height:104px}
.qtext .t{font-size:12px;font-weight:700}
.qtext .d{font-size:11px;color:#9ca3af;margin-top:2px}
.qtext .u{font-size:10px;color:#fb923c;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  margin-top:4px;word-break:break-all}

.foot{margin-top:18px;font-size:11px;color:#6b7280;text-align:center;line-height:1.6}
.foot strong{color:#374151}

.err{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:36px 24px;text-align:center}
.err h1{font-size:20px;margin-bottom:8px}
.err p{font-size:14px;color:#6b7280}
.err code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f3f4f6;
  padding:2px 6px;border-radius:5px;font-size:13px}

.rsum{display:flex;gap:14px;align-items:stretch;background:rgba(17,24,39,.9);
  border:1px solid #1f2937;border-radius:16px;padding:12px}
.rbig{text-align:center;padding-right:14px;border-right:1px solid #1f2937;min-width:92px;
  display:flex;flex-direction:column;justify-content:center}
.rnum{font-size:28px;font-weight:900;color:#fb923c;line-height:1}
.rout{font-size:11px;color:#9ca3af;font-weight:700}
.rcount{font-size:10px;color:#9ca3af;margin-top:3px;text-transform:uppercase;font-weight:700}
.raxes{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;align-content:center}
.axr{display:flex;justify-content:space-between;font-size:11px;color:#d1d5db}
.axv{font-weight:900;color:#4ade80}
.rq{font-size:12px;color:#d1d5db;font-style:italic;border-left:2px solid rgba(251,146,60,.5);
  padding:2px 0 2px 10px;margin-top:8px}
.rnote{font-size:10px;color:#6b7280;margin-top:8px}

@media(max-width:520px){
  .bio-row{flex-direction:column;text-align:center;gap:12px}
  .qrow{flex-direction:column;text-align:center}
  h1{font-size:22px}
}
`;

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 3)
      .toUpperCase() || '?'
  );
}

function shell(title: string, description: string, body: string, canonical?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

/**
 * The reviews block on a public passport.
 *
 * Renders NOTHING when there are no reviews. A "0.0 out of 5" or an empty
 * five-star row reads as a bad worker rather than a new one, and section 11's
 * new-worker floor exists precisely because starting people at zero makes the
 * platform useless to those who need it most. Absence is honest; a zero is not.
 */
function renderReviews(r: ReviewSummary): string {
  if (r.count === 0 || r.average === null || !r.axes) return '';

  const axisRow = (label: string, value: number) =>
    `<div class="axr"><span>${esc(label)}</span><span class="axv">${esc(value.toFixed(1))}</span></div>`;

  const quotes = r.recent
    .filter((x) => x.text)
    .slice(0, 2)
    .map((x) => `<blockquote class="rq">${esc(x.text)}</blockquote>`)
    .join('');

  return `
  <div class="sec">
    <div class="sec-h">Customer Reviews</div>
    <div class="rsum">
      <div class="rbig">
        <span class="rnum">${esc(r.average.toFixed(1))}</span>
        <span class="rout">/ 5</span>
        <div class="rcount">${esc(r.count)} ${r.count === 1 ? 'review' : 'reviews'}</div>
      </div>
      <div class="raxes">
        ${axisRow('Workmanship', r.axes.workmanship)}
        ${axisRow('Punctuality', r.axes.punctuality)}
        ${axisRow('Price honesty', r.axes.priceHonesty)}
        ${axisRow('Cleanliness', r.axes.cleanliness)}
      </div>
    </div>
    ${quotes}
    <p class="rnote">Each review is tied to one completed job and cannot be self-awarded.</p>
  </div>`;
}

function renderTrustScore(score?: TrustScore): string {
  if (!score) return '';

  const rows: Array<{ label: string; value: number; max: number }> = [
    { label: 'Phone identity', value: score.components.identityVerification, max: 20 },
    { label: 'Skill credentials', value: score.components.skillCredentials, max: 15 },
    { label: 'Job-linked work history', value: score.components.verifiedWorkHistory, max: 25 },
    { label: 'Customer ratings', value: score.components.customerRatings, max: 25 },
    { label: 'Reliability penalty', value: score.components.reliabilityRecord, max: 10 },
    { label: 'Skilling engagement', value: score.components.skillingEngagement, max: 5 },
  ];

  const renderedRows = rows.map((row) => {
    const positiveMax = row.max || 10;
    const positiveValue = Math.max(0, row.value);
    const width = Math.round(Math.min(100, (positiveValue / positiveMax) * 100));
    const suffix = row.max ? ` / ${row.max}` : '';
    return `<div class="trust-row">
      <div><div class="trust-label">${esc(row.label)}</div><div class="trust-bar"><div class="trust-fill" style="width:${width}%"></div></div></div>
      <div class="trust-value">${esc(`${row.value}${suffix}`)}</div>
    </div>`;
  }).join('');

  return `<div class="trust">
    <div class="trust-head"><div class="trust-title">Trust evidence</div><div class="trust-score">${esc(score.value)}<span style="font-size:12px;color:#6b7280"> / 100</span></div></div>
    <div class="trust-note">A transparent rubric from phone OTP, completed jobs and customer feedback. Self-entered skills and certificates are not treated as verified.</div>
    <div class="trust-note"><strong>Credential status:</strong> Not linked &middot; <strong>DigiLocker sandbox/mock:</strong> demo only. No live government verification is performed.</div>
    ${renderedRows}
  </div>`;
}

function renderPassport(
  p: PublicProfile,
  url: string,
  qrSvg: string,
  reviews: ReviewSummary,
  trustScore?: TrustScore
): string {
  const verified = p.verifiedStatus === 'verified';
  const skills = Array.isArray(p.skills) ? p.skills : [];
  const certs = Array.isArray(p.certifications) ? p.certifications : [];

  const body = `
<div class="eyebrow"><span class="dot"></span><span>Government &amp; Industry Aligned</span></div>
<h1>Digital Kaarigar Passport</h1>
<p class="sub">QR-&#2360;&#2340;&#2381;&#2351;&#2366;&#2346;&#2367;&#2340; &#2325;&#2366;&#2352;&#2381;&#2351; &#2346;&#2361;&#2330;&#2366;&#2344; &#2340;&#2325; &#2346;&#2361;&#2369;&#2305;&#2330; &bull; No app needed</p>

<div class="card">
  <div class="chead">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="crest">&#128737;</div>
      <div>
        <div class="ctitle-sm">National Kaarigar Identity</div>
        <div class="ctitle">DIGITAL KAARIGAR PASSPORT</div>
      </div>
    </div>
    <div>
      <span class="badge${verified ? '' : ' pending'}">${verified ? '&#10003; VERIFIED' : 'UNVERIFIED'}</span>
      <div class="handle">/p/${esc(p.passportHandle)}</div>
    </div>
  </div>

  <div class="bio-row">
    <div class="avatar"><div>${esc(initials(p.name || ''))}</div></div>
    <div class="who">
      <h2>${esc(p.name)}</h2>
      <div class="trade">${esc(p.trade)}${p.ncoCode ? ` &middot; NCO ${esc(p.ncoCode)}` : ''}</div>
      ${p.location ? `<div class="loc">&#128205; ${esc(p.location)}</div>` : ''}
    </div>
  </div>

  <div class="stats">
    <div><span class="k">Experience</span><span class="v v-o">${esc(p.experienceYears ?? 0)} yrs</span></div>
    <div><span class="k">Jobs Done</span><span class="v v-g">${esc(p.totalJobsCount ?? 0)}</span></div>
    <div><span class="k">Rating</span><span class="v v-a">&#9733; ${esc(p.rating ?? '—')}</span></div>
  </div>

  ${
    skills.length
      ? `<div class="sec"><div class="sec-h">Skills listed by worker</div>
         <div class="chips">${skills.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div></div>`
      : ''
  }

  ${
    certs.length
      ? `<div class="sec"><div class="sec-h">Credentials listed by worker</div>
         ${certs.map((c) => `<div class="cert">&#127894; ${esc(c)}</div>`).join('')}</div>`
      : ''
  }

  ${p.bio ? `<div class="sec"><div class="sec-h">About</div><p class="bio">${esc(p.bio)}</p></div>` : ''}

  ${renderReviews(reviews)}

  ${renderTrustScore(trustScore)}

  <div class="qrow">
    <div class="qbox">${qrSvg}</div>
    <div class="qtext">
      <div class="t">Scan to verify this passport</div>
      <div class="d">Opens this page. Share it, print it, or show it on site.</div>
      <div class="u">${esc(url)}</div>
    </div>
  </div>
</div>

<p class="foot">
  This passport is owned by the worker and travels with them.<br>
  Job evidence and customer feedback are recorded on Kaarigar; skills and credentials remain worker-entered until an authorised verification is linked.<br>
  Earnings and contact details are private and are never shown here.
</p>`;

  const desc = `${p.name} — ${p.trade}${p.location ? ` in ${p.location}` : ''}. ${
    p.experienceYears ?? 0
  } years experience, ${p.totalJobsCount ?? 0} jobs recorded. Digital Kaarigar Passport with job-linked evidence.`;

  return shell(`${p.name} — ${p.trade} | Kaarigar Passport`, desc, body, url);
}

function renderNotFound(handle: string): string {
  return shell(
    'Passport not found | Kaarigar',
    'No Kaarigar passport exists at this address.',
    `<div class="err">
       <h1>No passport at this address</h1>
       <p>Nothing is published at <code>/p/${esc(handle)}</code>.<br>
       Check the link, or ask the worker to share their passport again.</p>
     </div>`
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /p/:handle - the public passport page.
 *
 * No auth, by design: the entire product claim in section 1 is that a customer
 * can verify a worker WITHOUT installing anything or holding an account. What
 * makes that safe is the projection in findPublicProfileByHandle, not a check
 * here.
 *
 * STATUS CODES ARE PART OF THE FEATURE. An unknown handle returns a real 404
 * with a real page. Before this route existed, /p/anything fell through to the
 * SPA catch-all and answered 200 with the React shell - so a mistyped or revoked
 * link looked alive and served nothing, and a judge scanning a QR would have got
 * a blank app rather than an error. Answering 404 here is what closes that.
 */
publicRouter.get('/p/:handle', async (req: Request, res: Response) => {
  const handle = String(req.params.handle ?? '').toLowerCase();

  res.type('html');

  if (!isDbConnected()) {
    // 503, not 404: the passport may well exist. Saying "not found" when the
    // database is merely unreachable tells the worker their passport is gone.
    res.status(503).send(
      shell(
        'Temporarily unavailable | Kaarigar',
        'This passport cannot be loaded right now.',
        `<div class="err"><h1>Temporarily unavailable</h1>
         <p>This passport could not be loaded. Please try again in a moment.</p></div>`
      )
    );
    return;
  }

  // Handles are allocated from a [a-z0-9-] slug, so anything else cannot match
  // a record. Rejecting here keeps arbitrary strings out of the query.
  if (!/^[a-z0-9-]{1,64}$/.test(handle)) {
    res.status(404).send(renderNotFound(handle));
    return;
  }

  try {
    const profile = await findPublicProfileByHandle(handle);
    if (!profile) {
      res.status(404).send(renderNotFound(handle));
      return;
    }

    const url = `${resolveOrigin(req)}/p/${profile.passportHandle}`;

    // Reviews are keyed by the owner's user id, which PublicProfile withholds -
    // hence the separate server-side lookup. Absent or failed, the page still
    // renders: a passport that 500s because its review count could not be read
    // is worse than a passport with no review block.
    const ownerId = await findOwnerIdByHandle(profile.passportHandle);
    const reviews = ownerId
      ? await summariseFor(ownerId)
      : { count: 0, average: null, axes: null, recent: [] };
    const trustScore = ownerId ? await calculateTrustScore(ownerId) : undefined;

    // Error correction level Q (~25%) rather than the M default. This QR is
    // scanned off a phone screen, a printed card, and - per the demo plan - a
    // projector, where contrast is poor and part of the symbol may be washed
    // out. Q survives that; M frequently does not, and a QR that fails to scan
    // on stage costs more than the extra modules do.
    const qrSvg = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'Q',
      margin: 1,
      color: { dark: '#030712', light: '#ffffff' },
    });

    // Short public cache: a passport changes rarely, but "rarely" is not
    // "never", and a stale trust signal is worse than an extra request.
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.status(200).send(renderPassport(profile, url, qrSvg, reviews, trustScore));
  } catch (err) {
    console.error('[public] /p/:handle failed', err);
    res.status(500).send(
      shell(
        'Something went wrong | Kaarigar',
        'This passport could not be rendered.',
        `<div class="err"><h1>Something went wrong</h1>
         <p>This passport could not be rendered. Please try again.</p></div>`
      )
    );
  }
});

// ---------------------------------------------------------------------------
// Review flow (section 4D)
// ---------------------------------------------------------------------------

const AXIS_LABELS: Array<{ key: keyof ReviewRatings; label: string; hindi: string }> = [
  { key: 'workmanship', label: 'Workmanship', hindi: 'काम की गुणवत्ता' },
  { key: 'punctuality', label: 'Punctuality', hindi: 'समय पर आना' },
  { key: 'priceHonesty', label: 'Price honesty', hindi: 'दाम में ईमानदारी' },
  { key: 'cleanliness', label: 'Cleanliness', hindi: 'सफ़ाई' },
];

/**
 * Extra styles for the review form, appended to the same STYLES block the
 * passport uses so the two pages read as one product.
 *
 * The rating control is a radio group styled as five large buttons, NOT a star
 * widget. Stars need JavaScript and a pointer; radios work with no script, with
 * a keyboard, with a screen reader, and on a connection that dropped the
 * bundle. Section 4H's 48dp floor is a size, which a star glyph fails at.
 */
const REVIEW_STYLES = `
.rform{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px}
.jobref{background:#f9fafb;border:1px solid #e5e7eb;border-radius:16px;padding:12px 14px;margin-bottom:20px}
.jobref .k{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:800}
.jobref .t{font-size:15px;font-weight:800;color:#111827;margin-top:2px}
.jobref .m{font-size:12px;color:#6b7280;margin-top:2px}
.axis{margin-bottom:18px;border:0;padding:0}
.axis>legend{font-size:13px;font-weight:800;color:#111827;padding:0}
.axis .sub{font-size:11px;color:#6b7280;margin-bottom:8px}
.scale{display:flex;gap:6px}
.scale input{position:absolute;opacity:0;width:0;height:0}
.scale label{
  flex:1;min-width:48px;height:52px;display:flex;align-items:center;justify-content:center;
  border:2px solid #e5e7eb;border-radius:14px;background:#f9fafb;cursor:pointer;
  font-size:17px;font-weight:900;color:#6b7280;transition:.12s
}
.scale input:checked + label{background:#f97316;border-color:#f97316;color:#fff}
.scale input:focus-visible + label{outline:3px solid #fdba74;outline-offset:2px}
.scale-ends{display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;margin-top:4px;font-weight:700}
textarea{
  width:100%;min-height:90px;border:2px solid #e5e7eb;border-radius:16px;padding:12px;
  font:inherit;font-size:14px;resize:vertical;background:#f9fafb;color:#111827
}
textarea:focus{outline:none;border-color:#fb923c}
.submit{
  width:100%;height:56px;margin-top:18px;border:0;border-radius:16px;background:#f97316;color:#fff;
  font-size:16px;font-weight:900;cursor:pointer
}
.done{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:36px 24px;text-align:center}
.done .tick{width:60px;height:60px;border-radius:50%;background:#dcfce7;color:#16a34a;
  display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 14px}
`;

function reviewShell(title: string, body: string): string {
  return shell(title, 'Rate the work you received.', body).replace(
    '</style>',
    `${REVIEW_STYLES}</style>`
  );
}

function renderReviewForm(
  token: string,
  job: { title: string; date: string },
  workerName: string,
  error?: string
): string {
  const axes = AXIS_LABELS.map(
    (a) => `
    <fieldset class="axis">
      <legend>${esc(a.label)}</legend>
      <div class="sub">${esc(a.hindi)}</div>
      <div class="scale">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<input type="radio" id="${esc(a.key)}-${n}" name="${esc(a.key)}" value="${n}" required>` +
              `<label for="${esc(a.key)}-${n}">${n}</label>`
          )
          .join('')}
      </div>
      <div class="scale-ends"><span>1 &mdash; poor</span><span>5 &mdash; excellent</span></div>
    </fieldset>`
  ).join('');

  return reviewShell(
    `Rate ${workerName} | Kaarigar`,
    `
<div class="eyebrow"><span class="dot"></span><span>Job-anchored review</span></div>
<h1>How was the work?</h1>
<p class="sub">&#2325;&#2366;&#2350; &#2325;&#2376;&#2360;&#2366; &#2352;&#2361;&#2366;? &bull; Tied to this one job.</p>

${
  error
    ? `<div class="err" style="padding:14px;margin-bottom:14px;text-align:left"><p>${esc(error)}</p></div>`
    : ''
}

<form class="rform" method="POST" action="/r/${esc(token)}">
  <div class="jobref">
    <div class="k">You are reviewing</div>
    <div class="t">${esc(workerName)}</div>
    <div class="m">${esc(job.title)}${job.date ? ` &bull; ${esc(job.date)}` : ''}</div>
  </div>

  ${axes}

  <fieldset class="axis">
    <legend>Anything to add?</legend>
    <div class="sub">&#2325;&#2369;&#2331; &#2324;&#2352; &#2325;&#2361;&#2344;&#2366; &#2330;&#2366;&#2361;&#2375;&#2306; &#2340;&#2379; &#2354;&#2367;&#2326;&#2375;&#2306; (optional)</div>
    <textarea name="text" maxlength="1000" placeholder="What went well, or what could be better?"></textarea>
  </fieldset>

  <button class="submit" type="submit">Submit review</button>
</form>

<p class="foot">
  This review is permanently attached to one completed job. It cannot be edited or repeated.<br>
  It becomes part of that worker's portable passport &mdash; owned by them, not by us.
</p>`
  );
}

function renderReviewDone(workerName: string): string {
  return reviewShell(
    'Thank you | Kaarigar',
    `<div class="done">
       <div class="tick">&#10003;</div>
       <h1 style="font-size:20px">Thank you</h1>
       <p style="color:#6b7280;font-size:14px;margin-top:6px">
         Your review is now part of ${esc(workerName)}'s passport.<br>
         It helps the next customer trust them.
       </p>
     </div>`
  );
}

function renderReviewClosed(message: string): string {
  return reviewShell(
    'Review link | Kaarigar',
    `<div class="err"><h1>This link cannot be used</h1><p>${esc(message)}</p></div>`
  );
}

/**
 * GET /r/:token - the customer's review form.
 *
 * No auth and no app, which is the entire point: the customer who just paid a
 * worker will not install anything to leave a rating, and a flow that asks them
 * to is a flow that collects no reviews.
 *
 * Like /p/:handle, this previously answered 200 with the React shell for ANY
 * token, so an expired or forged link looked alive and served nothing. Every
 * failure below is now a real status with a real page.
 */
publicRouter.get('/r/:token', async (req: Request, res: Response) => {
  res.type('html');

  if (!isDbConnected()) {
    res.status(503).send(renderReviewClosed('This link could not be opened. Please try again in a moment.'));
    return;
  }

  try {
    const gate = await gateReviewToken(String(req.params.token ?? ''));
    if (!gate.ok) {
      res.status(gate.status).send(renderReviewClosed(gate.message));
      return;
    }

    const name = await findDisplayNameByUserId(gate.job.kaarigarId);

    // Never cached. The link is single-use, and a cached form would let someone
    // reload their way back to a page for a review that has already landed.
    res.set('Cache-Control', 'no-store');
    res.status(200).send(renderReviewForm(String(req.params.token ?? ''), gate.job, name));
  } catch (err) {
    console.error('[public] GET /r/:token failed', err);
    res.status(500).send(renderReviewClosed('Something went wrong opening this link.'));
  }
});

/**
 * POST /r/:token - the same form, submitted.
 *
 * A plain HTML form post, so the flow needs no JavaScript at all. The JSON
 * endpoint at POST /api/reviews exists alongside it for the app; both go
 * through gateReviewToken and createReview, so they cannot disagree about who
 * may review what.
 */
/**
 * The urlencoded parser is mounted HERE, on this one route, rather than in the
 * bootstrap.
 *
 * This is the only route in the application that receives an HTML form post -
 * everything else speaks JSON, which app.use(express.json()) already covers.
 * Scoping it keeps the bootstrap's rule intact (adding a route must never
 * require editing it) and keeps a form parser off every JSON endpoint that has
 * no use for one.
 *
 * Without it req.body is undefined for a form submission and every review is
 * rejected as missing all four ratings - a failure that looks like broken
 * validation rather than a missing parser.
 */
publicRouter.post('/r/:token', urlencoded({ extended: false }), async (req: Request, res: Response) => {
  res.type('html');
  const token = String(req.params.token ?? '');

  if (!isDbConnected()) {
    res.status(503).send(renderReviewClosed('Your review could not be saved. Please try again in a moment.'));
    return;
  }

  try {
    const gate = await gateReviewToken(token);
    if (!gate.ok) {
      res.status(gate.status).send(renderReviewClosed(gate.message));
      return;
    }

    const name = await findDisplayNameByUserId(gate.job.kaarigarId);
    const outcome = await createReview({
      jobId: gate.job.id,
      subjectId: gate.job.kaarigarId,
      // A urlencoded form body arrives as strings; createReview coerces and
      // bounds-checks each axis, so the same validation covers both entry points.
      ratings: req.body,
      text: req.body?.text,
    });

    if (outcome.status === 'rejected') {
      // Re-render with the server's own message rather than a generic failure,
      // so the customer can see which axis they missed.
      res.status(400).send(renderReviewForm(token, gate.job, name, outcome.message));
      return;
    }
    if (outcome.status === 'already_reviewed') {
      res.status(409).send(renderReviewClosed('This job has already been reviewed. Thank you.'));
      return;
    }

    res.set('Cache-Control', 'no-store');
    res.status(201).send(renderReviewDone(name));
  } catch (err) {
    console.error('[public] POST /r/:token failed', err);
    res.status(500).send(renderReviewClosed('Your review could not be saved.'));
  }
});
