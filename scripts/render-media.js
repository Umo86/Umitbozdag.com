#!/usr/bin/env node
/* Renders the procedural London scene (public/js/london-scene.js) to image and
   video files with headless Chromium + ffmpeg.

     npm run build:media              # still images for the cards + poster
     node scripts/render-media.js --video   # also a 12 s looping fallback video

   Needs Playwright (npm i -D playwright && npx playwright install chromium)
   and, for --video, ffmpeg on the PATH. The results are committed, so this
   only has to be re-run when the scene or the list below changes. */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is required: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const args = new Set(process.argv.slice(2));
const doVideo = args.has('--video') || args.has('--video-only');
const doStills = !args.has('--video-only');
const only = [...args].find((a) => a.startsWith('--only='));
const onlyName = only ? only.slice(7) : null;

const FPS = Number(process.env.FPS) || 30, SECONDS = Number(process.env.SECONDS) || 12, VW = 1920, VH = 1080;
const VIDEO_OPTS = { camera: 'wide', palette: process.env.PALETTE || 'orange' };
const VIDEO_OUT = process.env.OUT || path.join(PUBLIC, 'video', 'london-skyline.mp4');

// name → size, scene options, time offset into the loop, encoding
const STILLS = [
  { file: 'img/scenes/poster.jpg',      w: 1920, h: 1080, t: 2.4, type: 'jpeg', q: 0.82, opts: { camera: 'wide' } },
  { file: 'img/scenes/wide.webp',       w: 1600, h: 1000, t: 9.0, opts: { camera: 'wide', palette: 'ember' } },
  { file: 'img/scenes/westminster.webp', w: 1000, h: 1250, t: 1.0, opts: { camera: 'westminster' } },
  { file: 'img/scenes/eye.webp',        w: 900,  h: 1200, t: 5.0, opts: { camera: 'eye', palette: 'night' } },
  { file: 'img/scenes/shard.webp',      w: 900,  h: 1200, t: 3.0, opts: { camera: 'shard', palette: 'ember' } },
  { file: 'img/scenes/city.webp',       w: 900,  h: 1200, t: 7.0, opts: { camera: 'city' } },
  { file: 'img/scenes/bridge.webp',     w: 1600, h: 1000, t: 4.0, opts: { camera: 'bridge' } },
  { file: 'img/scenes/canary.webp',     w: 1600, h: 1000, t: 6.0, opts: { camera: 'canary', palette: 'night' } },
  { file: 'img/scenes/hall-1.webp',     w: 1600, h: 1000, t: 2.0, opts: { scene: 'hall', seed: 1 } },
  { file: 'img/scenes/hall-2.webp',     w: 1600, h: 1000, t: 5.0, opts: { scene: 'hall', seed: 2, palette: 'ember' } },
  { file: 'img/scenes/hall-3.webp',     w: 1600, h: 1000, t: 8.0, opts: { scene: 'hall', seed: 3, palette: 'night' } },
  { file: 'img/scenes/hall-4.webp',     w: 1600, h: 1000, t: 3.0, opts: { scene: 'hall', seed: 4, palette: 'mono' } },
  { file: 'img/scenes/log-1.webp',      w: 1200, h: 800,  t: 4.0, opts: { scene: 'hall', seed: 5 } },
  { file: 'img/scenes/log-2.webp',      w: 1200, h: 800,  t: 1.5, opts: { camera: 'city', palette: 'ember' } },
  { file: 'img/scenes/log-3.webp',      w: 1200, h: 800,  t: 6.5, opts: { scene: 'hall', seed: 6, palette: 'ember' } },
  { file: 'img/scenes/log-4.webp',      w: 1200, h: 800,  t: 9.5, opts: { scene: 'hall', seed: 7, palette: 'night' } },
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.setContent('<!doctype html><title>render</title><canvas id="c"></canvas>');
  await page.addScriptTag({ path: path.join(PUBLIC, 'js', 'london-scene.js') });

  const render = (w, h, t, opts, type = 'webp', q = 0.84) =>
    page.evaluate(({ w, h, t, opts, type, q }) => {
      const c = document.getElementById('c');
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const ctx = c.getContext('2d');
      window.LondonScene.draw(ctx, w, h, t, opts);
      return c.toDataURL(type === 'jpeg' ? 'image/jpeg' : type === 'png' ? 'image/png' : 'image/webp', q);
    }, { w, h, t, opts, type, q });
  const toBuffer = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

  if (doStills) {
    for (const s of STILLS) {
      if (onlyName && !s.file.includes(onlyName)) continue;
      const out = path.join(PUBLIC, s.file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, toBuffer(await render(s.w, s.h, s.t, s.opts, s.type, s.q)));
      console.log(`wrote ${s.file} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
    }
  }

  if (doVideo) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'london-frames-'));
    const total = FPS * SECONDS;
    for (let i = 0; i < total; i++) {
      const png = await render(VW, VH, i / FPS, VIDEO_OPTS, 'png');
      fs.writeFileSync(path.join(tmp, `${String(i).padStart(4, '0')}.png`), toBuffer(png));
      if (i % 30 === 0) console.log(`frame ${i}/${total}`);
    }
    const out = VIDEO_OUT;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const codec = out.endsWith('.webm')
      ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-pix_fmt', 'yuv420p']
      : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, '%04d.png'), ...codec, '-an', out], { stdio: 'inherit' });
    if (ff.status !== 0) throw new Error('ffmpeg failed');
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`wrote ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
  }

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
