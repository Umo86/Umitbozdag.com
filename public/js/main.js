/* ==========================================================================
   Umit Bozdag — front-end behaviour. Vanilla JS, no dependencies.
   (Scripts are loaded from /js only: the Content-Security-Policy forbids inline scripts.)
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;

  /* ---------- Hero: illustrated fallback + the London film ---------- */
  function hero() {
    const hero = $('.hero');
    const video = $('.hero__video');
    const canvas = $('.hero__canvas');
    if (!hero) return;
    const scene = window.LondonScene;

    // Canvas fallback: draws the illustrated London loop until the video is playing.
    let running = false, raf = null, ctx = null;
    const t0 = performance.now();
    const resize = () => {
      const r = hero.getBoundingClientRect();
      const s = Math.min(1, 1280 / Math.max(1, r.width));
      canvas.width = Math.max(2, Math.round(r.width * s));
      canvas.height = Math.max(2, Math.round(r.height * s));
    };
    const frame = (now) => {
      raf = null;
      if (!running) return;
      scene.draw(ctx, canvas.width, canvas.height, (now - t0) / 1000, { camera: 'wide', palette: 'blue' });
      raf = requestAnimationFrame(frame);
    };
    const startCanvas = () => {
      if (!scene || !canvas || running) return;
      ctx = ctx || canvas.getContext('2d');
      resize();
      if (reduced) { scene.draw(ctx, canvas.width, canvas.height, 2.4, { camera: 'wide', palette: 'blue' }); return; }
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stopCanvas = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = null; };
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (running) resize(); }, 120); });
    startCanvas();

    if (!video) return;
    const conn = navigator.connection || {};
    if (reduced || conn.saveData) { video.remove(); return; } // respect the visitor: poster/illustration only

    const w = window.innerWidth, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const src = w < 768 ? video.dataset.srcMobile : (w * dpr > 2300 ? video.dataset.srcLarge : video.dataset.srcDesktop);
    if (!src) return;

    let ready = false;
    video.addEventListener('playing', () => {
      if (ready) return;
      ready = true;
      hero.classList.add('video-ready');
      setTimeout(stopCanvas, 1800);
    });
    video.addEventListener('error', () => { hero.classList.add('video-failed'); startCanvas(); });
    video.src = src;
    video.load();
    const p = video.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked: the illustration stays */ });

    // Pause everything while the hero is off screen.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        const visible = entries[0].isIntersecting;
        if (visible) {
          if (ready) { if (video.paused) video.play().catch(() => {}); } else startCanvas();
        } else {
          if (!video.paused) video.pause();
          stopCanvas();
        }
      }, { threshold: 0.02 }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (!video.paused) video.pause(); stopCanvas(); }
      else if (ready) video.play().catch(() => {}); else startCanvas();
    });
  }
  /* ---------- Mobile nav ---------- */
  function mobileNav() {
    const nav = $('.nav'), burger = $('.nav__burger');
    if (!nav || !burger) return;
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    burger.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    $$('.nav__links a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }
  /* ---------- Events: filter by organiser ---------- */
  function eventFilters() {
    const bar = $('.filters');
    if (!bar) return;
    const items = $$('.evt-grid > li');
    const apply = (f) => {
      $$('button[data-filter]', bar).forEach((b) => { const on = b.dataset.filter === f; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      items.forEach((li) => { li.hidden = !(f === 'all' || li.dataset.org === f); });
    };
    bar.addEventListener('click', (e) => { const b = e.target.closest('button[data-filter]'); if (b) apply(b.dataset.filter); });
    // "4 events ↓" links in the career list pre-select that organiser
    $$('[data-filter-link]').forEach((a) => a.addEventListener('click', () => apply(a.dataset.filterLink)));
  }
  /* ---------- WhatsApp greeting bubble ---------- */
  function whatsapp() {
    const bubble = $('.wa-bubble');
    if (!bubble) return;
    let seen = false;
    try { seen = sessionStorage.getItem('ub-wa') === '1'; } catch { /* private mode */ }
    if (seen) { bubble.remove(); return; }
    const hide = () => {
      bubble.classList.remove('is-on');
      try { sessionStorage.setItem('ub-wa', '1'); } catch { /* ignore */ }
      setTimeout(() => bubble.remove(), 600);
    };
    setTimeout(() => bubble.classList.add('is-on'), 5000);
    const close = $('.wa-bubble__close', bubble);
    if (close) close.addEventListener('click', (e) => { e.preventDefault(); hide(); });
    const link = $('a', bubble);
    if (link) link.addEventListener('click', hide);
    const wa = $('.wa');
    if (wa) wa.addEventListener('click', hide);
  }
  /* ---------- Images that fail to load keep a styled background ---------- */
  function imageFallbacks() {
    $$('img').forEach((img) => {
      const mark = () => img.classList.add('is-broken');
      if (img.complete && img.naturalWidth === 0 && img.src) mark();
      img.addEventListener('error', mark);
    });
  }
  /* ---------- Contact form ---------- */
  function contactForm() {
    const form = $('.cform');
    if (!form) return;
    const status = $('.cform__status', form);
    const button = $('button[type="submit"]', form);
    const label = $('.btn__label', button) || button;
    const thanks = $('.cform__thanks', form);
    const defaultLabel = label.textContent;
    const setStatus = (msg, ok = false) => { if (status) { status.textContent = msg; status.style.color = ok ? '#1a47ff' : ''; } };
    const validEmail = (v) => /^\S+@\S+\.\S+$/.test(v);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const name = (data.name || '').trim(), email = (data.email || '').trim(), message = (data.message || '').trim();
      if (!name || !validEmail(email) || message.length < 5) {
        setStatus('Please add your name, a valid email and a short message.');
        const field = form.elements[!name ? 'name' : !validEmail(email) ? 'email' : 'message'];
        if (field) field.focus();
        return;
      }
      setStatus('');
      button.disabled = true;
      label.textContent = 'Sending…';
      try {
        const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
        let json = {};
        try { json = await res.json(); } catch { /* non-JSON error page */ }
        if (json.fallback === 'mailto' && json.to) {
          const subject = encodeURIComponent(`Website enquiry from ${name}`);
          const bodyText = encodeURIComponent(`${message}\n\n${name}${data.company ? `\n${data.company}` : ''}`);
          window.location.href = `mailto:${json.to}?subject=${subject}&body=${bodyText}`;
          setStatus('Opening your email app so you can send this directly…', true);
          return;
        }
        if (!res.ok || !json.ok) throw new Error(json.error || `Something went wrong (${res.status}). Please email me directly.`);
        if (thanks) thanks.textContent = `Thanks, ${name.split(/\s+/)[0]}!`;
        form.classList.add('is-sent');
        form.reset();
        setStatus('Message sent.', true);
      } catch (err) {
        setStatus(err && err.message ? err.message : 'Network error — please try again or email me directly.');
      } finally {
        button.disabled = false;
        label.textContent = defaultLabel;
      }
    });
    const done = $('.cform__done', form);
    if (done) done.addEventListener('click', () => { form.classList.remove('is-sent'); setStatus(''); });
  }
  /* ---------- World map: routes draw on scroll, labels follow the map, the city list highlights ---------- */
  function worldMap() {
    const map = $('.map');
    if (!map) return;
    if (!('IntersectionObserver' in window)) map.classList.add('is-visible');
    else { const io = new IntersectionObserver((entries) => { entries.forEach((e) => { if (e.isIntersecting) { map.classList.add('is-visible'); io.disconnect(); } }); }, { threshold: 0.2 }); io.observe(map); }

    // Labels are placed from the map's real scale: on phones the SVG is cropped (preserveAspectRatio="slice"),
    // so the server-rendered percentages would drift.
    const svg = $('.map__svg', map), labels = $$('.map__label', map);
    const place = () => {
      if (!svg || !svg.viewBox) return;
      const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      if (!r.width || !vb.width) return;
      const s = Math.max(r.width / vb.width, r.height / vb.height), ox = (r.width - vb.width * s) / 2, oy = (r.height - vb.height * s) / 2;
      labels.forEach((l) => { l.style.left = `${ox + Number(l.dataset.x) * s}px`; l.style.top = `${oy + Number(l.dataset.y) * s}px`; });
    };
    place();
    let pt;
    window.addEventListener('resize', () => { clearTimeout(pt); pt = setTimeout(place, 100); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);

    const parts = $$('[data-city]', map), buttons = $$('.world__city');
    const set = (id) => {
      map.classList.toggle('has-hot', !!id);
      parts.forEach((el) => el.classList.toggle('is-hot', !!id && el.dataset.city === id));
      buttons.forEach((b) => b.classList.toggle('is-hot', !!id && b.dataset.cityBtn === id));
    };
    let touch = false;
    buttons.forEach((b) => {
      const id = b.dataset.cityBtn;
      b.addEventListener('pointerdown', (e) => { touch = e.pointerType !== 'mouse'; });
      b.addEventListener('mouseenter', () => { if (!touch) set(id); });
      b.addEventListener('mouseleave', () => { if (!touch) set(null); });
      b.addEventListener('focus', () => set(id));
      b.addEventListener('blur', () => set(null));
      b.addEventListener('click', () => { if (touch) set(id); }); // a tap elsewhere clears it
    });
    document.addEventListener('click', (e) => { if (touch && !e.target.closest('.world__city')) set(null); });
  }

  /* ---------- Boot ---------- */
  const init = () => {
    hero();
    worldMap();
    mobileNav();
    eventFilters();
    whatsapp();
    imageFallbacks();
    contactForm();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
