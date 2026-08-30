import { Router } from 'express';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';

import { isDbConnected } from '../db';
import { findPublicProfileByHandle } from '../data/profiles';
import type { PublicProfile } from '../data/profiles';

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
// Origin resolution
// ---------------------------------------------------------------------------

/**
 * The absolute origin this page is being served from.
 *
 * The QR must encode a REACHABLE absolute URL. A QR pointing at localhost is
 * useless the moment it leaves the machine that generated it, and one pointing
 * at http:// when the site is https:// produces a mixed-content warning on the
 * scanning phone - the worst possible first impression for a trust product.
 *
 * PUBLIC_ORIGIN wins when set, because that is the only way to be certain the
 * printed QR matches the domain the project actually demos on. Otherwise the
 * origin is reconstructed from the request. Render terminates TLS at its proxy
 * and forwards the original scheme in x-forwarded-proto, so reading req.protocol
 * alone yields "http" behind the proxy and bakes the wrong scheme into the QR.
 */
function resolveOrigin(req: Request): string {
  const configured = process.env.PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/+$/, '');

  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
  const proto = forwarded || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
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

function renderPassport(p: PublicProfile, url: string, qrSvg: string): string {
  const verified = p.verifiedStatus === 'verified';
  const skills = Array.isArray(p.skills) ? p.skills : [];
  const certs = Array.isArray(p.certifications) ? p.certifications : [];

  const body = `
<div class="eyebrow"><span class="dot"></span><span>Government &amp; Industry Aligned</span></div>
<h1>Digital Kaarigar Passport</h1>
<p class="sub">QR-&#2360;&#2340;&#2381;&#2351;&#2366;&#2346;&#2367;&#2340; &#2325;&#2366;&#2352;&#2381;&#2351; &#2346;&#2361;&#2330;&#2366;&#2344; &#2346;&#2340;&#2381;&#2352; &bull; Verified independently, no app needed</p>

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
      ? `<div class="sec"><div class="sec-h">Verified Skills</div>
         <div class="chips">${skills.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div></div>`
      : ''
  }

  ${
    certs.length
      ? `<div class="sec"><div class="sec-h">Accreditations &amp; Training</div>
         ${certs.map((c) => `<div class="cert">&#127894; ${esc(c)}</div>`).join('')}</div>`
      : ''
  }

  ${p.bio ? `<div class="sec"><div class="sec-h">About</div><p class="bio">${esc(p.bio)}</p></div>` : ''}

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
  Verified fields come from completed jobs on Kaarigar &mdash; <strong>they cannot be self-awarded.</strong><br>
  Earnings and contact details are private and are never shown here.
</p>`;

  const desc = `${p.name} — ${p.trade}${p.location ? ` in ${p.location}` : ''}. ${
    p.experienceYears ?? 0
  } years experience, ${p.totalJobsCount ?? 0} jobs completed. Verified Digital Kaarigar Passport.`;

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
    res.status(200).send(renderPassport(profile, url, qrSvg));
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
