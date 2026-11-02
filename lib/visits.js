'use strict';
// Visitor log. Every public page view is recorded on the server — no banner, no cookies for visitors.
// Records are appended as JSON lines to data/visits.jsonl and kept in memory for the admin dashboard.
//
//   init({ file, legacyFile })   load the log (migrating the old visits.json array if present)
//   record(req)                  add one page view (geo lookup runs after the page has been sent)
//   query({ q, limit, offset, bots, own })   newest first, optional text filter
//   summary({ bots, own })       totals, 30-day chart data and top-N breakdowns
//   csv({ bots, own })           the whole log as CSV
//   clear()                      empty the log
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const MAX = 20000; // newest records kept on disk and in memory
const TRIM_TO = 16000; // size after a trim
const FLOOD_PER_MINUTE = 40; // more than this from one IP in a minute is not a person reading the site
const BOT_RE = /bot|crawl|spider|slurp|curl\/|wget|python|httpclient|java\/|go-http|headless|lighthouse|pagespeed|pingdom|uptime|monitor|facebookexternalhit|whatsapp\/|telegram|slackbot|discordbot|skypeuripreview|linkedinbot|twitterbot|preview|scanner|vercel-screenshot|axios|node-fetch|okhttp|libwww|scrapy|feedfetcher|archive\.org|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|anthropic|openai/i;

let FILE = null;
let list = [];
let writing = Promise.resolve();
const flood = new Map(); // ip -> [timestamps]
const geoCache = new Map(); // ip -> { t, geo }

let regionNames = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* names stay as codes */ }
const countryName = (c) => {
  if (!c || typeof c !== 'string') return null;
  const code = c.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code) && regionNames) { try { const n = regionNames.of(code); return n && n !== code ? n : code; } catch { return code; } }
  return c.trim().slice(0, 60) || null;
};

function parseUA(ua) {
  const u = ua || '';
  const bot = !u || BOT_RE.test(u);
  const browser = /Edg(e|A|iOS)?\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet'
    : /CriOS\//.test(u) ? 'Chrome' : /FxiOS\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox'
    : /Safari\//.test(u) && /Version\//.test(u) ? 'Safari' : /MSIE|Trident/.test(u) ? 'Internet Explorer' : bot ? 'Bot' : 'Other';
  const os = /Windows/.test(u) ? 'Windows' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Mac OS X/.test(u) ? 'macOS' : /Android/.test(u) ? 'Android' : /CrOS/.test(u) ? 'ChromeOS' : /Linux/.test(u) ? 'Linux' : 'Other';
  const device = /iPad|Tablet/.test(u) || (/Android/.test(u) && !/Mobile/.test(u)) ? 'tablet' : /Mobi|iPhone|Android/.test(u) ? 'mobile' : 'desktop';
  return { browser, os, device, bot };
}
const isPrivateIp = (ip) => !ip || /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:(127|10|192\.168)\.|fc|fd|169\.254\.)/.test(ip);
const vidOf = (ip, ua) => crypto.createHash('sha256').update(`ub|${ip}|${ua}`).digest('hex').slice(0, 10);
const str = (v, n) => (typeof v === 'string' ? v : '').trim().slice(0, n);

