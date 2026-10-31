// Regenerates data/worldmap-dots.json from Natural Earth land data.
// Only needed if you change the map grid; the output is committed so the
// live server has no map dependencies. Run: npm run build:map
const fs = require('fs');
const path = require('path');
const topojson = require('topojson-client');
const { W, H, LAT_TOP, LAT_BOTTOM, STEP } = require('../lib/worldmap');

(async () => {
  const { geoContains } = await import('d3-geo');
  const file = path.join(path.dirname(require.resolve('world-atlas/package.json')), 'land-110m.json');
  const topo = JSON.parse(fs.readFileSync(file, 'utf8'));
  const land = topojson.feature(topo, topo.objects.land);
  const dots = [];
  for (let y = STEP / 2; y < H; y += STEP) {
    for (let x = STEP / 2; x < W; x += STEP) {
      const lon = (x / W) * 360 - 180;
      const lat = LAT_TOP - (y / H) * (LAT_TOP - LAT_BOTTOM);
      if (geoContains(land, [lon, lat])) dots.push([+x.toFixed(1), +y.toFixed(1)]);
    }
  }
  const out = path.join(__dirname, '..', 'data', 'worldmap-dots.json');
  fs.writeFileSync(out, JSON.stringify(dots));
  console.log(`Wrote ${dots.length} dots to ${out}`);
})();
