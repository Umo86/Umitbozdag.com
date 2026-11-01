#!/usr/bin/env node
/* Downloads the header film into public/video/london.mp4 so it is served from
   your own host instead of the Pexels CDN. The server picks the file up
   automatically on the next start.

     npm run fetch:video            # 1920×1080 (default)
     npm run fetch:video -- desktop # 1280×720 @ 60fps (smaller)
     npm run fetch:video -- mobile  # 960×540
     npm run fetch:video -- https://example.com/other-clip.mp4 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const profile = require('../data/profile');

const sources = (profile.heroVideo && profile.heroVideo.sources) || {};
const arg = process.argv[2] || 'large';
const url = /^https?:/.test(arg) ? arg : sources[arg];
if (!url) {
  console.error(`Unknown source "${arg}". Use one of: ${Object.keys(sources).join(', ')} or a URL.`);
  process.exit(1);
}
const dest = path.join(__dirname, '..', 'public', 'video', 'london.mp4');
const tmp = dest + '.part';
fs.mkdirSync(path.dirname(dest), { recursive: true });

function download(u, hops = 0) {
  https.get(u, { headers: { 'User-Agent': 'umitbozdag.com fetch-video' } }, (res) => {
    if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && hops < 5) {
      return download(new URL(res.headers.location, u).href, hops + 1);
    }
    if (res.statusCode !== 200) { console.error(`HTTP ${res.statusCode} for ${u}`); process.exit(1); }
    const total = Number(res.headers['content-length']) || 0;
    let got = 0;
    const out = fs.createWriteStream(tmp);
    res.on('data', (c) => { got += c.length; if (total) process.stdout.write(`\r${((got / total) * 100).toFixed(0)}%`); });
    res.pipe(out);
    out.on('finish', () => {
      fs.renameSync(tmp, dest);
      console.log(`\nSaved ${path.relative(process.cwd(), dest)} (${(got / 1048576).toFixed(1)} MB). Restart the server and it will be used automatically.`);
    });
  }).on('error', (err) => { console.error(err.message); process.exit(1); });
}
console.log(`Downloading ${url}`);
download(url);
