const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');

const profile = require('./data/profile');
const { buildWorldMap } = require('./lib/worldmap');

const PORT = process.env.PORT || 3000;
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');
const VISITS_FILE = path.join(__dirname, 'data', 'visits.json');
const LOCAL_VIDEOS = ['london.mp4', 'london.webm'].map((f) => path.join(__dirname, 'public', 'video', f));

// Header film: a self-hosted public/video/london.mp4 (or .webm) wins over the remote (Pexels) files.
function heroVideo() {
  const v = { ...(profile.heroVideo || {}) };
  const local = LOCAL_VIDEOS.find((f) => fs.existsSync(f));
  if (local) {
    const url = '/video/' + path.basename(local);
    v.sources = { mobile: url, desktop: url, large: url };
    v.local = true;
  }
  return v;
}

// Logos: public/img/logos/<slug>.(svg|png|webp|jpg) is picked up automatically
// for any show or employer with that `slug` in data/profile.js.
function findLogos() {
  const dir = path.join(__dirname, 'public', 'img', 'logos');
  const found = {};
  if (!fs.existsSync(dir)) return found;
  for (const ext of ['jpg', 'webp', 'png', 'svg']) {
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().endsWith('.' + ext)) found[f.slice(0, -(ext.length + 1))] = '/img/logos/' + f;
    }
  }
  return found;
}