// Location from the host's headers (Vercel, Cloudflare) when present.
function headerGeo(req) {
  const geo = { country: countryName(req.get('x-vercel-ip-country') || req.get('cf-ipcountry')), region: str(req.get('x-vercel-ip-country-region'), 60) || null, city: null };
  const city = req.get('x-vercel-ip-city');
  if (city) { try { geo.city = decodeURIComponent(city).slice(0, 80); } catch { geo.city = city.slice(0, 80); } }
  return geo;
}
// Otherwise ask ipapi.co (free tier, ~1,000 lookups a day; answers are cached per IP for a day).
// GEOIP_PROVIDER=off disables it.
async function lookupGeo(ip) {
  const provider = (process.env.GEOIP_PROVIDER || 'ipapi').toLowerCase();
  if (provider === 'off' || provider === 'none' || provider === '0' || isPrivateIp(ip)) return null;
  const now = Date.now();
  const hit = geoCache.get(ip);
  if (hit && now - hit.t < (hit.geo ? 864e5 : 36e5)) return hit.geo;
  let geo = null;
  try {
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(3500), headers: { 'user-agent': 'umitbozdag.com visitor log' } });
    if (r.ok) {
      const j = await r.json();
      if (j && !j.error && (j.country_name || j.country)) geo = { country: countryName(j.country_name || j.country), region: str(j.region, 60) || null, city: str(j.city, 80) || null };
    }
  } catch { /* best effort */ }
  if (geoCache.size > 5000) geoCache.delete(geoCache.keys().next().value);
  geoCache.set(ip, { t: now, geo });
  return geo;
}

const enqueue = (fn) => { writing = writing.catch(() => {}).then(fn); return writing; };
const ensureDir = () => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); } catch { /* reported on write */ } };
const rewrite = () => enqueue(async () => {
  ensureDir();
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, list.map((v) => JSON.stringify(v)).join('\n') + (list.length ? '\n' : ''));
  await fsp.rename(tmp, FILE);
});
const appendLine = (entry) => enqueue(async () => { ensureDir(); await fsp.appendFile(FILE, JSON.stringify(entry) + '\n'); });

