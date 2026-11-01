const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');

const store = require('./lib/store');
const { buildWorldMap } = require('./lib/worldmap');

const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
// Admin panel entrance: letters, digits, . _ ~ - and slashes only; anything else falls back to /gs.
const rawAdminPath = '/' + String(process.env.ADMIN_PATH || '/gs').replace(/^\/+|\/+$/g, '');
const ADMIN_PATH = /^\/[\w.~-]+(\/[\w.~-]+)*$/.test(rawAdminPath) ? rawAdminPath : '/gs';
const MESSAGES_FILE = path.join(store.DATA_DIR, 'messages.json');
const VISITS_FILE = path.join(store.DATA_DIR, 'visits.json');
const LOCAL_VIDEOS = ['london.mp4', 'london.webm'].map((f) => path.join(__dirname, 'public', 'video', f));
const TEMP_HOST = !!process.env.VERCEL; // read-only app folder: files written to /tmp don't survive

// Header film: a self-hosted public/video/london.mp4 (or .webm) wins over the remote (Pexels) files.
function heroVideo(p) {
  const v = { ...(p.heroVideo || {}) };
  v.sources = { ...(v.sources || {}) };
  const local = LOCAL_VIDEOS.find((f) => fs.existsSync(f));
  if (local) {
    const url = '/video/' + path.basename(local);
    v.sources = { mobile: url, desktop: url, large: url };
    v.local = true;
  }
  return v;
}

// Built-in logos: public/img/logos/<slug>.(svg|png|webp|jpg) is picked up for any show or employer
// whose `logo` is that slug. Logos uploaded in the admin are referenced directly via `logoUrl`.
let logoCache = { t: 0, map: {} };
function findLogos() {
  if (Date.now() - logoCache.t < 5000) return logoCache.map;
  const dir = path.join(__dirname, 'public', 'img', 'logos');
  const found = {};
  if (fs.existsSync(dir)) {
    for (const ext of ['jpg', 'webp', 'png', 'svg']) {
      for (const f of fs.readdirSync(dir)) {
        if (f.toLowerCase().endsWith('.' + ext)) found[f.slice(0, -(ext.length + 1))] = '/img/logos/' + f;
      }
    }
  }
  logoCache = { t: Date.now(), map: found };
  return found;
}

// World map, rebuilt only when the content changes.
let mapCache = { v: -1, map: null };
function worldMapFor(p) {
  if (mapCache.v !== store.version()) mapCache = { v: store.version(), map: buildWorldMap(p.cities || []) };
  return mapCache.map;
}

const year = () => new Date().getFullYear();
// Express 4 does not catch errors thrown inside async handlers; route them to the error handler instead.
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const text = (v, n) => (typeof v === 'string' ? v : '').trim().slice(0, n);
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// Append to a JSON list on disk: one writer at a time per file, temp file + rename, corrupt files set aside.
const fileQueues = new Map();
function appendJsonList(file, entry, max) {
  const prev = fileQueues.get(file) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    let list = [];
    try { list = JSON.parse(await fsp.readFile(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') { try { await fsp.rename(file, `${file}.corrupt-${Date.now()}`); } catch { /* ignore */ } } }
    if (!Array.isArray(list)) list = [];
    list.push(entry);
    if (max && list.length > max) list = list.slice(-max);
    store.ensureDir(path.dirname(file));
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(list, null, 2));
    await fsp.rename(tmp, file);
  });
  fileQueues.set(file, run);
  return run;
}
process.on('unhandledRejection', (err) => console.error('[unhandled rejection]', err));