async function start() {
  const app = express();
  const worldMap = buildWorldMap(profile.cities);
  const logos = findLogos();
  console.log(`[logos] ${Object.keys(logos).length} logo file(s) in public/img/logos`);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');
  // Behind Render/Railway/Nginx etc. the real client IP arrives in X-Forwarded-For.
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https://images.pexels.com'],
          mediaSrc: ["'self'", 'https://videos.pexels.com'],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '20kb' }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

  app.get('/', (req, res) => {
    res.render('index', { p: profile, map: worldMap, video: heroVideo(), logos, year: new Date().getFullYear() });
  });

  app.get('/api/profile', (req, res) => res.json(profile));

  // One page per show: /shows/<id>
  const shows = profile.shows || [];
  const showById = new Map(shows.map((s) => [s.id, s]));
  const employerById = new Map((profile.employers || []).map((e) => [e.id, e]));
  app.get('/shows', (req, res) => res.redirect('/#shows'));
  app.get('/shows/:id', (req, res) => {
    const show = showById.get(req.params.id);
    if (!show) return res.status(404).render('404', { p: profile });
    const employer = employerById.get(show.organiser) || null;
    const firstWord = employer ? employer.name.split(/\s+/)[0].toLowerCase() : '';
    const exp = employer ? (profile.experience || []).find((x) => x.company.toLowerCase().startsWith(firstWord)) || null : null;
    const i = shows.indexOf(show);
    const related = shows.filter((s) => s.organiser === show.organiser && s.id !== show.id).slice(0, 4);
    res.render('show', { p: profile, show, employer, exp, prev: shows[i - 1] || null, next: shows[i + 1] || null, related, logos, year: new Date().getFullYear() });
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
  console.log(mailer ? '[contact] emailing enquiries via ' + process.env.SMTP_HOST : '[contact] SMTP not set; enquiries saved to data/messages.json');
  const recent = new Map();
  app.post('/api/contact', async (req, res) => {
    const { name = '', email = '', company = '', message = '', website = '' } = req.body || {};
    if (website) return res.json({ ok: true }); // honeypot field — bots fill it in

    const ip = req.ip;
    const now = Date.now();
    for (const [k, t] of recent) if (now - t > 60_000) recent.delete(k); // keep the map small
    if (recent.has(ip) && now - recent.get(ip) < 30_000) {
      return res.status(429).json({ ok: false, error: 'Please wait a moment before sending another message.' });
    }

    const clean = (s, n) => String(s).trim().slice(0, n);
    const entry = {
      name: clean(name, 120),
      email: clean(email, 200),
      company: clean(company, 160),
      message: clean(message, 4000),
      receivedAt: new Date().toISOString(),
    };
    if (!entry.name || !/^\S+@\S+\.\S+$/.test(entry.email) || entry.message.length < 5) {
      return res.status(400).json({ ok: false, error: 'Please add your name, a valid email and a short message.' });
    }

    // 1) Email it, if SMTP settings are provided (e.g. a Hostinger mailbox).
    // 2) Otherwise save it to data/messages.json (only where the disk is writable).
    // 3) If neither is possible, tell the browser to open the visitor's email app instead.
    try {
      if (mailer) {
        await mailer.sendMail({
          from: `"umitbozdag.com" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: process.env.CONTACT_TO || profile.email,
          replyTo: `"${entry.name.replace(/"/g, '')}" <${entry.email}>`,
          subject: `Website enquiry from ${entry.name}${entry.company ? ` (${entry.company})` : ''}`,
          text: `${entry.message}\n\n— ${entry.name}\n${entry.email}${entry.company ? `\n${entry.company}` : ''}\nSent ${entry.receivedAt}`,
        });
      } else if (!process.env.VERCEL) {
        let list = [];
        try { list = JSON.parse(await fsp.readFile(MESSAGES_FILE, 'utf8')); } catch { /* first message */ }
        list.push(entry);
        await fsp.writeFile(MESSAGES_FILE, JSON.stringify(list, null, 2));
      } else {
        return res.status(503).json({ ok: false, fallback: 'mailto', to: profile.email });
      }
      recent.set(ip, now);
      console.log(`[contact] new message from ${entry.name} <${entry.email}>`);
      res.json({ ok: true });
    } catch (err) {
      console.error('[contact]', err.message);
      res.status(503).json({ ok: false, fallback: 'mailto', to: profile.email });
    }
  });

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
  app.post('/api/visit', async (req, res) => {
    const ip = req.ip || '';
    const now = Date.now();
    for (const [k, t] of visitRecent) if (now - t > 60_000) visitRecent.delete(k);
    if (visitRecent.has(ip) && now - visitRecent.get(ip) < 10_000) return res.json({ ok: true, skipped: true });
    visitRecent.set(ip, now);
    const ua = req.get('user-agent') || '';
    const geo = {
      country: req.get('x-vercel-ip-country') || req.get('cf-ipcountry') || null,
      region: req.get('x-vercel-ip-country-region') || null,
      city: req.get('x-vercel-ip-city') ? decodeURIComponent(req.get('x-vercel-ip-city')) : null,
    };
    // Optional lookup for hosts that provide no geo headers (e.g. Hostinger): GEOIP_PROVIDER=ipapi
    if (!geo.country && process.env.GEOIP_PROVIDER === 'ipapi' && !isPrivateIp(ip)) {
      try {
        const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(2500), headers: { 'user-agent': 'umitbozdag.com' } });
        if (r.ok) { const j = await r.json(); geo.country = j.country_name || j.country || null; geo.region = j.region || null; geo.city = j.city || null; }
      } catch { /* best effort */ }
    }
    const body = req.body || {};
    const entry = { at: new Date().toISOString(), ip, ...parseUA(ua), userAgent: ua.slice(0, 300), ...geo,
      page: String(body.page || '').slice(0, 200), referrer: String(body.referrer || '').slice(0, 300), language: (req.get('accept-language') || '').split(',')[0].slice(0, 20), consent: true };
    console.log('[visit]', JSON.stringify(entry));
    if (!process.env.VERCEL) {
      try {
        let list = [];
        try { list = JSON.parse(await fsp.readFile(VISITS_FILE, 'utf8')); } catch { /* first visit */ }
        list.push(entry);
        if (list.length > 5000) list = list.slice(-5000);
        await fsp.writeFile(VISITS_FILE, JSON.stringify(list, null, 2));
      } catch (err) { console.error('[visit]', err.message); }
    }
    res.json({ ok: true });
  });
  // Read the records: GET /api/visits?key=<ADMIN_KEY>  (set ADMIN_KEY in the environment)
  app.get('/api/visits', async (req, res) => {
    const key = process.env.ADMIN_KEY;
    if (!key || req.query.key !== key) return res.status(404).render('404', { p: profile });
    try { res.json(JSON.parse(await fsp.readFile(VISITS_FILE, 'utf8'))); } catch { res.json([]); }
  });
  app.get('/privacy', (req, res) => res.render('privacy', { p: profile, year: new Date().getFullYear() }));

  app.use((req, res) => res.status(404).render('404', { p: profile }));

  app.listen(PORT, '0.0.0.0', () => console.log(`Umit Bozdag site running at http://localhost:${PORT}`));
}

start();
