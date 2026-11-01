/* Admin panel app: hash-routed views over /admin/api. Vanilla JS, no build step. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
  const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const view = $('#view'), titleEl = $('[data-title]'), statusEl = $('[data-status]'), toastEl = $('[data-toast]');
  const passwordMode = document.body.dataset.passwordMode;
  let content = null, status = null, logos = {}, counts = { visits: 0, messages: 0 };

  /* ---------- API ---------- */
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 401) { location.href = '/admin/login'; throw new Error('Signed out'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  }
  const toast = (msg, kind = 'ok') => { toastEl.textContent = msg; toastEl.className = `toast is-on toast--${kind}`; clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('is-on'), kind === 'error' ? 6500 : 2400); };
  const absorb = (j) => {
    if (j.content) content = j.content;
    if (j.status) status = j.status;
    if (j.logos) logos = j.logos;
    if (j.counts) counts = j.counts;
    $$('[data-count]').forEach((el) => { const n = counts[el.dataset.count]; el.textContent = n ? String(n) : ''; });
    if (status) { statusEl.textContent = status.lastError ? 'Save failed' : status.lastSaved ? `Saved ${new Date(status.lastSaved).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : status.temporary ? 'Temporary storage' : 'Ready'; statusEl.className = `top__status${status.lastError ? ' is-bad' : ''}`; }
  };
  const save = async (patch) => absorb(await api('PATCH', '/admin/api/content', { patch }));
  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach((k) => { if (typeof x[k] !== 'object' || x[k] === null) x[k] = {}; x = x[k]; }); x[ks[ks.length - 1]] = v; };
  const orgName = (id) => ((content.employers || []).find((e) => e.id === id) || {}).name || id || '';
  const logoOf = (x) => x.logoUrl || (x.logo && logos[x.logo]) || '';
  const initials = (name) => String(name || '').replace(/[^A-Za-z0-9 &]/g, '').split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join('').toUpperCase();

  /* ---------- what can be edited ---------- */
  const F = (k, label, t = 'text', extra = {}) => ({ k, label, t, ...extra });
  const SECTIONS = {
    dashboard: { title: 'Dashboard', render: renderDashboard },
    shows: {
      title: 'Events', kind: 'list', key: 'shows', label: (s) => s.name, sub: (s) => [orgName(s.organiser), s.venue, s.years].filter(Boolean).join(' · '), thumb: (s) => logoOf(s), flag: (s) => (s.featured ? 'Featured' : ''),
      help: 'Every event gets its own page at /shows/<slug>. Newest first — use the arrows to reorder.',
      newItem: () => ({ id: '', name: '', organiser: (content.employers[0] || {}).id || '', role: '', years: '', dates: '', venue: '', city: '', country: 'United Kingdom', url: '', logoUrl: '', image: '', summary: '', responsibilities: [], highlights: [], featured: false }),
      fields: [F('name', 'Event name'), F('id', 'Page address (slug)', 'text', { hint: 'Used in the link /shows/<slug>. Leave empty to create it from the name.' }), F('organiser', 'Organiser', 'select', { options: () => content.employers.map((e) => ({ v: e.id, l: e.name })) }), F('role', 'Your role (e.g. Operations Manager — operational support)'), F('years', 'Years shown (e.g. 2023 · 2024)'), F('dates', 'Exact dates (optional, e.g. 2 – 5 December 2025)'), F('venue', 'Venue'), F('city', 'City'), F('country', 'Country'), F('url', 'Event website', 'url'), F('logoUrl', 'Logo', 'image', { kind: 'logo', hint: 'PNG, SVG or WEBP on a transparent or white background.' }), F('image', 'Photo', 'image', { kind: 'image', hint: 'Shown on the event page. Landscape photos work best.' }), F('summary', 'Summary', 'textarea'), F('responsibilities', 'What you did there (one per line)', 'lines'), F('highlights', 'Highlights (one per line, optional — e.g. awards)', 'lines'), F('featured', 'Featured event', 'bool')],
    },
    employers: {
      title: 'Organisers', kind: 'list', key: 'employers', label: (e) => e.name, sub: (e) => [e.role, e.period].filter(Boolean).join(' · '), thumb: (e) => logoOf(e),
      help: 'The companies you have worked for. Events are grouped under these.',
      newItem: () => ({ id: '', name: '', sub: '', url: '', role: '', period: '', note: '', logoUrl: '' }),
      fields: [F('name', 'Name'), F('id', 'Identifier (slug)', 'text', { hint: 'Leave empty to create it from the name. Changing it breaks the link to existing events.' }), F('sub', 'Second line (optional, e.g. Turkish Embassy in London)'), F('url', 'Website', 'url'), F('role', 'Your role there'), F('period', 'Period (e.g. 2023 — 2025)'), F('note', 'Shows worked on (short list)', 'textarea'), F('logoUrl', 'Logo', 'image', { kind: 'logo' })],
    },
    profile: { title: 'Who I am', kind: 'object', fields: [F('name', 'Full name'), F('firstName', 'First name'), F('lastName', 'Last name'), F('title', 'Job title'), F('company', 'Company'), F('statement', 'One-line statement (top of “Who I am”)', 'textarea'), F('intro', 'Intro paragraphs (leave a blank line between paragraphs)', 'paragraphs'), F('location', 'Location'), F('area', 'Area shown in contact (e.g. Islington, London N1)'), F('coords', 'Coordinates line'), F('availability', 'Availability label'), F('portrait.image', 'About image', 'image', { kind: 'image' }), F('portrait.alt', 'Image description (alt text)'), F('portrait.caption', 'Image caption')] },
    contact: { title: 'Contact details', kind: 'object', fields: [F('email', 'Email', 'email'), F('whatsapp', 'WhatsApp number (digits with country code, e.g. 447704050921)'), F('whatsappText', 'Pre-filled WhatsApp message'), F('phone', 'Phone (leave empty to keep it off the site)'), F('linkedin', 'LinkedIn URL', 'url'), F('website', 'Website URL', 'url')] },
    facts: { title: 'Facts', kind: 'list', key: 'facts', label: (f) => f.label, sub: (f) => f.value, newItem: () => ({ label: '', value: '' }), fields: [F('label', 'Label'), F('value', 'Value')] },
    stats: { title: 'Numbers', kind: 'list', key: 'stats', label: (s) => `${s.value}${s.suffix || ''}`, sub: (s) => s.label, newItem: () => ({ value: 0, suffix: '', label: '' }), fields: [F('value', 'Number', 'number'), F('suffix', 'Suffix (e.g. +)'), F('label', 'Label')] },
    services: { title: 'What I do', kind: 'list', key: 'services', label: (s) => s.title, sub: (s) => s.text, intro: { key: 'servicesIntro', label: 'Section headline' }, newItem: () => ({ title: '', text: '' }), fields: [F('title', 'Title'), F('text', 'One or two sentences', 'textarea')] },
    skills: { title: 'Skills chips', kind: 'lines', key: 'alsoSkills', label: 'One skill per line' },
    experience: { title: 'Career history', kind: 'list', key: 'experience', label: (j) => j.role, sub: (j) => [j.company, j.period].filter(Boolean).join(' · '), help: 'Shown on each event page under “My role at …”.', newItem: () => ({ role: '', company: '', place: 'London', period: '', start: '', current: false, summary: '', points: [], events: [] }), fields: [F('role', 'Role'), F('company', 'Company'), F('place', 'Place'), F('period', 'Period (e.g. 2023 — 2025)'), F('start', 'Start year'), F('current', 'Current role', 'bool'), F('summary', 'Summary', 'textarea'), F('points', 'Key points (one per line)', 'lines'), F('events', 'Events (one per line)', 'lines')] },
    credentials: { title: 'Credentials', kind: 'list', key: 'credentials', label: (c) => c.title, sub: (c) => c.text, newItem: () => ({ title: '', text: '' }), fields: [F('title', 'Title'), F('text', 'Detail')] },
    testimonials: { title: 'Testimonials', kind: 'list', key: 'testimonials', label: (t) => t.name, sub: (t) => t.role, help: 'The section appears on the site as soon as there is at least one quote.', newItem: () => ({ quote: '', name: '', role: '' }), fields: [F('quote', 'Quote', 'textarea'), F('name', 'Name'), F('role', 'Role / company')] },
    cities: { title: 'Map cities', kind: 'list', key: 'cities', label: (c) => c.name, sub: (c) => `${c.lat}, ${c.lon}${c.hq ? ' · home base' : ''}`, help: 'Dots on the world map. Exactly one city must be the home base.', newItem: () => ({ name: '', lat: 0, lon: 0, hq: false, label: '' }), fields: [F('name', 'City'), F('lat', 'Latitude', 'number'), F('lon', 'Longitude', 'number'), F('hq', 'Home base', 'bool'), F('label', 'Label position (optional: left, right, below)')] },
    video: { title: 'Header video', kind: 'object', help: 'Direct links to MP4 files. A file at public/video/london.mp4 on the server overrides these.', fields: [F('heroVideo.title', 'Clip title'), F('heroVideo.credit', 'Credit'), F('heroVideo.page', 'Credit link', 'url'), F('heroVideo.poster', 'Poster image URL'), F('heroVideo.sources.mobile', 'Video URL — phones'), F('heroVideo.sources.desktop', 'Video URL — laptops'), F('heroVideo.sources.large', 'Video URL — large screens'), F('heroVideo.tone', 'Look', 'select', { options: () => [{ v: 'duotone', l: 'Blue / black duotone' }, { v: 'natural', l: 'Natural colours' }] })] },
    media: { title: 'Photos & logos', render: renderMedia },
    visitors: { title: 'Visitors', render: renderVisitors },
    messages: { title: 'Messages', render: renderMessages },
    settings: { title: 'Backup & settings', render: renderSettings },
  };

  /* ---------- form fields ---------- */
  function fieldHtml(f, value, idp) {
    const id = `${idp}-${f.k.replace(/\./g, '-')}`;
    const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
    const lab = `<span>${esc(f.label)}</span>`;
    switch (f.t) {
      case 'textarea': return `<label class="field" for="${id}">${lab}<textarea id="${id}" data-k="${f.k}" rows="4">${esc(value)}</textarea>${hint}</label>`;
      case 'lines': return `<label class="field" for="${id}">${lab}<textarea id="${id}" data-k="${f.k}" data-t="lines" rows="5">${esc((Array.isArray(value) ? value : []).join('\n'))}</textarea>${hint}</label>`;
      case 'paragraphs': return `<label class="field" for="${id}">${lab}<textarea id="${id}" data-k="${f.k}" data-t="paragraphs" rows="8">${esc((Array.isArray(value) ? value : [value || '']).join('\n\n'))}</textarea>${hint}</label>`;
      case 'bool': return `<label class="field field--check"><input type="checkbox" id="${id}" data-k="${f.k}" data-t="bool" ${value ? 'checked' : ''}><span>${esc(f.label)}</span>${hint}</label>`;
      case 'select': return `<label class="field" for="${id}">${lab}<select id="${id}" data-k="${f.k}">${(f.options ? f.options() : []).map((o) => `<option value="${esc(o.v)}" ${o.v === value ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>${hint}</label>`;
      case 'number': return `<label class="field" for="${id}">${lab}<input type="number" step="any" id="${id}" data-k="${f.k}" data-t="number" value="${esc(value ?? '')}">${hint}</label>`;
      case 'image': return `<div class="field field--image">${lab}<div class="imgpick" data-kind="${f.kind || 'image'}"><div class="imgpick__preview">${value ? `<img src="${esc(value)}" alt="">` : '<em>No image</em>'}</div><div class="imgpick__ctl"><input type="hidden" data-k="${f.k}" value="${esc(value || '')}"><label class="btn btn--small btn--ghost">Upload… <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden></label><button type="button" class="btn btn--small btn--ghost" data-pick>Choose existing</button><button type="button" class="btn btn--small btn--ghost" data-clear ${value ? '' : 'disabled'}>Remove</button><span class="imgpick__note mono">${esc(value || '')}</span></div></div>${hint}</div>`;
      default: return `<label class="field" for="${id}">${lab}<input type="${f.t === 'url' || f.t === 'email' ? f.t : 'text'}" id="${id}" data-k="${f.k}" value="${esc(value ?? '')}">${hint}</label>`;
    }
  }
  function readForm(formEl, base = {}) {
    const out = JSON.parse(JSON.stringify(base));
    $$('[data-k]', formEl).forEach((el) => {
      const t = el.dataset.t; let v;
      if (t === 'bool') v = el.checked;
      else if (t === 'lines') v = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      else if (t === 'paragraphs') v = el.value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      else if (t === 'number') v = el.value === '' ? 0 : Number(el.value);
      else v = el.value.trim();
      setPath(out, el.dataset.k, v);
    });
    return out;
  }

  /* ---------- images: shrink in the browser, send as data URL ---------- */
  const readAsDataURL = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const loadImage = (file) => new Promise((res, rej) => { const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => { URL.revokeObjectURL(url); res(img); }; img.onerror = rej; img.src = url; });
  async function prepareUpload(file, kind) {
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') return { data: await readAsDataURL(file), name: file.name };
    const img = await loadImage(file);
    const max = kind === 'logo' ? 900 : 1800;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 350 * 1024) return { data: await readAsDataURL(file), name: file.name };
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const png = kind === 'logo' || file.type === 'image/png';
    return { data: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86), name: file.name.replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg') };
  }
  async function uploadFile(file, kind) {
    const { data, name } = await prepareUpload(file, kind);
    return api('POST', '/admin/api/upload', { name, data, kind });
  }
  function wireImagePickers(root) {
    $$('.imgpick', root).forEach((box) => {
      const hidden = $('input[type=hidden]', box), prev = $('.imgpick__preview', box), note = $('.imgpick__note', box), clear = $('[data-clear]', box), input = $('input[type=file]', box);
      const set = (url) => { hidden.value = url || ''; prev.innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<em>No image</em>'; note.textContent = url || ''; clear.disabled = !url; };
      input.addEventListener('change', async () => {
        const file = input.files[0]; if (!file) return;
        try { note.textContent = 'Uploading…'; const j = await uploadFile(file, box.dataset.kind); set(j.url); toast(`Uploaded (${fmtBytes(j.bytes)})`); }
        catch (e) { toast(e.message, 'error'); note.textContent = hidden.value; }
        input.value = '';
      });
      clear.addEventListener('click', () => set(''));
      $('[data-pick]', box).addEventListener('click', async () => { const url = await pickExisting(box.dataset.kind); if (url) set(url); });
    });
  }
  function pickExisting(kind) {
    return new Promise((resolve) => {
      api('GET', '/admin/api/media').then((j) => {
        const items = kind === 'logo' ? [...j.uploads.logos, ...j.builtin.logos] : [...j.uploads.images, ...j.builtin.scenes, ...j.uploads.logos];
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal__box"><header><strong>Choose ${kind === 'logo' ? 'a logo' : 'an image'}</strong><button type="button" class="linkbtn" data-x>Close</button></header><div class="mediagrid">${items.map((m) => `<button type="button" class="media" data-url="${esc(m.url)}"><img src="${esc(m.url)}" alt="" loading="lazy"><span>${esc(m.name)}</span></button>`).join('') || '<p class="empty">No files yet.</p>'}</div></div>`;
        document.body.appendChild(modal);
        const done = (url) => { modal.remove(); resolve(url); };
        modal.addEventListener('click', (e) => { const b = e.target.closest('[data-url]'); if (b) done(b.dataset.url); else if (e.target.closest('[data-x]') || e.target === modal) done(null); });
      }).catch((e) => { toast(e.message, 'error'); resolve(null); });
    });
  }

  /* ---------- list sections (events, organisers, facts, …) ---------- */
  function rowHtml(sec, it, i, n) {
    const thumb = sec.thumb ? sec.thumb(it) : '';
    const flag = sec.flag ? sec.flag(it) : '';
    return `<li class="row" data-i="${i}">
      <span class="row__thumb">${thumb ? `<img src="${esc(thumb)}" alt="">` : `<span>${esc(initials(sec.label(it)) || (i + 1))}</span>`}</span>
      <div><strong>${esc(sec.label(it) || '(untitled)')}${flag ? `<span class="tag">${esc(flag)}</span>` : ''}</strong><small>${esc(sec.sub ? sec.sub(it) : '')}</small></div>
      <div class="row__ctl"><button type="button" class="btn btn--small btn--ghost btn--icon" data-move="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn--small btn--ghost btn--icon" data-move="1" title="Move down" ${i === n - 1 ? 'disabled' : ''}>↓</button>${sec.key === 'shows' ? `<a class="btn btn--small btn--ghost" href="/shows/${esc(it.id)}" target="_blank" rel="noopener">View</a>` : ''}<button type="button" class="btn btn--small btn--ghost" data-edit>Edit</button><button type="button" class="btn btn--small btn--danger" data-del>Delete</button></div>
    </li>`;
  }
  function renderList(sec) {
    const items = content[sec.key] || [];
    view.innerHTML = `${sec.help ? `<p class="hint">${esc(sec.help)}</p>` : ''}
      ${sec.intro ? `<form class="card form" data-intro><label class="field field--wide"><span>${esc(sec.intro.label)}</span><input data-k="${sec.intro.key}" value="${esc(content[sec.intro.key] || '')}"></label><div class="actions"><button class="btn" type="submit">Save headline</button></div></form>` : ''}
      <div class="card"><div class="card__head"><h2>${esc(sec.title)}<span class="count">${items.length}</span></h2><button class="btn" type="button" data-add>+ Add ${esc(sec.title.replace(/s$/, '').toLowerCase())}</button></div>
      <ul class="rows">${items.map((it, i) => rowHtml(sec, it, i, items.length)).join('') || '<li class="empty">Nothing here yet — click “Add”.</li>'}</ul></div>
      <div id="editor"></div>`;
    const persist = async (next, msg) => { try { await save({ [sec.key]: next }); toast(msg || 'Saved'); renderList(sec); } catch (e) { toast(e.message, 'error'); } };
    const intro = $('[data-intro]', view);
    if (intro) intro.addEventListener('submit', async (e) => { e.preventDefault(); try { await save(readForm(intro, {})); toast('Saved'); } catch (err) { toast(err.message, 'error'); } });
    $('[data-add]', view).addEventListener('click', () => openEditor(sec, sec.newItem(), -1));
    $('.rows', view).addEventListener('click', (e) => {
      const li = e.target.closest('.row'); if (!li) return;
      const i = Number(li.dataset.i); const list = [...(content[sec.key] || [])];
      if (e.target.closest('[data-move]')) { const d = Number(e.target.closest('[data-move]').dataset.move); const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; persist(list, 'Reordered'); }
      else if (e.target.closest('[data-del]')) { if (confirm(`Delete “${sec.label(list[i]) || 'this item'}”? This cannot be undone.`)) { list.splice(i, 1); persist(list, 'Deleted'); } }
      else if (e.target.closest('[data-edit]')) openEditor(sec, list[i], i);
    });
  }
  function openEditor(sec, item, index) {
    const host = $('#editor');
    $$('.row.is-editing', view).forEach((r) => r.classList.remove('is-editing'));
    if (index >= 0) { const r = $(`.row[data-i="${index}"]`, view); if (r) r.classList.add('is-editing'); }
    host.innerHTML = `<form class="card form editor"><div class="card__head field--wide"><h2>${index < 0 ? 'New' : 'Edit'} — ${esc(sec.label(item) || sec.title.replace(/s$/, ''))}</h2></div>${sec.fields.map((f) => fieldHtml(f, getPath(item, f.k), 'ed')).join('')}<div class="actions"><button class="btn" type="submit">${index < 0 ? 'Add' : 'Save changes'}</button><button class="btn btn--ghost" type="button" data-cancel>Cancel</button><span class="spacer"></span><span class="hint">Changes go live on the site as soon as you save.</span></div></form>`;
    wireImagePickers(host);
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const formEl = $('form', host);
    $('[data-cancel]', host).addEventListener('click', () => { host.innerHTML = ''; $$('.row.is-editing', view).forEach((r) => r.classList.remove('is-editing')); });
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const next = readForm(formEl, item);
      if ('id' in next && !next.id) next.id = slug(next.name);
      if (!String(next.name || next.label || next.title || next.role || next.quote || '').trim()) { toast('Please give it a name.', 'error'); return; }
      const list = [...(content[sec.key] || [])];
      if (index < 0) list.unshift(next); else list[index] = next;
      try { await save({ [sec.key]: list }); toast(index < 0 ? 'Added' : 'Saved'); renderList(sec); } catch (err) { toast(err.message, 'error'); }
    });
  }

  /* ---------- object sections (profile, contact, video) & lines (skills) ---------- */
  function renderObject(sec) {
    view.innerHTML = `${sec.help ? `<p class="hint">${esc(sec.help)}</p>` : ''}<form class="card form">${sec.fields.map((f) => fieldHtml(f, getPath(content, f.k), 'ob')).join('')}<div class="actions"><button class="btn" type="submit">Save changes</button><span class="spacer"></span><span class="hint">Changes go live on the site as soon as you save.</span></div></form>`;
    wireImagePickers(view);
    $('form', view).addEventListener('submit', async (e) => { e.preventDefault(); try { await save(readForm($('form', view), {})); toast('Saved'); } catch (err) { toast(err.message, 'error'); } });
  }
  function renderLines(sec) {
    view.innerHTML = `<form class="card form"><label class="field field--wide"><span>${esc(sec.label)}</span><textarea data-k="${sec.key}" data-t="lines" rows="12">${esc((content[sec.key] || []).join('\n'))}</textarea></label><div class="actions"><button class="btn" type="submit">Save changes</button></div></form>`;
    $('form', view).addEventListener('submit', async (e) => { e.preventDefault(); try { await save(readForm($('form', view), {})); toast('Saved'); } catch (err) { toast(err.message, 'error'); } });
  }

  /* ---------- dashboard ---------- */
  async function renderDashboard() {
    let visits = [];
    try { visits = (await api('GET', '/admin/api/visits')).visits || []; } catch { /* fine */ }
    const day = 864e5, now = Date.now();
    const last7 = visits.filter((v) => now - Date.parse(v.at) < 7 * day).length;
    const today = visits.filter((v) => now - Date.parse(v.at) < day).length;
    const st = status || {};
    const storage = st.temporary ? ['is-warn', 'Temporary', 'Edits vanish when this preview restarts'] : st.writable ? ['is-ok', 'Saved to disk', st.lastSaved ? `Last change ${fmtDate(st.lastSaved)}` : 'Using the built-in content'] : ['is-warn', 'Read-only', 'Changes cannot be saved'];
    view.innerHTML = `
      <div class="tiles">
        <a class="tile" href="#shows"><span>Events</span><strong>${content.shows.length}</strong><span>${content.shows.filter((s) => s.featured).length} featured</span></a>
        <a class="tile" href="#employers"><span>Organisers</span><strong>${content.employers.length}</strong><span>${content.experience.length} career roles</span></a>
        <a class="tile" href="#visitors"><span>Visitors</span><strong>${last7}</strong><span>last 7 days · ${today} today · ${visits.length} total</span></a>
        <a class="tile" href="#messages"><span>Messages</span><strong>${counts.messages || 0}</strong><span>saved from the contact form</span></a>
      </div>
      <div class="tiles">
        <div class="tile ${storage[0]}"><span>Storage</span><strong>${storage[1]}</strong><span>${esc(storage[2])}</span></div>
        <div class="tile"><span>Password</span><strong style="font-size:1.1rem">${passwordMode === 'env' ? 'From host settings' : 'Stored on server'}</strong><span>${passwordMode === 'env' ? 'ADMIN_PASSWORD variable' : 'Change it under Backup & settings'}</span></div>
        <div class="tile"><span>Contact form</span><strong style="font-size:1.1rem">${counts.messages ? 'Saving to file' : 'See README'}</strong><span>Emails go out when SMTP is set</span></div>
        <div class="tile"><span>Public site</span><strong style="font-size:1.1rem"><a href="/" target="_blank" rel="noopener">Open ↗</a></strong><span>${esc(content.name)} · ${esc(content.title)}</span></div>
      </div>
      <div class="card"><div class="card__head"><h2>Quick actions</h2></div><div class="quick"><a class="btn" href="#shows" data-quick-add>+ Add an event</a><a class="btn btn--ghost" href="#media">Upload photos</a><a class="btn btn--ghost" href="#profile">Edit “Who I am”</a><a class="btn btn--ghost" href="/admin/api/export">Download backup</a></div></div>
      <div class="card"><div class="card__head"><h2>Latest visitors</h2><a class="linkbtn" href="#visitors">All visitors →</a></div>${visits.length ? `<div class="tablewrap"><table class="table"><thead><tr><th>When</th><th>Where</th><th>Browser</th><th>Page</th></tr></thead><tbody>${visits.slice(-8).reverse().map((v) => `<tr><td>${esc(fmtDate(v.at))}</td><td>${esc([v.city, v.country].filter(Boolean).join(', ') || '—')}</td><td>${esc([v.browser, v.os, v.device].filter(Boolean).join(' · '))}</td><td class="mono">${esc(v.page || '/')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No visits recorded yet.</p>'}</div>`;
    $('[data-quick-add]', view).addEventListener('click', () => setTimeout(() => { const b = $('[data-add]', view); if (b) b.click(); }, 50));
  }

  /* ---------- media ---------- */
  async function renderMedia() {
    const j = await api('GET', '/admin/api/media');
    const grid = (items, deletable) => (items.length ? `<div class="mediagrid">${items.map((m) => `<div class="media"><img src="${esc(m.url)}" alt="" loading="lazy"><span>${esc(m.name)} · ${fmtBytes(m.bytes)}</span><div class="media__ctl"><button type="button" class="btn btn--small btn--ghost" data-copy="${esc(m.url)}">Copy link</button>${deletable ? `<button type="button" class="btn btn--small btn--danger" data-delfile="${esc(m.url)}">Delete</button>` : ''}</div></div>`).join('')}</div>` : '<p class="empty">Nothing uploaded yet.</p>');
    view.innerHTML = `
      <div class="card"><div class="card__head"><h2>Upload</h2><div class="quick"><label class="btn">Upload photos… <input type="file" accept="image/*" multiple hidden data-up="image"></label><label class="btn btn--ghost">Upload logos… <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" multiple hidden data-up="logo"></label></div></div><p class="hint">Photos are shrunk to 1800px before upload; logos to 900px. You can then pick them from any “Choose existing” button, or copy the link.</p></div>
      <div class="card"><div class="card__head"><h2>Uploaded photos<span class="count">${j.uploads.images.length}</span></h2></div>${grid(j.uploads.images, true)}</div>
      <div class="card"><div class="card__head"><h2>Uploaded logos<span class="count">${j.uploads.logos.length}</span></h2></div>${grid(j.uploads.logos, true)}</div>
      <div class="card"><div class="card__head"><h2>Built-in logos<span class="count">${j.builtin.logos.length}</span></h2></div><p class="hint">These ship with the site (public/img/logos). Events use them automatically by slug; upload a new logo on the event to replace one.</p>${grid(j.builtin.logos, false)}</div>
      <div class="card"><div class="card__head"><h2>Built-in illustrations<span class="count">${j.builtin.scenes.length}</span></h2></div>${grid(j.builtin.scenes, false)}</div>`;
    $$('[data-up]', view).forEach((input) => input.addEventListener('change', async () => {
      const files = [...input.files]; let ok = 0;
      for (const f of files) { try { await uploadFile(f, input.dataset.up); ok++; } catch (e) { toast(`${f.name}: ${e.message}`, 'error'); } }
      if (ok) { toast(`Uploaded ${ok} file${ok === 1 ? '' : 's'}`); renderMedia(); }
      input.value = '';
    }));
    view.addEventListener('click', async (e) => {
      const copy = e.target.closest('[data-copy]'); const del = e.target.closest('[data-delfile]');
      if (copy) { try { await navigator.clipboard.writeText(location.origin + copy.dataset.copy); toast('Link copied'); } catch { prompt('Copy this link:', location.origin + copy.dataset.copy); } }
      if (del && confirm('Delete this file? Anything still using it will show a broken image.')) { try { const r = await api('DELETE', `/admin/api/media?url=${encodeURIComponent(del.dataset.delfile)}`); toast(r.stillReferenced ? 'Deleted — note: it was still in use somewhere' : 'Deleted'); renderMedia(); } catch (err) { toast(err.message, 'error'); } }
    });
  }

  /* ---------- visitors ---------- */
  async function renderVisitors() {
    const { visits = [] } = await api('GET', '/admin/api/visits');
    const day = 864e5, now = Date.now();
    const tally = (key) => { const m = new Map(); visits.forEach((v) => { const k = v[key] || 'Unknown'; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); };
    const bars = (rows) => { const max = Math.max(1, ...rows.map((r) => r[1])); return `<div class="bars">${rows.map(([k, n]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${Math.round((n / max) * 100)}%"></i><b>${n}</b></div>`).join('') || '<p class="empty">No data yet.</p>'}</div>`; };
    view.innerHTML = `
      <div class="tiles"><div class="tile"><span>Total visits</span><strong>${visits.length}</strong><span>since logging began</span></div><div class="tile"><span>Last 24 hours</span><strong>${visits.filter((v) => now - Date.parse(v.at) < day).length}</strong><span>unique by IP: ${new Set(visits.filter((v) => now - Date.parse(v.at) < day).map((v) => v.ip)).size}</span></div><div class="tile"><span>Last 7 days</span><strong>${visits.filter((v) => now - Date.parse(v.at) < 7 * day).length}</strong><span>unique by IP: ${new Set(visits.filter((v) => now - Date.parse(v.at) < 7 * day).map((v) => v.ip)).size}</span></div><div class="tile"><span>Countries</span><strong>${new Set(visits.map((v) => v.country).filter(Boolean)).size}</strong><span>with a known location</span></div></div>
      <div class="tiles" style="grid-template-columns:repeat(3,1fr)"><div class="card"><h3>Top countries</h3>${bars(tally('country'))}</div><div class="card"><h3>Top cities</h3>${bars(tally('city'))}</div><div class="card"><h3>Browsers</h3>${bars(tally('browser'))}</div></div>
      <div class="card"><div class="card__head"><h2>Latest 200 visits</h2><div class="quick"><button type="button" class="btn btn--ghost btn--small" data-csv>Download CSV</button><button type="button" class="btn btn--danger btn--small" data-clear>Clear log</button></div></div>
      ${visits.length ? `<div class="tablewrap"><table class="table"><thead><tr><th>When</th><th>IP</th><th>Country</th><th>City</th><th>Browser</th><th>Device</th><th>Page</th><th>Referrer</th></tr></thead><tbody>${visits.slice(-200).reverse().map((v) => `<tr><td>${esc(fmtDate(v.at))}</td><td class="mono">${esc(v.ip)}</td><td>${esc(v.country || '—')}</td><td>${esc(v.city || '—')}</td><td>${esc([v.browser, v.os].filter(Boolean).join(' · '))}</td><td>${esc(v.device || '')}</td><td class="mono">${esc(v.page || '/')}</td><td class="mono">${esc((v.referrer || '').replace(/^https?:\/\//, '').slice(0, 40))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No visits recorded yet. Visits are logged after a visitor accepts the banner.</p>'}
      <p class="hint">Location comes from the host’s geo headers, or from ipapi.co when GEOIP_PROVIDER=ipapi is set. Records are kept in ${esc((status || {}).dataDir || 'the data folder')}/visits.json (newest 5,000).</p></div>`;
    $('[data-csv]', view).addEventListener('click', () => {
      const cols = ['at', 'ip', 'country', 'region', 'city', 'browser', 'os', 'device', 'page', 'referrer', 'language', 'userAgent'];
      const csv = [cols.join(','), ...visits.map((v) => cols.map((c) => `"${String(v[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `visits-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('[data-clear]', view).addEventListener('click', async () => { if (!confirm('Delete the whole visitor log?')) return; try { await api('POST', '/admin/api/visits/clear', {}); toast('Log cleared'); absorb(await api('GET', '/admin/api/status')); renderVisitors(); } catch (e) { toast(e.message, 'error'); } });
  }

  /* ---------- messages ---------- */
  async function renderMessages() {
    const { messages = [] } = await api('GET', '/admin/api/messages');
    view.innerHTML = `<div class="card"><div class="card__head"><h2>Contact form messages<span class="count">${messages.length}</span></h2>${messages.length ? '<button type="button" class="btn btn--danger btn--small" data-clear>Clear all</button>' : ''}</div><p class="hint">Messages are saved here when email (SMTP) isn’t configured. With SMTP set up they are emailed to you instead and won’t appear in this list.</p>
      ${messages.length ? `<div class="rows">${[...messages].reverse().map((m) => `<div class="msg"><header><strong>${esc(m.name)} &lt;${esc(m.email)}&gt;${m.company ? ` · ${esc(m.company)}` : ''}</strong><span class="mono">${esc(fmtDate(m.receivedAt))}</span></header><p>${esc(m.message)}</p><div class="actions"><a class="btn btn--small btn--ghost" href="mailto:${esc(m.email)}?subject=Re:%20your%20message%20on%20umitbozdag.com">Reply by email</a></div></div>`).join('')}</div>` : '<p class="empty">No messages saved.</p>'}</div>`;
    const clear = $('[data-clear]', view);
    if (clear) clear.addEventListener('click', async () => { if (!confirm('Delete all saved messages?')) return; try { await api('POST', '/admin/api/messages/clear', {}); toast('Cleared'); absorb(await api('GET', '/admin/api/status')); renderMessages(); } catch (e) { toast(e.message, 'error'); } });
  }

  /* ---------- settings: backup, restore, raw JSON, password ---------- */
  function renderSettings() {
    const st = status || {};
    view.innerHTML = `
      <div class="card"><div class="card__head"><h2>Storage</h2></div><table class="table"><tbody><tr><th>Content file</th><td class="mono">${esc(st.contentFile || '')}</td></tr><tr><th>Loaded from</th><td class="mono">${esc(st.loadedFrom || '')}</td></tr><tr><th>Uploads folder</th><td class="mono">${esc(st.uploadDir || '')}</td></tr><tr><th>Writable</th><td>${st.writable ? 'Yes' : 'No'}${st.temporary ? ' (temporary — this host forgets files on restart)' : ''}</td></tr><tr><th>Last saved</th><td>${st.lastSaved ? esc(fmtDate(st.lastSaved)) : 'Not yet'}</td></tr>${st.lastError ? `<tr><th>Last error</th><td style="color:var(--bad)">${esc(st.lastError)}</td></tr>` : ''}</tbody></table></div>
      <div class="card"><div class="card__head"><h2>Backup &amp; restore</h2></div><p class="hint">Download a copy of everything you have entered (events, text, settings) as a JSON file. Restore it later on this or another server. Uploaded photos are separate — back up the uploads folder too.</p><div class="actions"><a class="btn" href="/admin/api/export">Download backup</a><label class="btn btn--ghost">Restore from file… <input type="file" accept="application/json,.json" hidden data-import></label><span class="spacer"></span><button type="button" class="btn btn--danger" data-reset>Reset to built-in content</button></div></div>
      ${passwordMode === 'env' ? '<div class="card"><div class="card__head"><h2>Password</h2></div><p class="hint">On this host the password is set by the <code>ADMIN_PASSWORD</code> environment variable. Change it in the hosting control panel.</p></div>' : `<div class="card"><form class="form" data-pw><div class="card__head field--wide"><h2>Change password</h2></div><label class="field"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label><label class="field"><span>New password (10+ characters)</span><input type="password" name="password" minlength="10" autocomplete="new-password" required></label><div class="actions"><button class="btn" type="submit">Update password</button></div></form></div>`}
      <div class="card"><div class="card__head"><h2>Advanced: edit everything as JSON</h2></div><p class="hint">For anything the forms don’t cover. Invalid JSON or missing required fields are rejected, so you can’t break the site by accident.</p><form data-raw><textarea class="json field" data-raw-text spellcheck="false">${esc(JSON.stringify(content, null, 2))}</textarea><div class="actions"><button class="btn" type="submit">Save JSON</button><button class="btn btn--ghost" type="button" data-pretty>Re-format</button></div></form></div>`;
    $('[data-import]', view).addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const text = await f.text(); const parsed = JSON.parse(text); if (!confirm('Replace all current content with this backup?')) return; absorb(await api('POST', '/admin/api/import', { content: parsed })); toast('Backup restored'); renderSettings(); }
      catch (err) { toast(err.message, 'error'); }
      e.target.value = '';
    });
    $('[data-reset]', view).addEventListener('click', async () => { if (!confirm('Throw away all changes made in this admin and go back to the built-in content? Download a backup first if unsure.')) return; try { absorb(await api('POST', '/admin/api/reset', {})); toast('Reset to built-in content'); renderSettings(); } catch (e) { toast(e.message, 'error'); } });
    const pw = $('[data-pw]', view);
    if (pw) pw.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('POST', '/admin/api/password', { current: pw.current.value, password: pw.password.value }); toast('Password updated'); pw.reset(); } catch (err) { toast(err.message, 'error'); } });
    const raw = $('[data-raw]', view), ta = $('[data-raw-text]', view);
    $('[data-pretty]', view).addEventListener('click', () => { try { ta.value = JSON.stringify(JSON.parse(ta.value), null, 2); } catch (err) { toast(`Not valid JSON: ${err.message}`, 'error'); } });
    raw.addEventListener('submit', async (e) => { e.preventDefault(); let parsed; try { parsed = JSON.parse(ta.value); } catch (err) { toast(`Not valid JSON: ${err.message}`, 'error'); return; } try { absorb(await api('PUT', '/admin/api/content', { content: parsed })); toast('Saved'); ta.value = JSON.stringify(content, null, 2); } catch (err) { toast(err.message, 'error'); } });
  }

  /* ---------- routing ---------- */
  async function route() {
    const key = (location.hash || '#dashboard').slice(1).split('/')[0];
    const sec = SECTIONS[key] || SECTIONS.dashboard;
    $$('[data-nav]').forEach((a) => a.classList.toggle('is-on', a.dataset.nav === key));
    titleEl.textContent = sec.title;
    document.title = `${sec.title} — Admin`;
    document.body.classList.remove('side-open');
    view.innerHTML = '<p class="hint">Loading…</p>';
    try {
      if (sec.render) await sec.render(sec);
      else if (sec.kind === 'list') renderList(sec);
      else if (sec.kind === 'lines') renderLines(sec);
      else renderObject(sec);
    } catch (e) { view.innerHTML = `<div class="banner banner--warn">${esc(e.message)}</div>`; }
    window.scrollTo(0, 0);
  }
  $('[data-open-side]').addEventListener('click', () => document.body.classList.add('side-open'));
  $('[data-close-side]').addEventListener('click', () => document.body.classList.remove('side-open'));
  window.addEventListener('hashchange', route);
  api('GET', '/admin/api/content').then((j) => { absorb(j); route(); }).catch((e) => { view.innerHTML = `<div class="banner banner--warn">${esc(e.message)}</div>`; });
})();
