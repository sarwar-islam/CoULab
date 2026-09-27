/**
 * সিম্পল JSON ফাইল ডেটাবেজ (কোনো এক্সটার্নাল ডিপেন্ডেন্সি নেই)
 * - users, sessions, applications, cases, complaints, chatlogs টেবিল
 * - প্রতিটি রাইট-এ অ্যাটমিক write (tmp + rename)
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function emptyDb() {
  return {
    users: [],          // { id, name, phone, email, nid, password(hash), role, createdAt }
    sessions: {},       // token -> { userId, createdAt, expiresAt }
    applications: [],   // আবেদন (applicant ফর্ম থেকে)
    complaints: [],     // অভিযোগ
    chatlogs: [],       // AI সহায়ক কথোপকথন লগ
    otps: {},           // phone -> { code, expiresAt }
    counters: { application: 4417, complaint: 100, user: 1, case: 900 }
  };
}

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    db = emptyDb();
    save();
  }
  return db;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_PATH);
}

// খুব সাধারণ পাসওয়ার্ড হ্যাশ (sha256 + salt) — প্রোডাকশনে bcrypt ব্যবহার করুন
function hashPassword(pw) {
  // eslint-disable-next-line no-undef
  return require('crypto').createHash('sha256').update('dlas-salt::' + pw).digest('hex');
}

function nextId(kind, prefix, year) {
  const d = load();
  d.counters[kind] = (d.counters[kind] || 1000) + 1;
  return `${prefix}-${year || 2026}-${String(d.counters[kind]).padStart(5, '0')}`;
}

module.exports = { load, save, hashPassword, nextId, DB_PATH };
