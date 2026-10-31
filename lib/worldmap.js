// Dot-matrix world map (like an exhibition floorplan grid). The land dots are
// pre-generated into data/worldmap-dots.json by scripts/build-map.js, so the
// server needs no map libraries at runtime. Cities are projected onto the
// same grid so the front-end can animate "flight paths" between them.

const W = 1000;
const LAT_TOP = 78;
const LAT_BOTTOM = -56;
const H = Math.round((W * (LAT_TOP - LAT_BOTTOM)) / 360);
const STEP = 9; // spacing between dots in SVG units

const project = (lat, lon) => ({
  x: +(((lon + 180) / 360) * W).toFixed(1),
  y: +(((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H).toFixed(1),
});

function buildWorldMap(cities) {
  const dots = require('../data/worldmap-dots.json');
  return {
    width: W,
    height: H,
    dots,
    cities: cities.map((c) => ({ ...c, ...project(c.lat, c.lon) })),
  };
}

module.exports = { buildWorldMap, project, W, H, LAT_TOP, LAT_BOTTOM, STEP };
