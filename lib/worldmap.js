// Builds a dot-matrix world map (like an exhibition floorplan grid) once at
// startup, from Natural Earth land data. Cities are projected onto the
// same grid so the front-end can animate "flight paths" between them.

const path = require('path');
const fs = require('fs');
const topojson = require('topojson-client');

const W = 1000;
const LAT_TOP = 78;
const LAT_BOTTOM = -56;
const H = Math.round((W * (LAT_TOP - LAT_BOTTOM)) / 360);
const STEP = 9; // spacing between dots in SVG units

const project = (lat, lon) => ({
  x: +(((lon + 180) / 360) * W).toFixed(1),
  y: +(((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H).toFixed(1),
});

async function buildWorldMap(cities) {
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

  return {
    width: W,
    height: H,
    dots,
    cities: cities.map((c) => ({ ...c, ...project(c.lat, c.lon) })),
  };
}

module.exports = { buildWorldMap };
