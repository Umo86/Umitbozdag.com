'use strict';
// Light validation + normalisation for content saved from the admin panel.
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const str = (v) => (v == null ? '' : String(v));
const lines = (v) => (Array.isArray(v) ? v.map(str) : str(v).split('\n')).map((s) => s.trim()).filter(Boolean);
const paragraphs = (v) => (Array.isArray(v) ? v.map(str) : str(v).split(/\n\s*\n/)).map((s) => s.trim()).filter(Boolean);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function normalize(input) {
  const c = { ...input };
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
  c.testimonials = (c.testimonials || []).map((x) => ({ quote: str(x.quote).trim(), name: str(x.name).trim(), role: str(x.role).trim() })).filter((x) => x.quote);
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

module.exports = { normalize, check, deepMerge, slug, lines, paragraphs };
