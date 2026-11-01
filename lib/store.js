'use strict';
// Editable site content. The seed is data/profile.js; once something is saved from the admin
// panel the live copy lives in data/content.json (or $DATA_DIR/content.json) and wins.
// Hosts with a read-only app folder (Vercel) fall back to /tmp, which only lasts for the life
// of the instance — the admin panel shows a warning in that case.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const onVercel = !!process.env.VERCEL;
const DATA_DIR = process.env.DATA_DIR || (onVercel ? '/tmp/ub-data' : path.join(ROOT, 'data'));
const UPLOAD_DIR = process.env.UPLOAD_DIR || (onVercel ? path.join(DATA_DIR, 'uploads') : path.join(ROOT, 'public', 'uploads'));
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const SEED_FILE = path.join(ROOT, 'data', 'profile.js');

let content = null;
let version = 0;
let loadedFrom = 'seed';
let lastSaved = null;
let lastError = null;

function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); return true; } catch { return false; } }
function canWrite(dir) {
  try { ensureDir(dir); const f = path.join(dir, '.write-test'); fs.writeFileSync(f, 'ok'); fs.unlinkSync(f); return true; } catch { return false; }
}
function seed() {
  delete require.cache[require.resolve(SEED_FILE)];
  return JSON.parse(JSON.stringify(require(SEED_FILE)));
}
function load() {
  try { content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')); loadedFrom = CONTENT_FILE; }
  catch { content = seed(); loadedFrom = 'data/profile.js (seed)'; }
  version++;
  return content;
}
function get() { if (!content) load(); return content; }
function writeAtomic(file, text) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
function save(next) {
  try { writeAtomic(CONTENT_FILE, JSON.stringify(next, null, 2)); lastSaved = new Date().toISOString(); lastError = null; loadedFrom = CONTENT_FILE; }
  catch (e) { lastError = e.message; return status(); } // nothing changes if the disk refuses
  content = next;
  version++;
  return status();
}
function reset() {
  content = seed();
  version++;
  try { fs.unlinkSync(CONTENT_FILE); } catch { /* nothing saved yet */ }
  loadedFrom = 'data/profile.js (seed)';
  return content;
}
function status() {
  return {
    dataDir: DATA_DIR, uploadDir: UPLOAD_DIR, contentFile: CONTENT_FILE, loadedFrom, version, lastSaved, lastError,
    writable: canWrite(DATA_DIR), uploadsWritable: canWrite(UPLOAD_DIR),
    temporary: onVercel && !process.env.DATA_DIR, // /tmp on Vercel: edits vanish when the instance is recycled
  };
}

module.exports = { get, load, save, reset, seed, status, version: () => version, ensureDir, DATA_DIR, UPLOAD_DIR, CONTENT_FILE };
