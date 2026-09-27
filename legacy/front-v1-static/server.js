/**
 * ডিজিটাল আইনগত সহায়তা পোর্টাল — ব্যাকএন্ড সার্ভার
 * Zero-dependency Node.js HTTP server + JSON DB
 *
 * API:
 *   GET  /api/bootstrap                  → seed data (topics, articles, offices, news…)
 *   POST /api/register                   → অ্যাকাউন্ট তৈরি
 *   POST /api/login                      → সেশন টোকেন (কুকি)
 *   GET  /api/me                         → বর্তমান ইউজার
 *   POST /api/logout
 *   POST /api/applications               → নতুন আবেদন (লগইন ছাড়াও)
 *   GET  /api/applications/mine          → আমার আবেদনগুলো
 *   POST /api/track                      → আবেদন ট্র্যাক (আইডি + ফোনের শেষ ৪ ডিজিট)
 *   POST /api/eligibility                → যোগ্যতা যাচাই (income check)
 *   POST /api/guide                      → গাইড উইজার্ডের ফলাফল
 *   POST /api/chat                       → AI সহায়ক (KB-based)
 *   POST /api/complaints                 → অভিযোগ জমা
 *   GET  /api/offices?q=                 → অফিস খোঁজা
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('./server/db');
const seed = require('./server/seed');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- helpers ----------
function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function currentUser(req) {
  const d = db.load();
  const token = parseCookies(req).session;
  if (!token) return null;
  const sess = d.sessions[token];
  if (!sess || sess.expiresAt < Date.now()) return null;
  return d.users.find((u) => u.id === sess.userId) || null;
}
function publicUser(u) { return u ? { id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, createdAt: u.createdAt } : null; }

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function serveStatic(res, urlPath) {
  let p = urlPath.split('?')[0].split('#')[0];
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(p).replace(/^([.][.][/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA fallback → index.html
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, idx) => {
        if (e2) return send(res, 404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(idx);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ---------- API handlers ----------
const api = {};

api.bootstrap = () => ({
  categories: seed.CATEGORIES,
  sections: seed.SECTIONS,
  articles: seed.ARTICLES.map(({ body, ...rest }) => ({ ...rest, bodyLen: body.length })),
  offices: seed.OFFICES,
  divisions: seed.DIVISIONS,
  news: seed.NEWS,
  caseTypes: seed.CASE_TYPES,
  guide: seed.GUIDE_TREE,
  eligibility: seed.ELIGIBILITY,
  stages: seed.APPLICATION_STAGES,
  mediationDistricts: seed.MANDATORY_MEDIATION_DISTRICTS
});

api.article = (q) => {
  const a = seed.ARTICLES.find((x) => x.id === q.id);
  return a || { error: 'not found' };
};

// টপিকের সেকশন ট্রি + আর্টিকেল/ফরম কনটেন্ট
api.sections = (q) => ({ sections: seed.SECTIONS[q.topic] || [] });

api.form = (q) => seed.FORMS[q.id] || { error: 'not found' };

api.newsitem = (q) => seed.NEWS.find((n) => n.id === q.id) || { error: 'not found' };

api.register = (b, req, res) => {
  const d = db.load();
  if (!b.name || !b.phone || !b.password) return { error: 'নাম, ফোন ও পাসওয়ার্ড দিন' };
  if (d.users.some((u) => u.phone === b.phone)) return { error: 'এই ফোন নম্বরে অ্যাকাউন্ট আছে — লগইন করুন' };
  const user = {
    id: 'u' + d.counters.user++,
    name: b.name, phone: b.phone, email: b.email || '', nid: b.nid || '',
    password: db.hashPassword(b.password), role: b.role || 'applicant',
    createdAt: new Date().toISOString()
  };
  d.users.push(user);
  const token = crypto.randomBytes(24).toString('hex');
  d.sessions[token] = { userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + 7 * 864e5 };
  db.save();
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
  return { ok: true, user: publicUser(user) };
};

api.login = (b, req, res) => {
  const d = db.load();
  const u = d.users.find((x) => x.phone === b.phone && x.password === db.hashPassword(b.password || ''));
  if (!u) return { error: 'ফোন বা পাসওয়ার্ড ভুল' };
  const token = crypto.randomBytes(24).toString('hex');
  d.sessions[token] = { userId: u.id, createdAt: Date.now(), expiresAt: Date.now() + 7 * 864e5 };
  db.save();
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
  return { ok: true, user: publicUser(u) };
};

api.logout = (b, req, res) => {
  const d = db.load();
  const token = parseCookies(req).session;
  if (token) { delete d.sessions[token]; db.save(); }
  res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0');
  return { ok: true };
};

api.me = (b, req) => ({ user: publicUser(currentUser(req)) });

api.applications = (b, req) => {
  const user = currentUser(req);
  if (!user) return { error: 'লগইন করুন', needAuth: true };
  const d = db.load();
  return { applications: d.applications.filter((a) => a.userId === user.id) };
};

// ড্যাশবোর্ডের জন্য নিজের একটি আবেদনের পূর্ণ স্টেটাস (শুধু মালিক দেখতে পারে)
api.myapp = (q, req) => {
  const user = currentUser(req);
  if (!user) return { error: 'লগইন করুন', needAuth: true };
  const d = db.load();
  const app = d.applications.find((a) => a.appId === q.id);
  if (!app || app.userId !== user.id) return { error: 'এই আবেদনটি আপনার অ্যাকাউন্টে নেই' };
  return {
    appId: app.appId,
    name: app.name, phone: app.phone, district: app.district,
    caseType: app.caseType, purpose: app.purpose, emergency: app.emergency,
    office: app.office, problem: app.problem,
    stage: app.stage,
    stageLabel: seed.APPLICATION_STAGES[app.stage].label,
    stages: seed.APPLICATION_STAGES.map((s, i) => ({ ...s, done: i <= app.stage, current: i === app.stage })),
    history: app.history,
    audit: (app.audit || []).slice(-12),
    provenance: app.provenance || null,
    submitted: app.createdAt,
    note: 'আপডেট হলে এসএমএসে জানানো হবে। বিস্তারিত জানতে অফিসে যোগাযোগ করুন বা ১৬৬৯৯-এ কল করুন।'
  };
};

api.applications_POST = (b, req) => {
  const d = db.load();
  const user = currentUser(req);
  if (!b.name || !b.phone || !b.problem) return { error: 'নাম, ফোন ও সমস্যার বিবরণ দিন' };
  const appId = db.nextId('application', 'DLAS-NET');
  const now = new Date().toISOString();
  const isRep = !!b.representation; // A2: প্রতিনিধির মাধ্যমে জমা
  const isUdc = !!b.assistedBy; // B4: UDC সহায়তায় জমা
  const app = {
    appId,
    userId: user ? user.id : null,
    name: b.name, phone: b.phone, nid: b.nid || '',
    district: b.district || '', caseType: b.caseType || '',
    purpose: b.purpose || 'new', emergency: !!b.emergency,
    income: b.income || null, deps: b.deps || null,
    problem: b.problem, office: b.office || null,
    sensitive: !!b.sensitive, // A3: স্পর্শকাতর রেকর্ড — রোল-সীমিত
    stage: b.emergency ? 1 : 0,
    history: [{ at: now, label: seed.APPLICATION_STAGES[b.emergency ? 1 : 0].label }],
    tasks: [], documents: [],
    // A1/A2: প্রতিনিধি তথ্য + স্কোপ রেকর্ডেই থাকে
    representation: isRep ? { repName: b.representation.repName || '', repPhone: b.representation.repPhone || '', relation: b.representation.relation || '', scope: b.representation.scope || 'intake-only', consentRecorded: true, at: now } : null,
    // A1: সেফ-কন্টাক্ট জমার সময়েই দেওয়া যায়
    safeContact: b.safeContact ? { safeNumber: b.safeContact.safeNumber || '', unsafeNumbers: b.safeContact.unsafeNumbers || [], window: b.safeContact.window || '', neutralWording: true, at: now } : null,
    failedContacts: [], // A5: যোগাযোগ ব্যর্থতার লগ
    // Golden Thread: প্রতিটি রেকর্ডে audit[] + ফিল্ড-প্রোভেনেন্স
    audit: [auditRec(user ? { id: user.id, name: user.name, role: user.role } : { role: isUdc ? 'udc' : (isRep ? 'representative' : 'applicant') }, 'application-created', isUdc ? `UDC সহায়তায় জমা (${b.assistedBy})` : (isRep ? `প্রতিনিধি ${b.representation.repName} জমা দিয়েছেন` : 'সরাসরি জমা'), isUdc ? PROVENANCE.INTERMEDIARY : (isRep ? PROVENANCE.REP : PROVENANCE.APPLICANT))],
    provenance: { name: isUdc || isRep ? (isUdc ? PROVENANCE.INTERMEDIARY : PROVENANCE.REP) : PROVENANCE.APPLICANT, phone: isUdc || isRep ? (isUdc ? PROVENANCE.INTERMEDIARY : PROVENANCE.REP) : PROVENANCE.APPLICANT, nid: PROVENANCE.APPLICANT, problem: isUdc ? PROVENANCE.INTERMEDIARY : (isRep ? PROVENANCE.REP : PROVENANCE.APPLICANT), income: PROVENANCE.APPLICANT },
    channel: b.channel || (user ? 'web' : 'assisted'),
    createdAt: now
  };
  // T1: আইনজীবী পরিবর্তনের অনুরোধ — DLAO কিউতে টাস্ক হিসেবে যায় (মানুষ রিভিউ করেন)
  if (b.purpose === 'change-lawyer') {
    app.tasks.push({ id: 'T' + Date.now().toString(36), type: 'lawyer-change-request', owner: 'dlao', status: 'open', note: (b.lawyerNote || 'আইনজীবী পরিবর্তনের অনুরোধ'), createdAt: now });
    app.audit.push(auditRec({ role: 'applicant' }, 'lawyer-change-requested', b.lawyerNote || '', PROVENANCE.APPLICANT));
  }
  d.applications.push(app);
  db.save();
  return {
    ok: true, appId,
    freeServiceNotice: 'এই সেবা সম্পূর্ণ বিনামূল্যে — আবেদন ফি, আইনজীবীর ফি বা আদালত ফি কিছুই দিতে হবে না (B4)। কেউ টাকা চাইলে ১৬৬৯৯-এ জানান।',
    nextSteps: [
      'একজন কর্মকর্তা যাচাই করবেন আপনি বিনামূল্যে আইনি সহায়তার যোগ্য কিনা।',
      'আবেদন গৃহীত হলে এসএমএসে কেস আইডি পাবেন।',
      'এই আইডি দিয়েই "আবেদন ট্র্যাক করুন" পেজে অবস্থা দেখতে পারবেন।'
    ]
  };
};

api.track = (b) => {
  const d = db.load();
  const id = (b.appId || '').trim().toUpperCase();
  const last4 = (b.last4 || '').trim();
  const app = d.applications.find((a) => a.appId.toUpperCase() === id);
  if (!app) return { error: 'এই নম্বরে কোনো আবেদন পাওয়া যায়নি। আইডি যাচাই করুন — যেমন DLAS-NET-2026-04417' };
  const phoneDigits = (app.phone || '').replace(/\D/g, '');
  const nidDigits = (app.nid || '').replace(/\D/g, '');
  if (!last4 || (!phoneDigits.endsWith(last4) && !nidDigits.endsWith(last4))) {
    return { error: 'ফোন নম্বর বা এনআইডির শেষ ৪ ডিজিট মিলেনি' };
  }
  const nextLabel = app.stage < seed.APPLICATION_STAGES.length - 1 ? seed.APPLICATION_STAGES[app.stage + 1].label : null;
  const headsUp = [];
  if (app.lawyer && app.lawyer.name) headsUp.push(`আইনজীবী: ${app.lawyer.name}${app.lawyerOverdue ? ' — ⚠️ আপডেট বাকি, অফিস ফলো-আপ করছে' : ''}`);
  if (app.hearings && app.hearings.length) headsUp.push(`পরবর্তী শুনানি: ${app.hearings[app.hearings.length - 1].date}`);
  if (app.mediation && app.mediation.date && app.mediation.status === 'scheduled') headsUp.push(`মধ্যস্থতা: ${app.mediation.date}${['remote', 'hybrid'].includes(app.mediation.mode) ? ' (রিমোটে অংশ নেওয়া যাবে)' : ''}`);
  if ((app.failedContacts || []).length) headsUp.push(`⚠️ ${app.failedContacts.length}টি কলে যোগাযোগ হয়নি — ভিন্ন নম্বর/সময় অফিসে জানান`);
  return {
    appId: app.appId,
    stage: app.stage,
    stageLabel: seed.APPLICATION_STAGES[app.stage].label,
    nextStep: nextLabel,
    headsUp,
    stages: seed.APPLICATION_STAGES.map((s, i) => ({ ...s, done: i <= app.stage, current: i === app.stage })),
    office: app.office, caseType: app.caseType, emergency: app.emergency,
    submitted: app.createdAt, history: app.history,
    note: 'সম্পূর্ণ বিবরণের জন্য নিকটবর্তী লিগ্যাল এইড অফিসে যোগাযোগ করুন।'
  };
};

api.eligibility = (b) => {
  const income = Number(b.income || 0);
  const r = { level: '', title: '', sub: '' };
  if (!income) { r.level = 'none'; r.title = 'আয়ের অঙ্ক লিখুন'; r.sub = 'নিশ্চিত না হলে খালি রেখে সরাসরি আবেদন করুন — কর্মকর্তা হিসাব করতে সাহায্য করবেন।'; }
  else if (income <= seed.ELIGIBILITY.incomeCeilLower) { r.level = 'likely'; r.title = 'আপনি সম্ভবত যোগ্য'; r.sub = 'আপনার আয় আদি আদালতের আয়সীমার মধ্যে। আবেদন করুন।'; }
  else if (income <= seed.ELIGIBILITY.incomeCeilSC) { r.level = 'near'; r.title = 'আয়সীমার কাছাকাছি — কর্মকর্তা যাচাই করবেন'; r.sub = 'আদি আদালতের সীমার উপরে কিন্তু সুপ্রীম কোর্টের সীমার মধ্যে। তবুও আবেদন করুন।'; }
  else { r.level = 'over'; r.title = 'আয়সীমার উপরে — তবুও আবেদন করা যাবে'; r.sub = 'আয় একমাত্র মাপকাঠি নয় — অগ্রাধিকার গোষ্ঠী ও কষ্টও বিবেচনা হয়।'; }
  r.alwaysEligible = seed.ELIGIBILITY.alwaysEligible;
  r.neverBlocks = true;
  return r;
};

api.guide = (b) => {
  const topic = seed.CATEGORIES.find((c) => c.id === b.topic);
  const arts = seed.ARTICLES.filter((a) => a.topic === b.topic).map(({ body, ...r }) => r);
  const result = {
    topic: topic || null,
    articles: arts,
    need: b.need || 'advice',
    income: b.income || null
  };
  if (result.income != null) {
    const e = api.eligibility({ income: result.income });
    result.eligibility = e;
  }
  result.next = result.need === 'urgent'
    ? 'জরুরি সহায়তার জন্য আবেদন ফরমে "জরুরি সহায়তা" চেক করুন — ২৪ ঘণ্টায় পর্যালোচনা হয়। আশু বিপদে ৯৯৯ কল করুন।'
    : result.need === 'lawyer'
      ? 'আইনজীবী পেতে আবেদন ফরমে উদ্দেশ্য "আইনজীবী ও আদালত সহায়তা" বেছে নিন।'
      : result.need === 'mediation'
        ? 'মধ্যস্থতায় আবেদন করতে ফরমে উদ্দেশ্য "মধ্যস্থতা" বেছে নিন — ৬০ দিনে নিষ্পত্তি।'
        : 'আর্টিকেলগুলো পড়ুন; আরও প্রশ্ন থাকলে নিচের ডানদিকে AI সহায়ক বা ১৬৬৯৯-এ কল করুন।';
  return result;
};

const BN_DIGITS = { '০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9' };
const normText = (s) => String(s || '')
  .replace(/[০-৯]/g, (d) => BN_DIGITS[d] || d)
  .toLowerCase()
  .replace(/[?!.,;:"'()\u0964\u0965]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
// বাংলিশ → বাংলা ম্যাপিং (ধ্বনিগত)
const BANGLISH_MAP = [
  ['taka poisa|tk|poisa', 'টাকা'], ['amake|amar', 'আমার'], ['kivabe|kobe|kothay', 'কীভাবে'],
  ['abedon|application|apply', 'আবেদন'], ['jomi|jomin|land', 'জমি'], ['talak|talaq|divorce', 'তালাক'],
  ['beton|wages|salary', 'বেতন'], ['bikash|bkash|nogod|nagad|rocket', 'বিকাশ'], ['biye|marriage', 'বিয়ে'],
  ['sontan|child|chhele|meye', 'সন্তান'], ['heyfat|hefazot|custody', 'হেফাজত'], ['jail|prison', 'জেল'],
  ['bail|jamin', 'জামিন'], ['police|thana', 'থানা'], ['dorkar|lage|chae', 'দরকার'], ['free|khroc|khoroch|fee', 'ফ্রি'],
  ['chele', 'সন্তান'], ['meye', 'সন্তান'], ['dhenmohor|denmohor|mohrana', 'দেনমোহর'],
  ['gorosthan|baste|ucced|ucceden|evict', 'উচ্ছেদ'], ['namjari|mutation', 'নামজারি'], ['dokhol|dakhal|occupation', 'দখল'],
  ['aparadh|crime|case|mamla', 'মামলা'], ['keu|kae|kono', 'কেউ'], ['chay|chai', 'চাই'], ['janaben|janan|bolo', 'বলুন'],
  ['hlep|help|shohojogita', 'সহায়তা'], ['bohu|stri|wife|shami|husband', 'পরিবার'], ['najor|chinta', 'সমস্যা']
];
// গ্রিটিং — ল্যাটিনে ওয়ার্ড-বাউন্ডারি (নইলে "this"-এর ভেতরের "hi" ধরে ফেলে)
function isGreeting(q) {
  return /\b(hi|hello|hey|hy|assalamu?|asalamu?|salam|namaskar|nomoskar|hi there)\b/.test(q)
    || ['আসস', 'সালাম', 'হ্যালো', 'হাই', 'নমস্কার', 'সুপ্রভাত', 'কেমন আছ', 'কি খবর', 'কী খবর'].some((w) => q.includes(w))
    || /good (morning|evening|afternoon)/.test(q);
}
// বাংলিশ হিন্ট — রোমানাইজড বাংলা ক্রিয়া/সর্বনাম
const BANGLISH_HINTS = /\b(amar|amake|ami|kivabe|kobe|kothay|korbo|kore|koreche|korle|korchi|chai|chae|lage|dorkar|janaben|bolo|bolen|dao|hobe|jate|keno|kmne|kemon|achen|acchen)\b/;
const THANK_WORDS = ['thank','thnks','dhonnobad','ধন্যবাদ','thanks a lot','thx','জাজাকাল্লাহ','jajakallah','শুকরিয়া'];
const HELP_WORDS = ['help','সহায়তা','কী পার','what can you do','কী করতে','features','কমান্ড','commands','option','অপশন'];

// ইউজারের ভাষা শনাক্ত
function detectLang(s) {
  if (/[\u0980-\u09FF]/.test(s)) return 'bn';
  const n = normText(s);
  if (BANGLISH_HINTS.test(n)) return 'bn'; // রোমানাইজড বাংলা → বাংলা উত্তর
  return 'en';
}

// চ্যাটবট কমান্ড → অ্যাকশন (সাইট কন্ট্রোল)
const CHAT_ACTIONS = {
  home: { route: '#/', label: '🏠 হোমে যান' },
  library: { route: '#/topics', label: '📚 রিসোর্স লাইব্রেরি' },
  guide: { route: '#/guide', label: '🧭 গাইড শুরু করুন' },
  apply: { route: '#/apply', label: '📝 আবেদন ফরম খুলুন' },
  track: { route: '#/track', label: '📦 আবেদন ট্র্যাক করুন' },
  offices: { route: '#/offices', label: '🗺️ অফিস খুঁজুন' },
  news: { route: '#/news', label: '📰 নিউজ ও ইভেন্ট' },
  help: { route: '#/help', label: '🤝 সহায়তা চ্যানেল' },
  call: { route: '#/call', label: '📞 কল সিমুলেটর' },
  login: { route: '#/login', label: '🔐 লগইন করুন' },
  dashboard: { route: '#/dashboard', label: '👤 আমার ড্যাশবোর্ড' },
  complaint: { route: '#/complaint', label: '📣 অভিযোগ করুন' },
  search: { route: '#/search', label: '🔍 সাইটে খুঁজুন' }
};

// ইন্টেন্ট ম্যাচ — টপিক/কীওয়ার্ড/ফরম
function findIntent(q) {
  const n = normText(q);
  // সরাসরি ফরম/আর্টিকেল টাইটেল ম্যাচ
  const forms = seed.FORMS;
  let best = null, bestScore = 0;
  for (const [fid, f] of Object.entries(forms)) {
    const words = normText(f.title).split(' ').filter((w) => w.length > 3);
    for (const w of words) {
      if (n.includes(w) && w.length > bestScore) { bestScore = w.length; best = { kind: 'form', id: fid, title: f.title }; }
    }
  }
  // টপিক ম্যাচ (মামলার ধরন/সেকশন টাইটেল)
  for (const cat of seed.CATEGORIES) {
    const title = normText(cat.title);
    if (title && n.includes(title)) { best = bestScore >= title.length ? best : { kind: 'topic', id: cat.id, title: cat.title }; bestScore = Math.max(bestScore, title.length); }
    for (const sec of (seed.SECTIONS[cat.id] || [])) {
      const st = normText(sec.title);
      if (st && st.length > 3 && n.includes(st) && st.length > bestScore) { bestScore = st.length; best = { kind: 'section', id: sec.id, title: sec.title, topic: cat.id }; }
    }
  }
  return best;
}

api.chat = (b) => {
  const raw = String(b.message || '').trim();
  if (!raw) return { reply: 'কী জানতে চান? যেমন: "আবেদন কীভাবে করব" বা "ফ্রি কি না"।' };
  const d = db.load();
  const q = normText(raw);
  const lang = detectLang(raw);
  const B = (bn, en) => (lang === 'en' ? en : bn);

  // ---- ১. গ্রিটিং (শুধু ছোট মেসেজে — বাক্যের ভেতরে থাকলে নয়) ----
  if (isGreeting(q) && q.length < 45) {
    d.chatlogs.push({ q: raw, at: new Date().toISOString(), matched: 'greeting' }); db.save();
    return {
      reply: B('ওয়ালাইকুম আসসালাম! 👋 আমি **আইনসহায় সহায়ক** — আমি পুরো ওয়েবসাইট চালাতে পারি।', 'Hello! 👋 I am the **AinShohayak assistant** — I can control the whole site.'),
      actions: ['apply', 'track', 'library', 'offices', 'call', 'help'],
      quick: B(['আবেদন কীভাবে করব?', 'ফ্রি কি না?', 'আমার আবেদন কোথায়?', 'জমির দখল'], ['How to apply?', 'Is it free?', 'Track my application', 'Land dispute'])
    };
  }
  // ---- ২. ধন্যবাদ ----
  if (THANK_WORDS.some((g) => q.includes(g))) {
    return { reply: B('আপনাকেও ধন্যবাদ! 🌿 আরও কিছু জানতে চাইলে বলুন।', 'You are welcome! 🌿 Ask me anything else.'), actions: ['home', 'apply', 'track'] };
  }
  // ---- ৩. সাহায্য/ক্ষমতা ----
  if (HELP_WORDS.some((g) => q.includes(g)) || q === 'menu') {
    return {
      reply: B('আমি এই কাজগুলো করতে পারি:\n• যেকোনো পেজ **খুলে দিতে** — বলুন "আবেদন ফরম খোলো"\n• ফরম/আর্টিকেল **খুঁজে দিতে** — বলুন "তালাকের ফরম দাও"\n• **ট্র্যাকিং** ব্যাখ্যা করতে — "আবেদন কোথায়"\n• অফিস, কল, অভিযোগ — সব নিয়ন্ত্রণ করতে', 'I can:\n• **Open** any page — say "open application form"\n• **Find** forms/articles — "give me the divorce form"\n• Explain **tracking** — "where is my application"\n• Control offices, calls, complaints — everything.'),
      actions: ['apply', 'track', 'library', 'offices', 'call', 'complaint', 'login']
    };
  }
  // ---- ৪. কমান্ড শনাক্তকরণ (সাইট কন্ট্রোল) ----
  const CMD_PATTERNS = [
    { re: /(abedon|আবেদন|apply|application)[^।?]{0,15}(khulo|khulun|open|start|shuru|খোলো|খুলুন|খোল|শুরু)/, act: 'apply' },
    { re: /(track|ট্র্যাক|অবস্থা|status|kothay|কোথায়)/, act: 'track' },
    { re: /(office|অফিস|ম্যাপ|map|আইনি সহায়তা অফিস)/, act: 'offices' },
    { re: /(library|লাইব্রেরি|টপিক|topic|article|আর্টিকেল|তথ্য)/, act: 'library' },
    { re: /(call|কল|ফোন|phone|১৬৬৯৯|16699|iv{1,2}r)/, act: 'call' },
    { re: /(login|লগইন|register|রেজিস্টার|সাইন ?আপ|account|অ্যাকাউন্ট|dashboard|ড্যাশবোর্ড)/, act: 'login' },
    { re: /(complaint|অভিযোগ|abiog)/, act: 'complaint' },
    { re: /(news|নিউজ|খবর|event|ইভেন্ট)/, act: 'news' },
    { re: /(guide|গাইড|wizard|উইজার্ড)/, act: 'guide' },
    { re: /(home|হোম|ghore|ঘরে|বাড়ি)/, act: 'home' },
    { re: /(search|সার্চ|খুঁজ)/, act: 'search' }
  ];
  const wantsOpen = /(khulo|khulun|khola|open|nao|dao|dekhao|go to|take me|jao)/.test(q)
  for (const p of CMD_PATTERNS) {
    if (p.re.test(q) && (wantsOpen || ['track', 'call'].includes(p.act) === false || q.length < 30)) {
      const act = CHAT_ACTIONS[p.act];
      d.chatlogs.push({ q: raw, at: new Date().toISOString(), matched: 'cmd:' + p.act }); db.save();
      return { reply: B('অবশ্যই! নিচের বোতামে চাপ দিলেই সেখানে যাবেন।', 'Sure! Press the button below to go there.'), action: act, actions: [p.act, 'home'] };
    }
  }
  // ---- ৫. বাংলিশ নরমালাইজ করে KB-তে খোঁজা ----
  let nb = q;
  for (const [pat, bn] of BANGLISH_MAP) {
    for (const alt of pat.split('|')) { if (nb.includes(alt)) { nb = nb.split(alt).join(bn); break; } }
  }
  let best = null, bestScore = 0;
  for (const item of seed.CHAT_KB) {
    let score = 0;
    for (const k of item.k) {
      const kn = normText(k);
      if (nb.includes(kn) || q.includes(kn)) score += kn.length;
    }
    if (score > bestScore) { bestScore = score; best = item; }
  }
  // ---- ৬. ইন্টেন্ট (ফরম/আর্টিকেল/টপিক) ----
  const intent = findIntent(raw) || findIntent(nb);
  // KB-র শক্ত উত্তর থাকলে সেটাই প্রাধান্য — দুর্বল টাইটেল-ম্যাচ intent জিততে পারে না
  if (intent && bestScore < 5) {
    d.chatlogs.push({ q: raw, at: new Date().toISOString(), matched: 'intent:' + intent.kind }); db.save();
    if (intent.kind === 'form') return { reply: B(`এই ফরমটি পেয়েছি: **${intent.title}**। বোতামে চাপ দিলে ফরম খুলে যাবে — তথ্য পূরণ করলেই প্রিন্টযোগ্য ডকুমেন্ট তৈরি হবে।`, `Found form: **${intent.title}**. Tap below to open it — fill in the fields and get a printable document.`), route: '#/form/' + intent.id, action: { route: '#/form/' + intent.id, label: '📄 ' + intent.title }, actions: ['library'] };
    if (intent.kind === 'article') return { reply: B(`এই আর্টিকেলটি দেখুন: **${intent.title}**`, `See this article: **${intent.title}**`), route: '#/article/' + intent.id, action: { route: '#/article/' + intent.id, label: '📖 ' + intent.title }, actions: ['library'] };
    if (intent.kind === 'section') return { reply: B(`**${intent.title}** বিষয়ের সব আর্টিকেল ও ফরম এই পেজে আছে।`, `All articles and forms on **${intent.title}** are on this page.`), route: '#/section/' + intent.id, action: { route: '#/section/' + intent.id, label: '📁 ' + intent.title }, actions: ['library'] };
    return { reply: B(`**${intent.title}** টপিকে প্রতিটি উপ-বিষয়ের আর্টিকেল ও ফরম সাজানো আছে।`, `The **${intent.title}** topic has organized articles and forms.`), route: '#/topic/' + intent.id, action: { route: '#/topic/' + intent.id, label: '📚 ' + intent.title }, actions: ['library', 'guide'] };
  }
  if (best) {
    d.chatlogs.push({ q: raw, at: new Date().toISOString(), matched: true }); db.save();
    const sugg = findIntent(best.a) || null;
    return { reply: best.a, actions: sugg ? ['library', 'offices'] : ['apply', 'track', 'library'], quick: B(['আরও জানতে চাই', 'ফরম খুলুন', 'অফিস খুঁজুন'], ['Tell me more', 'Open a form', 'Find office']) };
  }
  // ---- ৭. ফলব্যাক ----
  d.chatlogs.push({ q: raw, at: new Date().toISOString(), matched: false }); db.save();
  return {
    reply: B('এই বিষয়ে নিশ্চিত উত্তর আমার কাছে নেই। 😔 তবে আমি এই কাজগুলো করতে পারি — অথবা ১৬৬৯৯-এ কল করুন (ফ্রি, সকাল ৯টা–বিকাল ৫টা)।', "I don't have a confident answer. 😔 But I can help you navigate — or call 16699 (free, 9am–5pm)."),
    actions: ['guide', 'library', 'offices', 'call', 'apply'],
    fallback: true
  };
};

api.complaints_POST = (b, req) => {
  const d = db.load();
  const user = currentUser(req);
  if (!b.desc) return { error: 'কী ঘটেছে তা লিখুন' };
  const id = db.nextId('complaint', 'CMP');
  d.complaints.push({
    id, desc: b.desc, category: b.category || '', caseRef: b.caseRef || '',
    userId: user ? user.id : null, phone: b.phone || '',
    status: 'ট্রায়াজ সারিতে', createdAt: new Date().toISOString()
  });
  db.save();
  return { ok: true, id, message: 'আপনার অভিযোগ জমা হয়েছে। ৩ কর্মদিবসের মধ্যে রিভিউ হবে।' };
};

// ---------- IVR কল সিমুলেটর — DLAS প্রোটোটাইপের মতো ----------
// প্রতিটি প্রশ্নের মেনু, উত্তর, এবং সংশ্লিষ্ট অ্যাকশন
const IVR_TREE = {
  start: {
    say: ['স্বাগতম! ডিজিটাল লিগ্যাল এইড সহায়তা।', 'বাংলার জন্য ১ চাপুন।', 'Press 2 for English.'],
    menu: { '1': 'langBn', '2': 'langEn' }
  },
  langBn: {
    say: ['ভাষা: বাংলা নির্বাচিত।'],
    menu: { '1': 'track', '2': 'newApp', '3': 'office', '4': 'lawyer', '0': 'agent' }
  },
  langEn: {
    say: ['Language: English selected.'],
    menu: { '1': 'track', '2': 'newApp', '3': 'office', '4': 'lawyer', '0': 'agent' }
  },
  track: {
    say: ['আবেদন ট্র্যাক করতে আপনার ৯ ডিজিটের আইডি নম্বর প্রেরণ করুন, তারপর # চাপুন।'],
    menu: { '#': 'trackResult' }
  },
  trackResult: {
    say: ['আপনার আবেদনের অবস্থা:'],
    action: 'track'
  },
  newApp: {
    say: ['নতুন আবেদন করতে আপনার জেলার লিগ্যাল এইড অফিসে যান, অথবা ওয়েবসাইটের "নতুন আবেদন" ফরমে যান।', 'আবেদন ফরমের লিংক এসএমএসে পাঠানো হবে।'],
    action: 'smsLink'
  },
  office: {
    say: ['অফিসের ঠিকানা ও সময়সূচি জানতে আপনার জেলা নির্বাচন করুন।'],
    menu: { '1': 'officeList' }
  },
  officeList: {
    say: ['অফিসের তথ্য এসএমএসে পাঠানো হবে।'],
    action: 'smsOffice'
  },
  lawyer: {
    say: ['আইনজীবী নিয়োগ পেতে আবেদন করতে হবে। আবেদন ফরমের লিংক এসএমএসে পাঠানো হবে।'],
    action: 'smsLink'
  },
  agent: {
    say: ['আপনার কল এজেন্টের কাছে পাঠানো হচ্ছে। অনুগ্রহ করে অপেক্ষা করুন…'],
    action: 'agent'
  }
};

api.ivr = (b) => {
  const key = (b.key || '').toString();
  const state = (b.state || 'start').toString();
  const digits = (b.digits || '').toString();
  const node = IVR_TREE[state] || IVR_TREE.start;
  if (!node) return { error: 'invalid state' };
  // ট্র্যাক স্টেটে ডিজিট এসেছে — ডিবি থেকে স্টেটাস খুঁজি
  if (state === 'track' && digits) {
    const d = db.load();
    const app = d.applications.find((a) => a.appId.replace(/\D/g, '').endsWith(digits));
    if (app) {
      return { next: 'trackResult', say: [`আবেদন ${app.appId} — অবস্থা: ${seed.APPLICATION_STAGES[app.stage].label}.`, 'বিস্তারিত জানতে ওয়েবসাইটে ট্র্যাক পেজ দেখুন।'], prompt: 'মূল মেনুতে ফিরতে * চাপুন।', menu: { '*': 'langBn' } };
    }
    return { next: 'track', say: ['এই নম্বরে কোনো আবেদন পাওয়া যায়নি। আবার চেষ্টা করুন।'], prompt: '৯ ডিজিটের আইডি নম্বর প্রেরণ করুন।', menu: { '#': 'track' } };
  }
  // কী চাপা হয়নি — শুধু ঘোষণা + মেনু শোনাও (কল শুরুর গ্রিটিং)
  if (!key) {
    const resp = { next: state, say: node.say };
    resp.prompt = node.menu ? 'এখন অপশন নির্বাচন করুন।' : '';
    resp.menu = node.menu || {};
    return resp;
  }
  // মেনু অনুযায়ী পরবর্তী স্টেট
  const next = node.menu ? (node.menu[key] || null) : null;
  if (!next) return { next: state, say: ['ভুল কী চাপা হয়েছে।'], prompt: 'আবার শুনতে ৯ চাপুন।', menu: node.menu || {} };
  const nxt = IVR_TREE[next];
  const resp = { next, say: nxt.say };
  if (nxt.action === 'track') { resp.prompt = 'আবেদন আইডির শেষ ৯ ডিজিট প্রেরণ করুন, তারপর #।'; resp.menu = { '#': 'track' }; }
  else if (nxt.action === 'smsLink') { resp.prompt = 'এসএমএস পাঠানো হয়েছে।'; resp.menu = { '*': 'langBn' }; }
  else if (nxt.action === 'smsOffice') { resp.prompt = 'এসএমএস পাঠানো হয়েছে।'; resp.menu = { '*': 'langBn' }; }
  else if (nxt.action === 'agent') { resp.prompt = 'এজেন্ট কল ধরবেন। অপেক্ষা করুন…'; resp.menu = {}; }
  else { resp.prompt = nxt.menu ? 'এখন অপশন নির্বাচন করুন।' : ''; resp.menu = nxt.menu || {}; }
  return resp;
};

api.offices = (b) => {
  const q = (b.q || '').trim().toLowerCase();
  let list = seed.OFFICES;
  if (q) list = list.filter((o) => (o.name + ' ' + o.district + ' ' + o.division).toLowerCase().includes(q));
  return { offices: list, districts: seed.DISTRICTS };
};

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathName = decodeURIComponent(url.pathname);

  if (pathName.startsWith('/api/')) {
    const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : Object.fromEntries(url.searchParams);
    const name = pathName.replace('/api/', '').replace(/[^a-z_/]/g, '');
    let handler;
    if (req.method === 'POST') handler = api[name + '_POST'] || api[name];
    else handler = api[name];
    if (!handler) return send(res, 404, { error: 'unknown api: ' + name });
    try {
      const result = handler(body, req, res);
      return send(res, 200, result);
    } catch (e) {
      console.error('[api]', name, e);
      return send(res, 500, { error: 'সার্ভার সমস্যা — আবার চেষ্টা করুন' });
    }
  }

  if (req.method === 'GET') return serveStatic(res, pathName);
  return send(res, 405, { error: 'method not allowed' });
});

// ============================================================
// ADLASB ফাইনাল কেস — শেয়ার্ড রেকর্ড কোর (Golden Thread)
// এক রেকর্ড, অনেক দরজা/প্রোভাইডার · audit[] · provenance · মানুষের কর্তৃত্ব
// ============================================================
const ROLES = ['applicant', 'dlao', 'lawyer', 'mediator', 'agent16699', 'udc', 'receiving', 'staff'];
const PROVENANCE = {
  APPLICANT: 'applicant-confirmed',      // আবেদনকারী নিজে নিশ্চিত করেছেন
  REP: 'representative-reported',        // অনুমোদিত প্রতিনিধির বর্ণনা
  INTERMEDIARY: 'intermediary-translated', // UDC/সহায়তাকারী টাইপ/অনুবাদ করেছে
  STAFF: 'staff-entered',                // কর্মকর্তা/স্টাফ এন্ট্রি
  AI: 'ai-inferred'                      // AI/স্বয়ংক্রিয় অনুমান — মানুষের যাচাই দরকার
};
// হিউমান-অথরিটি নিয়ম: AI/অটোমেশন শুধু পরামর্শ দিতে পারে
const HUMAN_ONLY = ['eligibility', 'rejection', 'priority', 'lawyer-assign', 'mediation-outcome', 'closure', 'routing'];

function auditRec(actor, action, detail, prov) {
  return { at: new Date().toISOString(), actor: actor || 'system', role: (actor && actor.role) || 'system', action, detail: detail || '', provenance: prov || PROVENANCE.STAFF };
}
function fieldProv(value, prov, by) { return { v: value, prov: prov || PROVENANCE.APPLICANT, by: by || null, at: new Date().toISOString() }; }
const readField = (f) => (f && typeof f === 'object' && 'v' in f) ? f.v : f;

// ---- Case ID: গ্রহণের পরেই তৈরি, রেফারেল/মধ্যস্থতা/আইনজীবী/ক্লোজার পর্যন্ত থাকে ----
api.accept_application = (b, req) => {
  const user = currentUser(req);
  if (!user || user.role !== 'dlao') return { error: 'শুধু DLAO কর্মকর্তা আবেদন গ্রহণ করতে পারেন (মানুষের সিদ্ধান্ত)', humanAuthority: true };
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId);
  if (!app) return { error: 'আবেদন পাওয়া যায়নি' };
  if (app.caseId) return { ok: true, caseId: app.caseId, already: true };
  const decision = b.decision || 'accept'; // মানুষ সিদ্ধান্ত নেন — accept/reject
  app.audit.push(auditRec({ id: user.id, name: user.name, role: 'dlao' }, decision === 'reject' ? 'rejection' : 'acceptance', b.note || '', PROVENANCE.STAFF));
  app.audit.find((a) => a.action === 'acceptance' || a.action === 'rejection').humanDecision = true;
  if (decision === 'reject') { app.stage = 4; app.rejected = true; db.save(); return { ok: true, rejected: true, appId: app.appId }; }
  app.caseId = db.nextId('case', 'DLAS-CASE');
  app.stage = Math.max(app.stage, 2);
  app.audit.push(auditRec({ role: 'system' }, 'case-created', 'Case ID তৈরি হয়েছে')); 
  db.save();
  return { ok: true, appId: app.appId, caseId: app.caseId };
};

// ---- B1: DLAO অপারেশনাল ভিউ (নতুন/অপেক্ষমাণ/জরুরি/ওভারডিউ + কারণ) ----
api.dlao_queue = (b, req) => {
  const user = currentUser(req);
  if (!user || !['dlao', 'staff'].includes(user.role)) return { error: 'শুধু DLAO/স্টাফ দেখতে পারেন', needAuth: true };
  const d = db.load();
  const now = Date.now();
  const items = d.applications.map((a) => {
    const ageDays = Math.floor((now - new Date(a.createdAt).getTime()) / 864e5);
    const reasons = [];
    if (a.emergency) reasons.push('জরুরি — ২৪ ঘণ্টার লক্ষ্য');
    if (ageDays >= 7) reasons.push(`৭+ দিন পুরোনো (${ageDays} দিন)`);
    if (a.stage === 0) reasons.push('নতুন — যাচাই বাকি');
    if (a.lawyerOverdue) reasons.push('আইনজীবীর আপডেট বাকি (T1 অ্যালার্ট)');
    if (a.sensitive) reasons.push('স্পর্শকাতর — সীমিত অ্যাক্সেস');
    return { appId: a.appId, caseId: a.caseId || null, name: a.name, district: a.district, caseType: a.caseType, stage: a.stage, emergency: !!a.emergency, sensitive: !!a.sensitive, ageDays, flags: reasons, priorityHint: reasons.length, lastAudit: a.audit[a.audit.length - 1] || null };
  });
  items.sort((x, y) => y.priorityHint - x.priorityHint || y.ageDays - x.ageDays);
  return { queue: items, note: 'প্রায়োরিটি হিন্ট মাত্র — চূড়ান্ত প্রায়োরিটি কর্মকর্তা নির্ধারণ করেন (মানুষের কর্তৃত্ব)' };
};

// ---- রোল-ভিউ: এক রেকর্ড, প্রতিটি প্রোভাইডারের নিজের দৃষ্টি (G9) ----
api.role_view = (b, req) => {
  const user = currentUser(req);
  if (!user) return { error: 'লগইন করুন', needAuth: true };
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId || a.caseId === b.appId);
  if (!app) return { error: 'রেকর্ড পাওয়া যায়নি' };
  const role = user.role;
  if (app.sensitive && !['dlao', 'staff', 'lawyer', 'mediator'].includes(role)) {
    app.audit.push(auditRec({ id: user.id, role }, 'access-denied', 'স্পর্শকাতর রেকর্ড — অনুমতি নেই'));
    db.save();
    return { error: 'এই রেকর্ড স্পর্শকাতর — আপনার রোলে অ্যাক্সেস নেই (G9)', accessDenied: true };
  }
  const full = { appId: app.appId, caseId: app.caseId || null, name: app.name, district: app.district, caseType: app.caseType, stage: app.stage, stageLabel: seed.APPLICATION_STAGES[app.stage].label, emergency: app.emergency, audit: app.audit, history: app.history, safeContact: app.safeContact || null, representation: app.representation || null, documents: app.documents || [], tasks: app.tasks || [], linkedGroup: app.linkedGroup || null, referral: app.referral || null, mediation: app.mediation || null, lawyer: app.lawyer || null };
  if (role === 'applicant') return { view: 'citizen', record: { ...full, audit: app.audit.slice(-10), problem: app.problem, phone: app.phone } };
  if (role === 'agent16699') return { view: 'helpline', record: { appId: app.appId, caseId: app.caseId, name: app.name, district: app.district, stage: app.stage, stageLabel: full.stageLabel, nextStep: seed.APPLICATION_STAGES[app.stage].label, emergency: app.emergency, safeContact: app.safeContact || null }, note: 'এজেন্ট সীমিত দৃশ্য দেখেন — একই রেকর্ড, আলাদা নোট নয়' };
  if (role === 'udc') return { view: 'assisted', record: { appId: app.appId, name: app.name, district: app.district, stage: app.stage, stageLabel: full.stageLabel, docsChecklist: (app.documents || []).length }, note: 'UDC-এর পোস্ট-সাবমিশন অ্যাক্সেস সীমিত (B4)' };
  if (role === 'lawyer') return { view: 'lawyer', record: { caseId: app.caseId, appId: app.appId, name: app.name, district: app.district, caseType: app.caseType, stage: app.stage, lawyerStatus: app.lawyer ? app.lawyer.status || 'assigned' : null, hearings: app.hearings || [], deadlines: app.deadlines || [], documents: app.documents, tasks: (app.tasks || []).filter((x) => x.owner === 'lawyer') } };
  if (role === 'mediator') return { view: 'mediator', record: { caseId: app.caseId, appId: app.appId, name: app.name, district: app.district, stage: app.stage, mediation: app.mediation || null, documents: app.documents, parties: app.parties || null } };
  return { view: 'dlao', record: full };
};

// ---- A1 সেফ-কন্টাক্ট: অনিরাপদ নম্বর ব্লক/বিলম্ব + কারণ রেকর্ড ----
api.safe_contact = (b, req) => {
  const user = currentUser(req);
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId);
  if (!app) return { error: 'রেকর্ড পাওয়া যায়নি' };
  if (!user || !['dlao', 'staff'].includes(user.role)) return { error: 'শুধু কর্মকর্তা সেফ-কন্টাক্ট সেট করতে পারেন' };
  app.safeContact = { safeNumber: b.safeNumber || '', unsafeNumbers: b.unsafeNumbers || [], window: b.window || '', neutralWording: true, setBy: user.id, at: new Date().toISOString() };
  app.audit.push(auditRec({ id: user.id, name: user.name, role: 'dlao' }, 'safe-contact-set', `নিরাপদ নম্বর সেট; নিষিদ্ধ: ${(b.unsafeNumbers || []).length}টি; সময়: ${b.window || 'যেকোনো'}`, PROVENANCE.STAFF));
  db.save();
  return { ok: true, safeContact: app.safeContact, note: 'যাচাই কল শুধু নিরাপদ নম্বরে, নিরপেক্ষ ভাষায় যাবে; অনিরাপদ নম্বর রিং হলে কল বিলম্বিত ও লগ হবে' };
};

// ---- প্রতিনিধিত্ব (A2 Ripon): অনুমোদনের স্কোপ + কে কী নিশ্চিত করেছেন ----
api.representation = (b, req) => {
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId);
  if (!app) return { error: 'রেকর্ড পাওয়া যায়নি' };
  const user = currentUser(req);
  app.representation = { repName: b.repName || '', repPhone: b.repPhone || '', relation: b.relation || '', scope: b.scope || 'intake-only', authorityProof: b.authorityProof || '', consentRecorded: true, at: new Date().toISOString(), setBy: user ? user.id : 'intake' };
  app.audit.push(auditRec(user ? { id: user.id, role: user.role } : { role: 'intake' }, 'representation-recorded', `প্রতিনিধি: ${b.repName || ''} (স্কোপ: ${b.scope || 'intake-only'})`, PROVENANCE.REP));
  db.save();
  return { ok: true, representation: app.representation, note: 'রেকর্ডে স্পষ্ট থাকবে কোন তথ্য আবেদনকারী নিজে নিশ্চিত করেছেন, কোনটা প্রতিনিধির বর্ণনা' };
};

// ---- মার্ক-কনফার্মড: আবেদনকারী নিজের তথ্য নিশ্চিত করছেন (Moyuri কারেক্ট/উইথড্র) ----
api.confirm_field = (b, req) => {
  const user = currentUser(req);
  if (!user) return { error: 'লগইন করুন', needAuth: true };
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId);
  if (!app) return { error: 'রেকর্ড পাওয়া যায়নি' };
  app.confirmed = app.confirmed || {};
  app.confirmed[b.field] = { at: new Date().toISOString(), by: user.id, prov: PROVENANCE.APPLICANT };
  app.audit.push(auditRec({ id: user.id, role: user.role }, 'field-confirmed', `${b.field} — আবেদনকারী নিশ্চিত`, PROVENANCE.APPLICANT));
  db.save();
  return { ok: true, confirmed: app.confirmed };
};

// ---- A3 স্পর্শকাতর + ট্র্যাকড রেফারেল (B6) ----
api.referral = (b, req) => {
  const user = currentUser(req);
  if (!user || !['dlao', 'staff'].includes(user.role)) return { error: 'শুধু DLAO রেফারেল পাঠাতে পারেন' };
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId);
  if (!app) return { error: 'রেকর্ড পাওয়া যায়নি' };
  app.referral = { toDistrict: b.toDistrict || '', toOffice: b.toOffice || 'জেলা লিগ্যাল এইড অফিস', reason: b.reason || '', documents: b.documents || [], sentBy: user.id, sentAt: new Date().toISOString(), status: 'sent', ackDeadline: new Date(Date.now() + 3 * 864e5).toISOString(), history: [{ at: new Date().toISOString(), st: 'sent' }] };
  if (b.sensitive) app.sensitive = true;
  app.audit.push(auditRec({ id: user.id, name: user.name, role: 'dlao' }, 'referral-sent', `→ ${b.toDistrict}: ${b.reason || ''}`, PROVENANCE.STAFF));
  db.save();
  return { ok: true, referral: app.referral, note: 'গ্রহণকারী অফিস ৩ কর্মদিবসে acknowledge না করলে ফলো-আপ টাস্ক তৈরি হবে' };
};
api.referral_ack = (b, req) => {
  const user = currentUser(req);
  if (!user || !['dlao', 'receiving', 'staff'].includes(user.role)) return { error: 'শুধু গ্রহণকারী অফিস acknowledge করতে পারে' };
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId);
  if (!app || !app.referral) return { error: 'রেফারেল পাওয়া যায়নি' };
  app.referral.status = b.decision || 'acknowledged'; // acknowledged / accepted / returned
  app.referral.ackAt = new Date().toISOString();
  app.referral.ackBy = user.id;
  app.referral.history.push({ at: app.referral.ackAt, st: app.referral.status });
  app.audit.push(auditRec({ id: user.id, name: user.name, role: user.role }, 'referral-' + app.referral.status, b.note || ''));
  db.save();
  return { ok: true, referral: app.referral };
};

// ---- B2 মধ্যস্থতা: শিডিউল → নোটিশ → উপস্থিতি → ফলাফল (মানুষ ফলাফল নেন) ----
api.mediation = (b, req) => {
  const user = currentUser(req);
  if (!user || !['dlao', 'mediator'].includes(user.role)) return { error: 'শুধু মধ্যস্থতাকারী পরিচালনা করেন' };
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId || a.caseId === b.appId);
  if (!app) return { error: 'রেকর্ড পাওয়া যায়নি' };
  app.mediation = app.mediation || { history: [] };
  if (b.action === 'schedule') { app.mediation.date = b.date; app.mediation.mode = b.mode || 'in-person'; app.mediation.status = 'scheduled'; app.mediation.history.push({ at: new Date().toISOString(), st: 'scheduled', date: b.date, mode: app.mediation.mode }); }
  else if (b.action === 'notice') { app.mediation.noticesSent = (app.mediation.noticesSent || 0) + 1; app.mediation.history.push({ at: new Date().toISOString(), st: 'notice-sent' }); }
  else if (b.action === 'attendance') { app.mediation.attendance = b.attendance; app.mediation.history.push({ at: new Date().toISOString(), st: 'attendance', who: b.attendance }); }
  else if (b.action === 'outcome') { app.mediation.outcome = b.outcome; app.mediation.outcomeBy = user.id; app.mediation.status = 'closed'; app.mediation.history.push({ at: new Date().toISOString(), st: 'outcome', outcome: b.outcome, humanDecision: true }); }
  app.audit.push(auditRec({ id: user.id, name: user.name, role: user.role }, 'mediation-' + (b.action || ''), JSON.stringify(b).slice(0, 120), b.action === 'outcome' ? PROVENANCE.STAFF : PROVENANCE.STAFF));
  db.save();
  return { ok: true, mediation: app.mediation, humanAuthority: b.action === 'outcome' ? 'মধ্যস্থতার ফলাফল মানুষ নির্ধারণ করেন' : undefined };
};

// ---- B5/T1 প্যানেল আইনজীবী: অ্যাসাইন, আপডেট, ওভারডিউ, প্যাটার্ন-অ্যালার্ট ----
api.lawyer = (b, req) => {
  const user = currentUser(req);
  if (!user) return { error: 'লগইন করুন', needAuth: true };
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId || a.caseId === b.appId);
  if (!app) return { error: 'রেকর্ড পাওয়া যায়নি' };
  app.lawyer = app.lawyer || { updates: [], missed: 0 };
  if (b.action === 'assign') {
    if (!['dlao', 'staff'].includes(user.role)) return { error: 'শুধু DLAO আইনজীবী নিয়োগ করেন (মানুষের সিদ্ধান্ত)', humanAuthority: true };
    app.lawyer.name = b.name; app.lawyer.assignedAt = new Date().toISOString(); app.lawyer.assignedBy = user.id; app.lawyer.status = 'assigned'; app.stage = Math.max(app.stage, 3);
    app.tasks.push({ id: 'T' + Date.now().toString(36), type: 'lawyer-accept', owner: 'lawyer', status: 'open', note: `${b.name} — নিয়োগ গ্রহণ/বাতিল করুন`, createdAt: new Date().toISOString() });
  } else if (b.action === 'respond') {
    // T1/B5: আইনজীবী ডিজিটালি accept/decline করেন
    if (user.role !== 'lawyer') return { error: 'শুধু নিয়োগপ্রাপ্ত আইনজীবী সাড়া দেন' };
    if (!['accept', 'decline'].includes(b.decision)) return { error: 'decision: accept | decline' };
    app.lawyer.status = b.decision === 'accept' ? 'accepted' : 'declined';
    app.lawyer.respondedAt = new Date().toISOString();
    app.tasks = (app.tasks || []).map((x) => x.type === 'lawyer-accept' ? { ...x, status: 'done' } : x);
    if (b.decision === 'decline') app.tasks.push({ id: 'T' + Date.now().toString(36), type: 'reassign', owner: 'dlao', status: 'open', note: 'আইনজীবী নিয়োগ বাতিল করেছেন — পুনঃনিয়োগ দরকার', createdAt: new Date().toISOString() });
    app.audit.push(auditRec({ id: user.id, role: 'lawyer' }, 'assignment-' + b.decision, b.reason || '', PROVENANCE.STAFF));
    db.save();
    return { ok: true, status: app.lawyer.status, note: b.decision === 'accept' ? 'নিয়োগ গৃহীত — কেস আপনার ওয়ার্কলিস্টে' : 'বাতিল রেকর্ড হয়েছে — DLAO-কে পুনঃনিয়োগ টাস্ক গেছে' };
  } else if (b.action === 'update') {
    if (user.role !== 'lawyer') return { error: 'শুধু আইনজীবী আপডেট দেন' };
    app.lawyer.updates.push({ at: new Date().toISOString(), text: b.text || '' }); app.lawyer.missed = 0; app.lawyer.lastUpdate = new Date().toISOString();
  } else if (b.action === 'miss') {
    app.lawyer.missed = (app.lawyer.missed || 0) + 1;
    if (app.lawyer.missed >= 2) app.lawyerOverdue = true; // DLAO-তে T1 অ্যালার্ট
  } else if (b.action === 'hearing') {
    app.hearings = app.hearings || []; app.hearings.push({ date: b.date, note: b.note || '' });
  }
  app.audit.push(auditRec({ id: user.id, name: user.name, role: user.role }, 'lawyer-' + (b.action || ''), (b.name || b.text || b.date || '').slice(0, 100), PROVENANCE.STAFF));
  db.save();
  return { ok: true, lawyer: { name: app.lawyer.name, missed: app.lawyer.missed, updates: (app.lawyer.updates || []).length, overdue: !!app.lawyerOverdue }, patternAlert: (app.lawyer.missed >= 2) ? '২টি হিয়ারিং/আপডেট মিস — প্যাটার্ন রিভিউ অ্যালার্ট (T1); দোষ প্রমাণ নয়' : undefined };
};

// ---- T3: এক ঘটনা, একাধিক আবেদন — লিংক, মার্জ নয় ----
api.link_cases = (b, req) => {
  const user = currentUser(req);
  if (!user || !['dlao', 'staff'].includes(user.role)) return { error: 'শুধু কর্মকর্তা লিংক করেন' };
  const d = db.load();
  const ids = b.appIds || [];
  const apps = ids.map((id) => d.applications.find((a) => a.appId === id)).filter(Boolean);
  if (apps.length < 2) return { error: 'কমপক্ষে ২টি আবেদন দিন' };
  const gid = 'GRP-' + Date.now().toString(36).toUpperCase();
  for (const a of apps) { a.linkedGroup = gid; a.audit.push(auditRec({ id: user.id, role: user.role }, 'case-linked', `গ্রুপ ${gid}`, PROVENANCE.STAFF)); }
  d.linkedGroups = d.linkedGroups || {};
  d.linkedGroups[gid] = { appIds: apps.map((a) => a.appId), sharedEvidence: b.sharedEvidence || 'common-evidence', createdAt: new Date().toISOString(), createdBy: user.id, note: 'লিংক করা হয়েছে — মার্জ নয়; গোপনীয়তা ও ফলাফল কেস-স্পেসিফিক' };
  db.save();
  return { ok: true, groupId: gid, linked: apps.map((a) => a.appId), rule: 'Link, do not merge (T3)' };
};

// ---- T4: ডুপ্লিকেট/ফ্রড-রিস্ক — ফাজি ম্যাচ + মানুষের রিভিউ (অটো-রিজেক্ট নয়) ----
api.duplicate_check = (b, req) => {
  const user = currentUser(req);
  if (!user || !['dlao', 'staff'].includes(user.role)) return { error: 'শুধু কর্মকর্তার জন্য' };
  const d = db.load();
  const name = (b.name || '').trim();
  const phone = (b.phone || '').replace(/\D/g, '');
  const nid = (b.nid || '').replace(/\D/g, '');
  const sim = (s1, s2) => { s1 = s1 || ''; s2 = s2 || ''; let hit = 0; for (let i = 0; i < Math.min(s1.length, s2.length); i++) if (s1[i] === s2[i]) hit++; return hit / Math.max(s1.length, s2.length, 1); };
  const candidates = d.applications.filter((a) => a.appId !== b.appId).map((a) => {
    const reasons = [];
    let score = 0;
    if (phone && (a.phone || '').replace(/\D/g, '') === phone) { reasons.push('একই ফোন'); score += 45; }
    if (nid && (a.nid || '').replace(/\D/g, '') === nid) { reasons.push('একই এনআইডি'); score += 45; }
    const ns = sim(name, a.name);
    if (name && ns > 0.7) { reasons.push(`নাম ${Math.round(ns * 100)}% মিল`); score += Math.round(ns * 30); }
    if ((b.district || '') === a.district && (b.caseType || '') === a.caseType && name && sim(name, a.name) > 0.5) { reasons.push('একই জেলা+ধরন+কাছাকাছি নাম'); score += 15; }
    return score > 30 ? { appId: a.appId, name: a.name, phone: a.phone, createdAt: a.createdAt, score, reasons } : null;
  }).filter(Boolean).sort((x, y) => y.score - x.score);
  return { candidates, rule: 'কনফিডেন্স স্কোর + কারণ — সিদ্ধান্ত মানুষের (কখনো অটো-রিজেক্ট/মার্জ নয়) (T4)', sideBySide: true };
};

// ---- T6: ডকুমেন্ট ব্রিফিং ও চেকলিস্ট এজেন্ট (AI-ইনফার্ড, সোর্সসহ) ----
const DOC_CHECKLISTS = {
  'family': ['বিবাহনিবন্ধন সনদ', 'এনআইডি/জন্মনিবন্ধন', 'ঠিকানার প্রমাণ', 'আয়ের সনদ'],
  'land': ['দলিল/খতিয়ান', 'ভূমি উন্নয়ন করের রশিদ', 'এনআইডি', 'কেস/জিডি কপি (থাকলে)'],
  'labour': ['নিয়োগপত্র/চাকরির প্রমাণ', 'বেতনের রশিদ/ব্যাংক স্টেটমেন্ট', 'এনআইডি', 'ছাঁটাই/পদত্যাগ পত্র']
};
api.doc_brief = (b) => {
  const docs = b.documents || [];
  const type = (b.caseType || '').toLowerCase();
  const key = type.includes('পরিবার') || type.includes('family') ? 'family' : type.includes('ভূমি') || type.includes('land') ? 'land' : 'labour';
  const checklist = DOC_CHECKLISTS[key];
  const briefing = [];
  for (const doc of docs) {
    briefing.push({ point: `${doc.name || doc} — ${doc.summary || 'সংক্ষিপ্ত সারাংশ উপলব্ধ'}`, source: doc.name || doc, prov: PROVENANCE.AI, flag: doc.unclear ? 'unclear' : null });
  }
  const have = docs.map((x) => (x.name || x).toLowerCase());
  const missing = checklist.filter((c) => !have.some((h) => c.toLowerCase().includes(h.slice(0, 6)) || h.includes(c.slice(0, 6))));
  const uncertain = docs.filter((x) => x.unclear).map((x) => x.name || x);
  return { checklist, briefing, missing, uncertain, guardrail: 'অস্পষ্ট জিনিস অনুমান নয় — ফ্ল্যাগ করা হয়েছে; কর্মকর্তা ব্রিফিং যাচাই করবেন (T6)', prov: PROVENANCE.AI };
};

// ---- T7: সেটেলমেন্ট ড্রাফটিং (AI খসড়া, মানুষের রিভিউ বাধ্যতামূলক) ----
api.settlement_draft = (b) => {
  const kind = b.kind || 'maintenance';
  const v = b.notes || '';
  const templates = {
    maintenance: { title: 'ভরণপোষণ সমঝোতা চুক্তিপত্র (খসড়া)', sections: ['পক্ষভুক্তি', 'মাসিক ভরণপোষণের অঙ্ক ও তারিখ', 'বকেয়া পরিশোধের পদ্ধতি', 'লঙ্ঘন হলে প্রতিকার', 'পক্ষের স্বাক্ষর'] },
    property: { title: 'সম্পত্তি বণ্টন সমঝোতা (খসড়া)', sections: ['সম্পত্তির বিবরণ (দাগ/খতিয়ান)', 'বণ্টনের অনুপাত', 'দখল হস্তান্তরের সময়সীমা', 'দলিল সম্পাদনের দায়', 'পক্ষের স্বাক্ষর'] },
    labour: { title: 'শ্রম/বকেয়া নিষ্পত্তি সমঝোতা (খসড়া)', sections: ['কর্মকর্তা/প্রতিষ্ঠানের পরিচয়', 'বকেয়া মজুরি/ক্ষতিপূরণের অঙ্ক', 'পরিশোধের তারিখ', 'অভিযোগ প্রত্যাহারের শর্ত', 'পক্ষের স্বাক্ষর'] }
  };
  const tpl = templates[kind] || templates.maintenance;
  const draft = { title: tpl.title, sections: tpl.sections.map((s, i) => ({ s, text: `[AI-পূরক খসড়া ${i + 1}] ${s} — মধ্যস্থতাকারীর নোট থেকে: "${String(v).slice(0, 60)}…"`, inferred: true })), warnings: [] };
  if (/সময়|date|tarih/i.test(v) && !/তারিখ/i.test(v)) draft.warnings.push('অসামঞ্জস্য: নোটে তারিখের উল্লেখ অস্পষ্ট');
  draft.warnings.push('এটি শুধু খসড়া — মানুষের আইনি রিভিউ, পক্ষের বোঝা/সম্মতি ও আনুষ্ঠানিকতা বাধ্যতামূলক (T7)');
  return { draft, prov: PROVENANCE.AI, requiresHumanReview: true };
};

// ---- T8: মাল্টি-এজেন্ট ট্রায়াজ — ৩ এজেন্ট + দ্বন্দ্ব প্রকাশ + মানুষের ফাইনাল ----
api.triage = (b) => {
  const app = b || {};
  const catAgent = { agent: 'categoriser', category: app.caseType || 'সাধারণ', evidence: ['caseType ফিল্ড', 'সমস্যার বিবরণ কীওয়ার্ড'] };
  const urgAgent = { agent: 'urgency', urgent: !!app.emergency, evidence: app.emergency ? ['জরুরি চেকবক্স', 'নির্যাতন/হুমকির কীওয়ার্ড'] : ['কোনো জরুরি সংকেত নেই'] };
  const procAgent = { agent: 'process-check', issues: [] };
  if (!app.nid) procAgent.issues.push('এনআইডি অনুপস্থিত');
  if (!app.phone) procAgent.issues.push('ফোন অনুপস্থিত');
  if (!app.district) procAgent.issues.push('জেলা অনুপস্থিত');
  let priorityHint = 'normal';
  if (urgAgent.urgent) priorityHint = 'urgent';
  else if (procAgent.issues.length === 0) priorityHint = 'normal';
  const conflict = urgAgent.urgent && procAgent.issues.length >= 2 ? { conflict: true, reason: 'জরুরি হলেও জরুরি তথ্য অসম্পূর্ণ — মানব-রিভিউ দরকার' } : null;
  return { agents: [catAgent, urgAgent, procAgent], priorityHint, conflict, rule: 'হিন্ট মাত্র — চূড়ান্ত প্রায়োরিটি/রাউটিং কর্মকর্তা নেন (T8)', prov: PROVENANCE.AI };
};

// ---- T9: অফলাইন ফার্স্ট সিঙ্ক (টেম্প UUID → ডুপ্লিকেট ছাড়া) + ইন্টিগ্রিটি ----
api.sync_push = (b, req) => {
  const items = b.items || [];
  const d = db.load();
  const results = [];
  for (const it of items) {
    if (!it || !it.clientId) continue;
    const dup = d.syncLog && d.syncLog.find((s) => s.clientId === it.clientId);
    if (dup) { results.push({ clientId: it.clientId, status: 'duplicate-skipped', appId: dup.appId }); continue; }
    const user = currentUser(req);
    const appId = db.nextId('application', 'DLAS-NET');
    d.applications.push({ appId, userId: user ? user.id : null, name: it.name || '', phone: it.phone || '', nid: it.nid || '', district: it.district || '', caseType: it.caseType || '', problem: it.problem || '', emergency: !!it.emergency, stage: 0, offlineCreated: true, tempUuid: it.clientId, provenanceTags: { source: 'udc-assisted', connectivity: 'offline-created' }, history: [{ at: new Date().toISOString(), label: seed.APPLICATION_STAGES[0].label + ' (অফলাইনে তৈরি)' }], audit: [auditRec({ role: 'udc' }, 'offline-sync', 'অফলাইনে তৈরি রেকর্ড সিঙ্ক হয়েছে', PROVENANCE.INTERMEDIARY)], createdAt: new Date().toISOString() });
    d.syncLog = d.syncLog || [];
    d.syncLog.push({ clientId: it.clientId, appId, at: new Date().toISOString() });
    results.push({ clientId: it.clientId, status: 'created', appId });
  }
  db.save();
  return { results, integrity: 'প্রতি রেকর্ডে tempUuid→appId ম্যাপিং + syncLog — পুনরাবৃত্তি নিরাপদ (idempotent)', conflicts: results.filter((r) => r.status === 'conflict') };
};

// ---- T10: PWA manifest ----
api.pwa_manifest = () => ({ name: 'আইনসহায় — বাংলাদেশ ডিজিটাল লিগ্যাল এইড', short_name: 'আইনসহায়', start_url: '/', display: 'standalone', background_color: '#FBFAF6', theme_color: '#3D9970', lang: 'bn', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }], note: 'T10 — ইনস্টলেবল PWA; লাইট মোড ও সেফ ক্যাশিং ফ্রন্টএন্ডে' });

// ---- T11: অ্যাসিনক্রোনাস ই-সিগনেচার (হ্যাশ-ভিত্তিক, দুই পক্ষ ভিন্ন সময়ে) ----
const crypto2 = require('crypto');
api.esign = (b, req) => {
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId || a.caseId === b.appId);
  if (!app) return { error: 'রেকর্ড পাওয়া যায়নি' };
  app.esign = app.esign || { signatures: [], docHash: null };
  if (b.action === 'prepare') {
    app.esign.docHash = crypto2.createHash('sha256').update((b.document || '') + app.appId).digest('hex');
    app.audit.push(auditRec({ role: 'mediator' }, 'esign-prepared', 'দস্তাবেজ হ্যাশ তৈরি')); 
    db.save();
    return { ok: true, docHash: app.esign.docHash, note: 'দুই পক্ষ ভিন্ন সময়ে/অফলাইনে সাইন করতে পারবেন' };
  }
  if (b.action === 'sign') {
    const sig = { party: b.party || 'পক্ষ', signedAt: new Date().toISOString(), offline: !!b.offline, docHash: app.esign.docHash, sig: crypto2.createHash('sha256').update((app.esign.docHash || '') + (b.party || '') + (b.pin || '')).digest('hex') };
    app.esign.signatures.push(sig);
    app.audit.push(auditRec({ party: b.party }, 'esign-signed', `${b.party} — ${b.offline ? 'অফলাইনে' : 'অনলাইনে'} স্বাক্ষর`));
    const allSigned = app.esign.signatures.length >= 2;
    db.save();
    return { ok: true, signed: app.esign.signatures.length, allSigned, verify: allSigned ? 'verify অ্যাকশন দিয়ে ইন্টিগ্রিটি যাচাই করুন' : null };
  }
  if (b.action === 'verify') {
    const intact = app.esign.signatures.every((s) => s.docHash === app.esign.docHash);
    return { docHash: app.esign.docHash, signatures: app.esign.signatures.length, intact, result: intact ? '✅ সব স্বাক্ষর একই দস্তাবেজ-হ্যাশে — দস্তাবেজ অপরিবর্তিত' : '❌ হ্যাশ মেলেনি — দস্তাবেজ বদলেছে', guardrail: 'ক্রিপ্টোগ্রাফিক ভ্যালিডিটি ≠ আইনি বৈধতা (T11)' };
  }
  return { error: 'action: prepare | sign | verify' };
};

// ---- B7: কেস-সাপোর্ট স্টাফ — সার্চ + রিপোর্ট (ফিজিক্যাল ফাইল ছাড়াই রিকনস্ট্রাক্ট) ----
api.case_search = (b, req) => {
  const user = currentUser(req);
  if (!user || !['dlao', 'staff', 'receiving'].includes(user.role)) return { error: 'শুধু অফিস রোলের জন্য', needAuth: true };
  const d = db.load();
  const q = String(b.q || '').trim().toLowerCase();
  if (!q) return { error: 'নাম/আইডি/জেলা/ফোন দিয়ে খুঁজুন' };
  const hit = d.applications.filter((a) => [a.appId, a.caseId, a.name, a.district, a.phone, a.caseType].some((v) => v && String(v).toLowerCase().includes(q)));
  return {
    results: hit.slice(0, 20).map((a) => ({ appId: a.appId, caseId: a.caseId || null, name: a.name, district: a.district, stage: a.stage, stageLabel: seed.APPLICATION_STAGES[a.stage].label, createdAt: a.createdAt, lastAction: (a.audit || [])[(a.audit || []).length - 1] || null, tasks: (a.tasks || []).filter((t) => t.status === 'open').length })),
    total: hit.length,
    note: 'একবার ক্যাপচার করা ডেটাই রিপোর্টে ব্যবহৃত হয় — পুনঃপ্রবেশ নেই (B7)'
  };
};
api.case_report = (b, req) => {
  const user = currentUser(req);
  if (!user || !['dlao', 'staff'].includes(user.role)) return { error: 'শুধু অফিস রোলের জন্য', needAuth: true };
  const d = db.load();
  const byStage = seed.APPLICATION_STAGES.map((s, i) => ({ stage: s.label, count: d.applications.filter((a) => a.stage === i).length }));
  const byType = {};
  for (const a of d.applications) byType[a.caseType || 'উল্লেখ নেই'] = (byType[a.caseType || 'উল্লেখ নেই'] || 0) + 1;
  return {
    generatedAt: new Date().toISOString(),
    total: d.applications.length,
    byStage, byType,
    emergency: d.applications.filter((a) => a.emergency).length,
    withCaseId: d.applications.filter((a) => a.caseId).length,
    openTasks: d.applications.reduce((n, a) => n + (a.tasks || []).filter((t) => t.status === 'open').length, 0),
    note: 'রুটিন স্ট্যাটাস রিপোর্ট — কেস রেকর্ড থেকেই তৈরি, আলাদা রেজিস্টার নয় (B7)'
  };
};

// ---- রুলবুক ডেমো সিড: ৫ সিটিজেন পার্সোনা (A1–A5) এক ক্লিকে টেস্টযোগ্য ----
api.demo_seed = () => {
  const d = db.load();
  const made = {};
  const personas = [
    { key: 'A1', name: 'ময়ূরী আক্তার', district: 'জয়পুরহাট', caseType: 'পারিবারিক — ভরণপোষণ', problem: 'স্বামী ভরণপোষণ দেন না; আমার ফোন স্বামী নিয়ন্ত্রণ করে।', emergency: true, safeContact: { safeNumber: '01700-111111', unsafeNumbers: ['01700-222222'], window: 'সকাল ১১টা–দুপুর ১টা' }, representation: null, prov: PROVENANCE.APPLICANT },
    { key: 'A2', name: 'রিপন মালাকার (প্রতিনিধি)', district: 'জয়পুরহাট', caseType: 'পারিবারিক — ভরণপোষণ', problem: 'বোনের হয়ে প্রতিনিধি হিসেবে আবেদন (প্রতিবন্ধী — ভয়েস/কল রুট)।', emergency: false, representation: { repName: 'রিপন মালাকার', repPhone: '01700-333333', relation: 'ভাই', scope: 'intake-only' }, prov: PROVENANCE.REP },
    { key: 'A3', name: 'নাবিলা (নাম পরিবর্তিত)', district: 'ঝিনাইদহ', caseType: 'সাইবার — হয়রানি', problem: 'ফেক/সম্পাদিত ছবি দিয়ে চাপ দেওয়া হচ্ছে — স্পর্শকাতর।', emergency: true, sensitive: true, prov: PROVENANCE.APPLICANT },
    { key: 'A4', name: 'নুচিং মারমা', district: 'খাগড়াছড়ি', caseType: 'ভূমি — দখল', problem: 'UDC উদ্যোক্তার সহায়তায় আবেদন (সীমিত বাংলা; অফলাইনে তৈরি হতে পারে)।', emergency: false, assistedBy: 'UDC উদ্যোক্তা — খাগড়াছড়ি', prov: PROVENANCE.INTERMEDIARY },
    { key: 'A5', name: 'আবদুল মালেক', district: 'বরগুনা', caseType: 'ভূমি — দীর্ঘস্থায়ী মামলা', problem: '৭ মাসের পুরোনো মামলা; ফাইলের নম্বরে দোকানের ফোন; আইনজীবীর আপডেট বাকি।', emergency: false, lawyerOverdue: true, failedContacts: [{ at: new Date(Date.now() - 864e5).toISOString(), note: 'ফাইলের নম্বর বন্ধ' }, { at: new Date(Date.now() - 2 * 864e5).toISOString(), note: 'কেউ ধরেননি' }], prov: PROVENANCE.STAFF }
  ];
  for (const p of personas) {
    let app = d.applications.find((a) => a.demoPersona === p.key);
    if (!app) {
      const appId = db.nextId('application', 'DLAS-NET');
      const now = new Date().toISOString();
      app = { appId, demoPersona: p.key, userId: null, name: p.name, phone: '0170000000' + (personas.indexOf(p) + 1), nid: '', district: p.district, caseType: p.caseType, problem: p.problem, emergency: !!p.emergency, sensitive: !!p.sensitive, stage: p.key === 'A5' ? 3 : (p.key === 'A3' ? 1 : 0), history: [{ at: now, label: seed.APPLICATION_STAGES[p.key === 'A5' ? 3 : (p.key === 'A3' ? 1 : 0)].label }], tasks: [], documents: [], failedContacts: p.failedContacts || [], safeContact: p.safeContact || null, representation: p.representation || null, channel: p.key === 'A4' ? 'assisted' : (p.key === 'A2' ? 'voice' : 'web'), audit: [auditRec({ role: p.key === 'A4' ? 'udc' : (p.key === 'A2' ? 'representative' : 'applicant') }, 'application-created', `ডেমো পার্সোনা ${p.key}`, p.prov)], provenance: { name: p.prov, phone: p.prov, problem: p.prov }, createdAt: now };
      if (p.lawyerOverdue) { app.lawyer = { name: 'অ্যাডভোকেট রহমান', missed: 2, updates: [] }; app.audit.push(auditRec({ role: 'system' }, 'lawyer-missed', '২টি আপডেট মিস (T1)')); }
      if (p.key === 'A5') { app.hearings = [{ date: '১৫/১০/২০২৬', note: 'সাক্ষীর সাক্ষ্য' }]; }
      d.applications.push(app);
      made[p.key] = app.appId;
    } else made[p.key] = app.appId;
  }
  db.save();
  return { ok: true, personas: made, note: 'রুলবুকের ৫ সিটিজেন সিনারিও — প্রত্যেকটা কনসোলের রোল-ভিউতে খুলে টেস্ট করুন' };
};

// ---- রোল সুইচ (ডেমো): সেশন ইউজারের রোল বদলায় — রোল-ভিউ টেস্টের জন্য ----
api.role_switch = (b, req) => {
  const user = currentUser(req);
  if (!user) return { error: 'লগইন করুন', needAuth: true };
  const role = ROLES.includes(b.role) ? b.role : 'applicant';
  const d = db.load();
  user.role = role;
  d.sessions[parseCookies(req).session].role = role;
  db.save();
  return { ok: true, role };
};

// ---- T2: জুরিসডিকশন পিং-পং — ২টি রিটার্নের পর এস্কালেশন + মানুষের সিদ্ধান্ত ----
api.jurisdiction = (b, req) => {
  const user = currentUser(req);
  const d = db.load();
  const app = d.applications.find((a) => a.appId === b.appId || a.caseId === b.appId);
  if (!app) return { error: 'রেকর্ড পাওয়া যায়নি' };
  app.jurisdiction = app.jurisdiction || { transfers: [], returns: 0 };
  if (b.action === 'transfer') { app.jurisdiction.transfers.push({ to: b.to || '', at: new Date().toISOString() }); app.audit.push(auditRec(user ? { id: user.id, role: user.role } : { role: 'staff' }, 'jurisdiction-transfer', `→ ${b.to || ''}`)); }
  else if (b.action === 'return') {
    app.jurisdiction.returns++;
    app.jurisdiction.transfers.push({ returnedFrom: b.from || '', reason: b.reason || '', at: new Date().toISOString() });
    app.audit.push(auditRec(user ? { id: user.id, role: user.role } : { role: 'staff' }, 'jurisdiction-return', `${b.from || ''}: ${b.reason || ''}`));
  } else if (b.action === 'resolve') {
    app.jurisdiction.resolved = b.route || ''; app.jurisdiction.returns = 0;
    app.audit.push(auditRec({ id: user && user.id, role: 'dlao' }, 'jurisdiction-resolved', `মানুষের সিদ্ধান্ত: ${b.route || ''}`, PROVENANCE.STAFF));
    app.jurisdiction.resolved.humanDecision = true;
    db.save();
    return { ok: true, jurisdiction: app.jurisdiction, humanAuthority: 'চূড়ান্ত রাউটিং কর্মকর্তা নির্ধারণ করেন' };
  }
  const j = app.jurisdiction;
  const escalated = j.returns >= 2;
  if (escalated) app.audit.push(auditRec({ role: 'system' }, 'jurisdiction-escalated', '২+ রিটার্ন — স্বয়ংক্রিয় এস্কালেশন (T2); সিদ্ধান্ত মানুষের'));
  db.save();
  return { ok: true, jurisdiction: j, escalated, escalation: escalated ? 'সিস্টেম এস্কালেট করেছে — চূড়ান্ত রাউটিং কর্মকর্তার সিদ্ধান্ত (সিস্টেম আইনি সিদ্ধান্ত নেয় না)' : null };
};

server.listen(PORT, () => {
  db.load();
  console.log(`✅ ডিজিটাল আইনগত সহায়তা পোর্টাল চলছে: http://localhost:${PORT}`);
});