function init({ file, legacyFile }) {
  FILE = file;
  list = [];
  const parseLines = (txt) => txt.split('\n').map((l) => { try { return l.trim() ? JSON.parse(l) : null; } catch { return null; } }).filter((v) => v && typeof v === 'object' && v.at);
  try { list = parseLines(fs.readFileSync(FILE, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') console.error('[visits] could not read', FILE, e.message); }
  // One-off migration from the previous format (a JSON array in visits.json).
  if (!list.length && legacyFile && fs.existsSync(legacyFile)) {
    try {
      const old = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
      if (Array.isArray(old) && old.length) {
        list = old.filter((v) => v && v.at).map((v) => ({ at: v.at, ip: v.ip || '', vid: vidOf(v.ip || '', v.userAgent || ''), page: v.page || '/', referrer: v.referrer || '', country: countryName(v.country), region: v.region || null, city: v.city || null, browser: v.browser || 'Other', os: v.os || 'Other', device: v.device || 'desktop', bot: false, own: false, language: v.language || '', userAgent: v.userAgent || '' }));
        rewrite().then(() => fsp.rename(legacyFile, `${legacyFile}.migrated`)).catch((e) => console.error('[visits] migration', e.message));
        console.log(`[visits] migrated ${list.length} records from ${path.basename(legacyFile)}`);
      }
    } catch (e) { console.error('[visits] could not migrate', legacyFile, e.message); }
  }
  list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  if (list.length > MAX) { list = list.slice(-TRIM_TO); rewrite().catch(() => {}); }
  return list.length;
}

// Called when a public HTML page has been sent. Returns a promise (geo lookup) that resolves to the record.
async function record(req) {
  const ip = req.ip || '';
  const now = Date.now();
  const recent = (flood.get(ip) || []).filter((t) => now - t < 60e3);
  recent.push(now);
  flood.set(ip, recent);
  if (flood.size > 2000) flood.delete(flood.keys().next().value);
  if (recent.length > FLOOD_PER_MINUTE) return null;

  const ua = str(req.get('user-agent'), 300);
  let referrer = str(req.get('referer'), 300);
  try { if (referrer && new URL(referrer).host === req.get('host')) referrer = ''; } catch { referrer = ''; }
  const entry = {
    at: new Date(now).toISOString(),
    ip,
    vid: vidOf(ip, ua),
    page: str(req.path || req.originalUrl, 200) || '/',
    referrer,
    ...headerGeo(req),
    ...parseUA(ua),
    own: /(?:^|;\s*)ub_owner=1(?:;|$)/.test(req.headers.cookie || ''),
    language: str((req.get('accept-language') || '').split(',')[0], 20).replace(/^\*$/, ''),
    userAgent: ua,
  };
  list.push(entry);
  if (list.length > MAX) { list.splice(0, list.length - TRIM_TO); await rewrite(); }
  if (!entry.country) { const g = await lookupGeo(ip); if (g) Object.assign(entry, g); }
  await appendLine(entry);
  return entry;
}

// Accent-insensitive search ("istanbul" finds İstanbul, "turkiye" finds Türkiye).
const fold = (x) => String(x).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const matches = (v, q) => !q || [v.ip, v.country, v.region, v.city, v.page, v.browser, v.os, v.device, v.referrer, v.language].some((x) => x && fold(x).includes(q));
const visible = ({ bots, own }) => list.filter((v) => (bots || !v.bot) && (own || !v.own));

function query({ q = '', limit = 300, offset = 0, bots = false, own = false } = {}) {
  const needle = fold(String(q || '').trim().slice(0, 80));
  const rows = visible({ bots, own }).filter((v) => matches(v, needle)).reverse();
  const n = Math.max(1, Math.min(2000, Number(limit) || 300)), o = Math.max(0, Number(offset) || 0);
  return { total: rows.length, rows: rows.slice(o, o + n) };
}

function summary({ bots = false, own = false } = {}) {
  const rows = visible({ bots, own });
  const now = Date.now(), day = 864e5;
  const pack = (rs) => ({ views: rs.length, visitors: new Set(rs.map((v) => v.vid)).size });
  const since = (ms) => rows.filter((v) => now - Date.parse(v.at) < ms);
  const tally = (pick, n = 8) => {
    const m = new Map();
    rows.forEach((v) => { const k = pick(v); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
  // Last 30 days, one bucket per UTC day, oldest first.
  const days = [];
  const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
  const byDay = new Map();
  rows.forEach((v) => { const k = v.at.slice(0, 10); const b = byDay.get(k) || { views: 0, vids: new Set() }; b.views++; b.vids.add(v.vid); byDay.set(k, b); });
  for (let i = 29; i >= 0; i--) { const k = dayKey(now - i * day); const b = byDay.get(k); days.push({ day: k, views: b ? b.views : 0, visitors: b ? b.vids.size : 0 }); }
  return {
    total: rows.length,
    since: list.length ? list[0].at : null,
    hidden: { bots: list.filter((v) => v.bot).length, own: list.filter((v) => v.own).length },
    totals: { d1: pack(since(day)), d7: pack(since(7 * day)), d30: pack(since(30 * day)), all: pack(rows) },
    daily: days,
    countriesCount: new Set(rows.map((v) => v.country).filter(Boolean)).size,
    countries: tally((v) => v.country || null, 10),
    cities: tally((v) => (v.city ? `${v.city}${v.country ? `, ${v.country}` : ''}` : null), 10),
    pages: tally((v) => v.page || '/', 10),
    referrers: tally((v) => host(v.referrer), 8),
    browsers: tally((v) => v.browser, 6),
    os: tally((v) => v.os, 6),
    devices: tally((v) => v.device, 3),
    languages: tally((v) => v.language || null, 6),
  };
}

function csv({ bots = true, own = true } = {}) {
  const cols = ['at', 'ip', 'country', 'region', 'city', 'browser', 'os', 'device', 'page', 'referrer', 'language', 'bot', 'own', 'userAgent'];
  const cell = (v) => { let s = v === true ? 'yes' : v === false ? 'no' : String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return [cols.join(','), ...visible({ bots, own }).slice().reverse().map((v) => cols.map((c) => cell(v[c])).join(','))].join('\r\n') + '\r\n';
}

async function clear() { list = []; await rewrite(); }
const count = ({ bots = false, own = false } = {}) => visible({ bots, own }).length;
const all = () => list.slice().reverse();

module.exports = { init, record, query, summary, csv, clear, count, all, parseUA, isPrivateIp, countryName, file: () => FILE };
