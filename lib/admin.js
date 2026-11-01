'use strict';
// Admin panel: password sign-in, content editing API, uploads, visitor log and messages.
// Mounted by server.js at ADMIN_PATH (default /gs). Pages: <base> (app), <base>/login. API under <base>/api/*.
// The browser app and stylesheet are served by this router at <base>/assets/ from ../admin-ui.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { normalize, check, deepMerge, slug } = require('./validate');

module.exports = function adminRouter({ store, visitsFile, messagesFile, findLogos, basePath = '/gs' }) {
  const router = express.Router();
  const BASE = ('/' + String(basePath).replace(/^\/+|\/+$/g, '')) || '/gs';
  const ADMIN_FILE = path.join(store.DATA_DIR, 'admin.json');
  const SECRET_FILE = path.join(store.DATA_DIR, '.secret');
  const PUBLIC_DIR = path.join(__dirname, '..', 'public');

  // ---- cookie-signing secret: env, else a file in the data folder, else in memory (logins reset on restart) ----
  let secret = process.env.SESSION_SECRET || null;
  if (!secret) { try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim() || null; } catch { /* none yet */ } }
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    try { store.ensureDir(store.DATA_DIR); fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 }); } catch { /* keep in memory */ }
  }

  // ---- password: ADMIN_PASSWORD env wins; otherwise a scrypt hash stored in data/admin.json (set on first visit) ----
  const readStored = () => { try { return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8')); } catch { return null; } };
  const hashPassword = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const mode = () => (process.env.ADMIN_PASSWORD ? 'env' : readStored() ? 'stored' : store.status().writable ? 'setup' : 'disabled');
  const pwVersion = () => { const s = readStored(); return process.env.ADMIN_PASSWORD ? 'env' : s ? s.v || 1 : 0; };
  const verify = (pw) => {
    if (process.env.ADMIN_PASSWORD) return safeEqual(pw, process.env.ADMIN_PASSWORD);
    const s = readStored();
    return !!s && safeEqual(hashPassword(pw, s.salt), s.hash);
  };
  const storePassword = (pw, v) => { store.ensureDir(store.DATA_DIR); const salt = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(ADMIN_FILE, JSON.stringify({ salt, hash: hashPassword(pw, salt), v, updatedAt: new Date().toISOString() }), { mode: 0o600 }); };

  // ---- session cookie (HMAC-signed, 7 days) ----
  const COOKIE = 'ub_admin';
  const sign = (data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const cookieOpts = (req) => ({ httpOnly: true, sameSite: 'lax', secure: req.secure || process.env.NODE_ENV === 'production', path: BASE });
  const issue = (req, res) => {
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 7 * 864e5, v: pwVersion() })).toString('base64url');
    res.cookie(COOKIE, `${payload}.${sign(payload)}`, { ...cookieOpts(req), maxAge: 7 * 864e5 });
  };
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim()).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
  const authed = (req) => {
    const t = cookies(req)[COOKIE];
    if (!t) return false;
    const [payload, sig] = t.split('.');
    if (!payload || !sig || !safeEqual(sign(payload), sig)) return false;
    try { const d = JSON.parse(Buffer.from(payload, 'base64url').toString()); return d.exp > Date.now() && d.v === pwVersion(); } catch { return false; }
  };
  const requireAuth = (req, res, next) => {
    if (authed(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ ok: false, error: 'Please sign in again.' });
    return res.redirect(`${BASE}/login`);
  };
  // CSRF guard for state changes: only same-origin scripts can set this header, and fetch metadata backs it up.
  const sameOrigin = (req, res, next) => {
    const site = req.get('sec-fetch-site');
    if (req.get('x-requested-with') !== 'fetch' || (site && !['same-origin', 'none'].includes(site))) return res.status(403).json({ ok: false, error: 'Blocked request.' });
    return next();
  };

  // ---- login throttle: 8 failed attempts per 10 minutes per IP ----
  const attempts = new Map();
  const recentFails = (ip) => { const now = Date.now(); const list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60e3); attempts.set(ip, list); return list.length; };
  const noteFail = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);

  const form = express.urlencoded({ extended: false, limit: '10kb' });
  const json = express.json({ limit: '10mb' });
  const page = (res, mode_, error, code = 200) => res.status(code).render('admin-login', { mode: mode_, error, p: store.get(), base: BASE });

  router.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
  router.use('/assets', express.static(path.join(__dirname, '..', 'admin-ui'), { maxAge: '1h', redirect: false }));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.get('/login', (req, res) => (authed(req) ? res.redirect(BASE) : page(res, mode(), null)));
  router.post('/login', form, (req, res) => {
    const m = mode();
    if (m === 'setup' || m === 'disabled') return res.redirect(`${BASE}/login`);
    if (recentFails(req.ip) >= 8) return page(res, m, 'Too many attempts. Try again in 10 minutes.', 429);
    if (!verify(req.body.password || '')) { noteFail(req.ip); return page(res, m, 'Wrong password.', 401); }
    issue(req, res);
    return res.redirect(BASE);
  });
  router.post('/setup', form, (req, res) => {
    if (mode() !== 'setup') return res.redirect(`${BASE}/login`);
    const pw = String(req.body.password || ''), again = String(req.body.again || '');
    if (pw.length < 10) return page(res, 'setup', 'Use at least 10 characters.', 400);
    if (pw !== again) return page(res, 'setup', 'The two passwords don’t match.', 400);
    try { storePassword(pw, 1); } catch (e) { return page(res, 'disabled', `Could not save the password: ${e.message}`, 500); }
    issue(req, res);
    return res.redirect(BASE);
  });
  router.post('/logout', form, (req, res) => { res.clearCookie(COOKIE, cookieOpts(req)); res.redirect(`${BASE}/login`); });

  router.get('/', requireAuth, (req, res) => res.render('admin', { p: store.get(), status: store.status(), passwordMode: mode(), base: BASE }));

  // ---- content ----
  const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } };
  const info = () => ({ status: store.status(), passwordMode: mode(), logos: findLogos(), counts: { visits: readJson(visitsFile).length, messages: readJson(messagesFile).length } });
  const saveContent = (next) => {
    if (!next || typeof next !== 'object') return { errors: ['Nothing to save.'] };
    const c = normalize(next);
    const errors = check(c);
    if (errors.length) return { errors };
    return { status: store.save(c), content: c };
  };
  const reply = (res, r) => (r.errors ? res.status(400).json({ ok: false, error: r.errors.join(' · '), errors: r.errors }) : res.json({ ok: true, content: r.content, ...info() }));

  router.get('/api/content', requireAuth, (req, res) => res.json({ ok: true, content: store.get(), ...info() }));
  router.get('/api/status', requireAuth, (req, res) => res.json({ ok: true, ...info() }));
  router.put('/api/content', requireAuth, sameOrigin, json, (req, res) => reply(res, saveContent(req.body && req.body.content)));
  router.patch('/api/content', requireAuth, sameOrigin, json, (req, res) => {
    const patch = req.body && req.body.patch;
    if (!patch || typeof patch !== 'object') return res.status(400).json({ ok: false, error: 'Nothing to save.' });
    return reply(res, saveContent(deepMerge(store.get(), patch)));
  });
  router.post('/api/import', requireAuth, sameOrigin, json, (req, res) => reply(res, saveContent(req.body && req.body.content)));
  router.post('/api/reset', requireAuth, sameOrigin, json, (req, res) => { const content = store.reset(); res.json({ ok: true, content, ...info() }); });
  router.get('/api/export', requireAuth, (req, res) => {
    res.set('Content-Disposition', `attachment; filename="umitbozdag-content-${new Date().toISOString().slice(0, 10)}.json"`);
    res.type('json').send(JSON.stringify(store.get(), null, 2));
  });
  router.post('/api/password', requireAuth, sameOrigin, json, (req, res) => {
    if (process.env.ADMIN_PASSWORD) return res.status(400).json({ ok: false, error: 'On this host the password comes from the ADMIN_PASSWORD environment variable — change it there.' });
    const { current = '', password = '' } = req.body || {};
    if (!verify(current)) return res.status(401).json({ ok: false, error: 'The current password is wrong.' });
    if (String(password).length < 10) return res.status(400).json({ ok: false, error: 'Use at least 10 characters.' });
    try { storePassword(password, (pwVersion() || 0) + 1); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    issue(req, res);
    return res.json({ ok: true });
  });

  // ---- uploads (sent as data URLs; the browser shrinks photos before sending) ----
  const KINDS = { logo: 'logos', image: 'images' };
  const MAGIC = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], gif: [0x47, 0x49, 0x46], webp: [0x52, 0x49, 0x46, 0x46] };
  router.post('/api/upload', requireAuth, sameOrigin, json, (req, res) => {
    const { name = 'file', data = '', kind = 'image' } = req.body || {};
    const sub = KINDS[kind] || 'images';
    const m = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(data));
    if (!m) return res.status(400).json({ ok: false, error: 'Unsupported file. Use PNG, JPG, WEBP, GIF or SVG.' });
    const ext = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif', 'svg+xml': 'svg' }[m[1]];
    let buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    if (buf.length > 6 * 1024 * 1024) return res.status(413).json({ ok: false, error: 'That file is over 6 MB. Please use a smaller image.' });
    if (ext === 'svg') {
      const t = buf.toString('utf8').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');
      if (!/<svg[\s>]/i.test(t)) return res.status(400).json({ ok: false, error: 'That SVG file looks invalid.' });
      buf = Buffer.from(t);
    } else if (!MAGIC[ext].every((b, i) => buf[i] === b)) {
      return res.status(400).json({ ok: false, error: 'The file contents don’t match the image type.' });
    }
    const base = slug(path.parse(String(name)).name) || kind;
    const file = `${base}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    const dir = path.join(store.UPLOAD_DIR, sub);
    try { store.ensureDir(dir); fs.writeFileSync(path.join(dir, file), buf); } catch (e) { return res.status(500).json({ ok: false, error: `Could not save the file: ${e.message}` }); }
    return res.json({ ok: true, url: `/uploads/${sub}/${file}`, bytes: buf.length });
  });
  const listDir = (dir, urlBase, builtin) => {
    try {
      return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f)).map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, url: `${urlBase}/${f}`, bytes: st.size, modified: st.mtime.toISOString(), builtin }; }).sort((a, b) => b.modified.localeCompare(a.modified));
    } catch { return []; }
  };
  router.get('/api/media', requireAuth, (req, res) => res.json({
    ok: true,
    uploads: { logos: listDir(path.join(store.UPLOAD_DIR, 'logos'), '/uploads/logos', false), images: listDir(path.join(store.UPLOAD_DIR, 'images'), '/uploads/images', false) },
    builtin: { logos: listDir(path.join(PUBLIC_DIR, 'img', 'logos'), '/img/logos', true), scenes: listDir(path.join(PUBLIC_DIR, 'img', 'scenes'), '/img/scenes', true) },
    status: store.status(),
  }));
  router.delete('/api/media', requireAuth, sameOrigin, (req, res) => {
    const url = String(req.query.url || '');
    const m = /^\/uploads\/(logos|images)\/([A-Za-z0-9._-]+)$/.exec(url);
    if (!m) return res.status(400).json({ ok: false, error: 'Only uploaded files can be deleted.' });
    try { fs.unlinkSync(path.join(store.UPLOAD_DIR, m[1], m[2])); } catch { return res.status(404).json({ ok: false, error: 'File not found.' }); }
    return res.json({ ok: true, stillReferenced: JSON.stringify(store.get()).includes(url) });
  });

  // ---- visitors & messages ----
  router.get('/api/visits', requireAuth, (req, res) => res.json({ ok: true, visits: readJson(visitsFile) }));
  router.post('/api/visits/clear', requireAuth, sameOrigin, json, async (req, res) => { try { await fsp.writeFile(visitsFile, '[]'); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
  router.get('/api/messages', requireAuth, (req, res) => res.json({ ok: true, messages: readJson(messagesFile) }));
  router.post('/api/messages/clear', requireAuth, sameOrigin, json, async (req, res) => { try { await fsp.writeFile(messagesFile, '[]'); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });

  router.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
  router.use((req, res) => res.redirect(BASE));
  return router;
};
