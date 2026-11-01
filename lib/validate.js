'use strict';
// Light validation + normalisation for content saved from the admin panel.
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const str = (v) => (v == null ? '' : String(v));
const lines = (v) => (Array.isArray(v) ? v.map(str) : str(v).split('\n')).map((s) => s.trim()).filter(Boolean);
const paragraphs = (v) => (Array.isArray(v) ? v.map(str) : str(v).split(/\n\s*\n/)).map((s) => s.trim()).filter(Boolean);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

const LIST_KEYS = ['shows', 'employers', 'facts', 'stats', 'services', 'experience', 'cities', 'credentials', 'testimonials'];
const OBJECT_KEYS = ['portrait', 'heroVideo'];
// Shape checks on the raw input, before anything is coerced: a list that arrives as null must not become [].
function precheck(input) {
  const errors = [];
  if (!isObj(input)) return ['Content must be an object'];
  for (const k of LIST_KEYS) if (k in input && !Array.isArray(input[k])) errors.push(`"${k}" must be a list`);
  for (const k of LIST_KEYS) if (Array.isArray(input[k])) input[k].forEach((it, i) => { if (!isObj(it)) errors.push(`"${k}" item #${i + 1} must be an object`); });
  for (const k of OBJECT_KEYS) if (k in input && !isObj(input[k])) errors.push(`"${k}" must be an object`);
  if (isObj(input.heroVideo) && 'sources' in input.heroVideo && !isObj(input.heroVideo.sources)) errors.push('"heroVideo.sources" must be an object');
  for (const k of ['intro', 'alsoSkills', 'languages']) if (k in input && input[k] != null && typeof input[k] !== 'string' && !Array.isArray(input[k])) errors.push(`"${k}" must be text or a list`);
  return errors;
}
const validUrl = (u) => { if (!u) return true; const s = str(u); if (s.startsWith('/') && !s.startsWith('//')) return true; try { const x = new URL(s); return /^https?:$/.test(x.protocol) && /^[a-z0-9.-]+$/i.test(x.hostname); } catch { return false; } };

function normalize(input) {
  const c = { ...input };
  c.portrait = isObj(c.portrait) ? { ...c.portrait } : {};
  c.heroVideo = isObj(c.heroVideo) ? { ...c.heroVideo, sources: isObj(c.heroVideo.sources) ? { ...c.heroVideo.sources } : {} } : { sources: {} };
  c.employers = (c.employers || []).map((e) => ({ ...e, id: slug(e.id || e.name), name: str(e.name).trim() }));
  const ids = new Set();
  c.shows = (c.shows || []).map((s) => {
    let id = slug(s.id || s.name) || 'event';
    const base = id; let n = 2;
    while (ids.has(id)) id = `${base}-${n++}`;
    ids.add(id);
    return { ...s, id, name: str(s.name).trim(), responsibilities: lines(s.responsibilities), highlights: lines(s.highlights), featured: !!s.featured };
  });
  c.intro = paragraphs(c.intro);
  c.alsoSkills = lines(c.alsoSkills);
  c.languages = lines(c.languages);
  c.facts = (c.facts || []).map((f) => ({ label: str(f.label).trim(), value: str(f.value).trim() }));
  c.stats = (c.stats || []).map((s) => ({ value: Number(s.value) || 0, suffix: str(s.suffix), label: str(s.label).trim() }));
  c.services = (c.services || []).map((s) => ({ title: str(s.title).trim(), text: str(s.text).trim() }));
  c.experience = (c.experience || []).map((j) => ({ ...j, points: lines(j.points), events: lines(j.events), current: !!j.current }));
  c.cities = (c.cities || []).map((x) => ({ ...x, name: str(x.name).trim(), lat: Number(x.lat), lon: Number(x.lon), hq: !!x.hq }));
  c.credentials = (c.credentials || []).map((x) => ({ title: str(x.title).trim(), text: str(x.text).trim() }));
  c.testimonials = (c.testimonials || []).map((x) => ({ quote: str(x.quote).trim(), name: str(x.name).trim(), role: str(x.role).trim() }));
  if (c.whatsapp != null) c.whatsapp = str(c.whatsapp).replace(/[^\d]/g, '');
  return c;
}

function check(c) {
  const errors = [];
  if (!isObj(c)) return ['Content must be an object'];
  for (const k of ['name', 'firstName', 'lastName', 'title', 'email']) if (!str(c[k]).trim()) errors.push(`"${k}" is required`);
  if (!Array.isArray(c.shows)) errors.push('"shows" must be a list');
  if (!Array.isArray(c.employers)) errors.push('"employers" must be a list');
  const orgIds = new Set((c.employers || []).map((e) => e.id));
  (c.employers || []).forEach((e, i) => { if (!e.name) errors.push(`Organiser #${i + 1} has no name`); });
  (c.shows || []).forEach((s, i) => {
    if (!s.name) errors.push(`Event #${i + 1} has no name`);
    if (s.organiser && !orgIds.has(s.organiser)) errors.push(`Event "${s.name}" points to an unknown organiser "${s.organiser}"`);
  });
  (c.testimonials || []).forEach((t, i) => { if (!t.quote) errors.push(`Testimonial #${i + 1} needs a quote`); });
  const urlFields = [['linkedin', c.linkedin], ['website', c.website], ['portrait.image', (c.portrait || {}).image], ['heroVideo.poster', (c.heroVideo || {}).poster],
    ...Object.entries(((c.heroVideo || {}).sources) || {}).map(([k, v]) => [`heroVideo.sources.${k}`, v]),
    ...(c.shows || []).flatMap((s) => [[`event "${s.name}" website`, s.url], [`event "${s.name}" logo`, s.logoUrl], [`event "${s.name}" image`, s.image]]),
    ...(c.employers || []).flatMap((e) => [[`organiser "${e.name}" website`, e.url], [`organiser "${e.name}" logo`, e.logoUrl]])];
  for (const [label, v] of urlFields) if (!validUrl(v)) errors.push(`${label}: not a valid web address`);
  if (Array.isArray(c.cities) && c.cities.length) {
    const hqs = c.cities.filter((x) => x.hq).length;
    if (hqs !== 1) errors.push('Exactly one map city must be marked as the home base');
    c.cities.forEach((x) => { if (!Number.isFinite(x.lat) || !Number.isFinite(x.lon)) errors.push(`City "${x.name}" needs a numeric latitude and longitude`); });
  }
  return errors;
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

module.exports = { precheck, normalize, check, deepMerge, slug, lines, paragraphs, validUrl };
