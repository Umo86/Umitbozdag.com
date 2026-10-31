/* ==========================================================================
   Umit Bozdag — Exhibitions & Events
   Front-end behaviour. Vanilla JS, no dependencies.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const body = document.body;

  /* ---------- Split text (hero name) ---------- */
  function splitText() {
    $$('[data-split]').forEach((el) => {
      const text = el.textContent.trim();
      el.textContent = '';
      el.setAttribute('aria-hidden', 'true');
      const line = document.createElement('span');
      line.className = 'split-line';
      Array.from(text).forEach((ch, i) => {
        const s = document.createElement('span');
        s.className = 'ch';
        s.style.setProperty('--ci', i);
        s.textContent = ch === ' ' ? ' ' : ch;
        line.appendChild(s);
      });
      el.appendChild(line);
    });
  }

  /* ---------- Preloader: doors open ---------- */
  function preloader() {
    const doors = $('.doors');
    const count = $('.doors__count');

    const open = () => {
      if (doors) doors.classList.add('is-open');
      body.classList.remove('is-loading');
      // Next frame so the split-letter transition starts after the doors begin moving.
      requestAnimationFrame(() => requestAnimationFrame(() => body.classList.add('is-ready')));
      window.setTimeout(() => doors && doors.classList.add('is-gone'), reduced ? 50 : 1250);
    };

    if (!doors || reduced) { open(); return; }

    let n = 3;
    if (count) count.textContent = String(n);
    const tick = () => {
      n -= 1;
      if (n >= 1) {
        if (count) count.textContent = String(n);
        window.setTimeout(tick, 360);
      } else {
        open();
      }
    };
    window.setTimeout(tick, 420);
    // Safety net: never leave the visitor stuck behind the doors.
    window.setTimeout(() => { if (body.classList.contains('is-loading')) open(); }, 4000);
  }

  /* ---------- Reveal on scroll + counters ---------- */
  function formatNumber(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function countUp(el) {
    const target = parseFloat(el.dataset.count) || 0;
    if (reduced) { el.textContent = formatNumber(target); return; }
    const dur = 1600;
    const start = performance.now();
    const step = (now) => {
      const t = clamp((now - start) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatNumber(target * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function reveals() {
    const targets = $$('.reveal, .job, .map');
    const counters = $$('[data-count]');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      counters.forEach(countUp);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach((el) => io.observe(el));

    const cio = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        cio.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    counters.forEach((el) => cio.observe(el));
  }

  /* ---------- Scroll: progress bar, nav state, timeline fill ---------- */
  function scrollEffects() {
    const progress = $('.scroll-progress');
    const nav = $('.nav');
    const timeline = $('.timeline');
    const fill = $('.timeline__fill');
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY || window.pageYOffset;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progress) progress.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;
      if (nav) nav.classList.toggle('is-scrolled', y > 40);
      if (timeline && fill) {
        const r = timeline.getBoundingClientRect();
        const anchor = window.innerHeight * 0.62; // line "draws" as the rail passes this point
        const p = clamp((anchor - r.top) / r.height, 0, 1);
        fill.style.transform = `scaleY(${p})`;
      }
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ---------- Custom cursor ---------- */
  function cursor() {
    const el = $('.cursor');
    if (!el || isTouch) { if (el) el.remove(); return; }
    let tx = -100, ty = -100, x = tx, y = ty, raf = null, active = false;

    const loop = () => {
      x = lerp(x, tx, 0.18);
      y = lerp(y, ty, 0.18);
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      if (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1) raf = requestAnimationFrame(loop);
      else raf = null;
    };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if (!active) { active = true; x = tx; y = ty; el.classList.add('is-active'); }
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener('mouseleave', () => { active = false; el.classList.remove('is-active'); });
    document.addEventListener('mouseenter', () => { if (tx > 0) { active = true; el.classList.add('is-active'); } });

    const HOVER = 'a, button, [data-tilt], input, textarea, select, label';
    document.addEventListener('pointerover', (e) => {
      if (e.target.closest && e.target.closest(HOVER)) el.classList.add('is-hover');
    });
    document.addEventListener('pointerout', (e) => {
      if (e.target.closest && e.target.closest(HOVER)) {
        const to = e.relatedTarget;
        if (!to || !(to.closest && to.closest(HOVER))) el.classList.remove('is-hover');
      }
    });
  }

  /* ---------- Magnetic buttons ---------- */
  function magnetic() {
    if (isTouch || reduced) return;
    $$('.magnetic').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.setProperty('--bx', `${(dx * 0.28).toFixed(1)}px`);
        btn.style.setProperty('--by', `${(dy * 0.28).toFixed(1)}px`);
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--bx', '0px');
        btn.style.setProperty('--by', '0px');
      });
    });
  }

  /* ---------- Tilt (stands + badge) ---------- */
  function tilt() {
    if (isTouch || reduced) return;
    const badge = $('.badge');
    const hero = $('.hero');

    $$('[data-tilt]').forEach((el) => {
      if (el === badge) return;
      const max = parseFloat(el.dataset.tilt) || 8;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', `${((0.5 - py) * max).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((px - 0.5) * max).toFixed(2)}deg`);
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });

    if (badge && hero) {
      const reset = () => {
        badge.style.setProperty('--rx', '0deg');
        badge.style.setProperty('--ry', '0deg');
        badge.style.setProperty('--mx', '50%');
        badge.style.setProperty('--my', '50%');
      };
      hero.addEventListener('pointermove', (e) => {
        const r = badge.getBoundingClientRect();
        const h = hero.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const nx = clamp((e.clientX - cx) / (h.width / 2), -1, 1);
        const ny = clamp((e.clientY - cy) / (h.height / 2), -1, 1);
        badge.style.setProperty('--ry', `${(nx * 16).toFixed(2)}deg`);
        badge.style.setProperty('--rx', `${(-ny * 12).toFixed(2)}deg`);
        badge.style.setProperty('--mx', `${clamp(((e.clientX - r.left) / r.width) * 100, -30, 130).toFixed(1)}%`);
        badge.style.setProperty('--my', `${clamp(((e.clientY - r.top) / r.height) * 100, -30, 130).toFixed(1)}%`);
      });
      hero.addEventListener('pointerleave', reset);
    }
  }

  /* ---------- Spotlight (mouse-follow glow on cards) ---------- */
  function spotlight() {
    if (isTouch) return;
    $$('.spotlight').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--sx', `${(e.clientX - r.left).toFixed(0)}px`);
        el.style.setProperty('--sy', `${(e.clientY - r.top).toFixed(0)}px`);
      });
    });
  }

  /* ---------- Hero canvas: visitor flow on the show floor ---------- */
  function heroCanvas() {
    const canvas = $('.hero__canvas');
    const hero = $('.hero');
    if (!canvas || !hero) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const GRID = 80;
    const COLORS = [
      { c: '238,240,245', w: 0.72 }, // visitors (white-ish)
      { c: '255,106,43', w: 0.18 },  // signage orange
      { c: '82,227,255', w: 0.10 },  // wayfinding cyan
    ];
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    let w = 0, h = 0, dpr = 1, particles = [], raf = null, last = 0;
    let running = false, visible = true;

    const pickColor = () => {
      let r = Math.random();
      for (const k of COLORS) { r -= k.w; if (r <= 0) return k.c; }
      return COLORS[0].c;
    };

    const spawn = (anywhere) => {
      const cols = Math.ceil(w / GRID) + 1;
      const rows = Math.ceil(h / GRID) + 1;
      const horizontal = Math.random() < 0.5;
      const dir = DIRS[horizontal ? (Math.random() < 0.5 ? 0 : 1) : (Math.random() < 0.5 ? 2 : 3)];
      let x, y;
      if (horizontal) {
        y = Math.floor(Math.random() * rows) * GRID;
        x = anywhere ? Math.random() * w : (dir[0] > 0 ? -GRID : w + GRID);
      } else {
        x = Math.floor(Math.random() * cols) * GRID;
        y = anywhere ? Math.random() * h : (dir[1] > 0 ? -GRID : h + GRID);
      }
      const color = pickColor();
      const special = color !== COLORS[0].c;
      return {
        x, y, dx: dir[0], dy: dir[1],
        speed: 34 + Math.random() * 70,
        size: special ? 1.9 + Math.random() * 1.1 : 1.2 + Math.random() * 1.2,
        color,
        alpha: special ? 0.95 : 0.45 + Math.random() * 0.4,
        sinceTurn: 0,
      };
    };

    const resize = () => {
      const r = hero.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const n = clamp(Math.round((w * h) / 22000), 18, 90);
      particles = Array.from({ length: n }, () => spawn(true));
    };

    const stepParticle = (p, dt) => {
      const dist = p.speed * dt;
      const before = p.dx ? p.x : p.y;
      p.x += p.dx * dist;
      p.y += p.dy * dist;
      p.sinceTurn += dist;
      const after = p.dx ? p.x : p.y;
      // Did we cross an intersection?
      const from = Math.floor(before / GRID), to = Math.floor(after / GRID);
      if (from !== to && p.sinceTurn > GRID * 0.9 && Math.random() < 0.42) {
        const node = (p.dx > 0 || p.dy > 0 ? to : from) * GRID;
        if (p.dx) { p.x = node; } else { p.y = node; }
        const turnRight = Math.random() < 0.5;
        const nd = p.dx ? [0, turnRight ? 1 : -1] : [turnRight ? 1 : -1, 0];
        p.dx = nd[0]; p.dy = nd[1];
        p.sinceTurn = 0;
      }
      const m = GRID * 1.5;
      if (p.x < -m || p.x > w + m || p.y < -m || p.y > h + m) Object.assign(p, spawn(false));
    };

    const draw = (now) => {
      raf = null;
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;

      // Fade previous frame -> trails
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      for (const p of particles) {
        stepParticle(p, dt);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        if (p.color !== COLORS[0].c) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(${p.color},0.12)`;
          ctx.arc(p.x, p.y, p.size * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const start = () => {
      if (reduced || running || !visible || document.hidden) return;
      running = true;
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const stop = () => { running = false; if (raf) { cancelAnimationFrame(raf); raf = null; } };

    let resizeT;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeT);
      resizeT = window.setTimeout(() => { resize(); if (reduced) drawStatic(); }, 120);
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        visible ? start() : stop();
      }, { threshold: 0.02 }).observe(hero);
    }

    resize();
    if (reduced) drawStatic(); else start();
  }

  /* ---------- Mobile nav ---------- */
  function mobileNav() {
    const nav = $('.nav');
    const burger = $('.nav__burger');
    if (!nav || !burger) return;
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    burger.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    $$('.nav__links a, .nav .btn').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    window.matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ---------- Contact form ---------- */
  function contactForm() {
    const form = $('.regform');
    if (!form) return;
    const status = $('.regform__status', form);
    const button = $('button[type="submit"]', form);
    const label = $('.btn__label', button) || button;
    const printedName = $('.printed__name', form);
    const defaultLabel = label.textContent;

    const setStatus = (msg, ok = false) => {
      if (!status) return;
      status.textContent = msg;
      status.style.color = ok ? '#3dff9a' : '';
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const name = (data.name || '').trim();
      const email = (data.email || '').trim();
      const message = (data.message || '').trim();

      if (!name || !/^\S+@\S+\.\S+$/.test(email) || message.length < 5) {
        setStatus('Please add your name, a valid email and a short message.');
        const bad = !name ? 'name' : !/^\S+@\S+\.\S+$/.test(email) ? 'email' : 'message';
        const field = form.elements[bad];
        if (field) field.focus();
        return;
      }

      setStatus('');
      button.disabled = true;
      label.textContent = 'Printing…';
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        let json = {};
        try { json = await res.json(); } catch { /* non-JSON error page */ }
        if (json.fallback === 'mailto' && json.to) {
          // Server can't deliver it: hand the message to the visitor's own email app.
          const subject = encodeURIComponent(`Website enquiry from ${name}`);
          const bodyText = encodeURIComponent(`${message}\n\n${name}${data.company ? `\n${data.company}` : ''}`);
          window.location.href = `mailto:${json.to}?subject=${subject}&body=${bodyText}`;
          setStatus('Opening your email app so you can send this directly…', true);
          return;
        }
        if (!res.ok || !json.ok) {
          throw new Error(json.error || `Something went wrong (${res.status}). Please email me directly.`);
        }
        if (printedName) printedName.textContent = `Thanks, ${name.split(/\s+/)[0]}!`;
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

    // Let the visitor dismiss the printed badge and send another message.
    const printed = $('.printed', form);
    if (printed) printed.addEventListener('click', () => { form.classList.remove('is-sent'); setStatus(''); });
  }

  /* ---------- Boot ---------- */
  const init = () => {
    splitText();
    reveals();
    scrollEffects();
    cursor();
    magnetic();
    tilt();
    spotlight();
    heroCanvas();
    mobileNav();
    contactForm();
    preloader();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