async function start() {
  const app = express();
  store.load();
  console.log(`[content] loaded from ${store.status().loadedFrom}`);
  console.log(`[logos] ${Object.keys(findLogos()).length} built-in logo file(s) in public/img/logos`);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');
  // Behind Render/Railway/Nginx etc. the real client IP arrives in X-Forwarded-For.
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY) app.set('trust proxy', 1);

  // The header video and its poster may live on another host (Pexels by default, or whatever is
  // entered in the admin panel), so those origins are added to the security policy on the fly.
  const originOf = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) && /^[a-z0-9.-]+$/i.test(x.hostname) ? x.origin : null; } catch { return null; } };
  const videoHosts = () => { const v = store.get().heroVideo || {}; return [...new Set(Object.values(v.sources || {}).map(originOf).filter(Boolean))].join(' '); };
  const posterHost = () => originOf((store.get().heroVideo || {}).poster) || '';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://images.pexels.com', () => posterHost()],
          mediaSrc: ["'self'", 'https://videos.pexels.com', () => videoHosts()],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(compression());
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', redirect: false }));
  app.use('/uploads', express.static(store.UPLOAD_DIR, { maxAge: '7d' }));
  app.use('/api', express.json({ limit: '20kb' }));

  app.get('/', (req, res) => {
    const p = store.get();
    res.render('index', { p, map: worldMapFor(p), video: heroVideo(p), logos: findLogos(), year: year() });
  });

  app.get('/api/profile', (req, res) => res.json(store.get()));

  // One page per show: /shows/<id>
  app.get('/shows', (req, res) => res.redirect('/#events'));
  app.get('/shows/:id', (req, res) => {
    const p = store.get();
    const shows = p.shows || [];
    const show = shows.find((s) => s.id === req.params.id);
    if (!show) return res.status(404).render('404', { p });
    const employer = (p.employers || []).find((e) => e.id === show.organiser) || null;
    const firstWord = employer ? employer.name.split(/\s+/)[0].toLowerCase() : '';
    const exp = employer ? (p.experience || []).find((x) => x.company.toLowerCase().startsWith(firstWord)) || null : null;
    const i = shows.indexOf(show);
    const related = shows.filter((s) => s.organiser === show.organiser && s.id !== show.id).slice(0, 4);
    res.render('show', { p, show, employer, exp, prev: shows[i - 1] || null, next: shows[i + 1] || null, related, logos: findLogos(), year: year() });
  });

  // Contact endpoint. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally
  // SMTP_FROM, CONTACT_TO) to have enquiries emailed to you — see README.
  const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? require('nodemailer').createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;
  console.log(mailer ? '[contact] emailing enquiries via ' + process.env.SMTP_HOST : `[contact] SMTP not set; enquiries saved to ${MESSAGES_FILE}`);
  const recent = new Map();
  app.post('/api/contact', asyncRoute(async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if (b.website) return res.json({ ok: true }); // honeypot field — bots fill it in

    const ip = req.ip;
    const now = Date.now();
    for (const [k, t] of recent) if (now - t > 60_000) recent.delete(k); // keep the map small
    if (recent.has(ip) && now - recent.get(ip) < 30_000) {
      return res.status(429).json({ ok: false, error: 'Please wait a moment before sending another message.' });
    }

    const entry = {
      name: text(b.name, 120),
      email: text(b.email, 200),
      company: text(b.company, 160),
      message: text(b.message, 4000),
      receivedAt: new Date().toISOString(),
    };
    if (!entry.name || !/^[^\s@?&=,<>"']+@[^\s@?&=,<>"']+\.[^\s@?&=,<>"']+$/.test(entry.email) || entry.message.length < 5) {
      return res.status(400).json({ ok: false, error: 'Please add your name, a valid email and a short message.' });
    }

    // 1) Email it, if SMTP settings are provided (e.g. a Hostinger mailbox).
    // 2) Otherwise save it to data/messages.json (readable in the admin panel) where the disk is writable.
    // 3) If neither is possible, tell the browser to open the visitor's email app instead.
    const to = process.env.CONTACT_TO || store.get().email;
    try {
      if (mailer) {
        await mailer.sendMail({
          from: `"umitbozdag.com" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to,
          replyTo: `"${entry.name.replace(/"/g, '')}" <${entry.email}>`,
          subject: `Website enquiry from ${entry.name}${entry.company ? ` (${entry.company})` : ''}`,
          text: `${entry.message}\n\n— ${entry.name}\n${entry.email}${entry.company ? `\n${entry.company}` : ''}\nSent ${entry.receivedAt}`,
        });
      } else if (!TEMP_HOST) {
        await appendJsonList(MESSAGES_FILE, entry);
      } else {
        return res.status(503).json({ ok: false, fallback: 'mailto', to });
      }
      recent.set(ip, now);
      console.log(`[contact] new message from ${entry.name} <${entry.email}>`);
      res.json({ ok: true });
    } catch (err) {
      console.error('[contact]', err.message);
      res.status(503).json({ ok: false, fallback: 'mailto', to });
    }
  }));

  // ---- Visitor records (shown to the visitor in the consent banner and /privacy) ----
  const parseUA = (ua) => {
    const u = ua || '';
    const browser = /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet'
      : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) && /Version\//.test(u) ? 'Safari'
      : /MSIE|Trident/.test(u) ? 'Internet Explorer' : /bot|crawl|spider|slurp/i.test(u) ? 'Bot' : 'Other';
    const os = /Windows/.test(u) ? 'Windows' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Mac OS X/.test(u) ? 'macOS' : /Android/.test(u) ? 'Android' : /CrOS/.test(u) ? 'ChromeOS' : /Linux/.test(u) ? 'Linux' : 'Other';
    const device = /iPad|Tablet/.test(u) ? 'tablet' : /Mobi|iPhone|Android/.test(u) ? 'mobile' : 'desktop';
    return { browser, os, device };
  };
  const isPrivateIp = (ip) => !ip || /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:(127|10|192\.168)\.|fc|fd)/.test(ip);
  const visitRecent = new Map();
  app.post('/api/visit', asyncRoute(async (req, res) => {
    const ip = req.ip || '';
    const now = Date.now();
    for (const [k, t] of visitRecent) if (now - t > 60_000) visitRecent.delete(k);
    if (visitRecent.has(ip) && now - visitRecent.get(ip) < 10_000) return res.json({ ok: true, skipped: true });
    visitRecent.set(ip, now);
    const ua = req.get('user-agent') || '';
    const geo = {
      country: req.get('x-vercel-ip-country') || req.get('cf-ipcountry') || null,
      region: req.get('x-vercel-ip-country-region') || null,
      city: null,
    };
    try { geo.city = req.get('x-vercel-ip-city') ? decodeURIComponent(req.get('x-vercel-ip-city')) : null; } catch { geo.city = req.get('x-vercel-ip-city') || null; }
    // Optional lookup for hosts that provide no geo headers (e.g. Hostinger): GEOIP_PROVIDER=ipapi
    if (!geo.country && process.env.GEOIP_PROVIDER === 'ipapi' && !isPrivateIp(ip)) {
      try {
        const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(2500), headers: { 'user-agent': 'umitbozdag.com' } });
        if (r.ok) { const j = await r.json(); geo.country = j.country_name || j.country || null; geo.region = j.region || null; geo.city = j.city || null; }
      } catch { /* best effort */ }
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const entry = { at: new Date().toISOString(), ip, ...parseUA(ua), userAgent: ua.slice(0, 300), ...geo,
      page: text(body.page, 200), referrer: text(body.referrer, 300), language: (req.get('accept-language') || '').split(',')[0].slice(0, 20), consent: true };
    console.log('[visit]', JSON.stringify(entry));
    try { await appendJsonList(VISITS_FILE, entry, 5000); } catch (err) { if (!TEMP_HOST) console.error('[visit]', err.message); }
    res.json({ ok: true });
  }));
  // Read the records without signing in: GET /api/visits?key=<ADMIN_KEY>  (the admin panel shows them too)
  app.get('/api/visits', asyncRoute(async (req, res) => {
    const key = process.env.ADMIN_KEY;
    if (!key || typeof req.query.key !== 'string' || !safeEqual(req.query.key, key)) return res.status(404).render('404', { p: store.get() });
    try { res.json(JSON.parse(await fsp.readFile(VISITS_FILE, 'utf8'))); } catch { res.json([]); }
  }));
  app.get('/privacy', (req, res) => res.render('privacy', { p: store.get(), year: year() }));

  // ---- Admin panel (default /gs; set ADMIN_PATH to move it) ----
  app.use(ADMIN_PATH, require('./lib/admin')({ store, visitsFile: VISITS_FILE, messagesFile: MESSAGES_FILE, findLogos, basePath: ADMIN_PATH }));
  console.log(`[admin] panel at ${ADMIN_PATH}`);

  app.use((req, res) => res.status(404).render('404', { p: store.get() }));
  // Last resort: log, answer, keep running.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
    if (res.headersSent) return;
    if (/\/api\//.test(req.originalUrl)) return res.status(500).json({ ok: false, error: 'Something went wrong on the server.' });
    return res.status(500).type('text').send('Something went wrong. Please try again in a moment.');
  });

  app.listen(PORT, '0.0.0.0', () => console.log(`Umit Bozdag site running at http://localhost:${PORT}`));
}

start();
