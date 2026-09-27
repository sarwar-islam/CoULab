// ============================================================================
// DLAS SQLite Data Spine wrapper using native Node.js node:sqlite (DatabaseSync)
// Zero-dependency, thread-safe, synchronous and blazing fast.
// Auto-creates the full schema on first run and seeds demo records
// (users with PIN 1234 + Part-A style demo applications) so that login,
// application submission, tracking, dashboard and the provider console all
// work immediately after a fresh clone.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'dev.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Open SQLite database. On read-only or locked filesystems (e.g. serverless
// deploys like AWS Lambda /var/task) fall back to an in-memory database so
// every db.get/query/run call keeps working and login never breaks.
let sqlite;
try {
  sqlite = new DatabaseSync(DB_PATH);
} catch (err) {
  console.warn('[DB] Cannot open ' + DB_PATH + ' (' + err.message + ') — using in-memory database.');
  sqlite = new DatabaseSync(':memory:');
}

// Enable WAL mode and foreign keys for high performance & integrity
try {
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
} catch (e) { /* in-memory db: pragmas not needed */ }

const db = {
  raw: sqlite,

  query(sql, params = []) {
    try {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...params);
    } catch (err) {
      console.error('[DB Query Error]', err.message, '\nSQL:', sql, '\nParams:', params);
      throw err;
    }
  },

  all(sql, params = []) {
    return this.query(sql, params);
  },

  get(sql, params = []) {
    try {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...params);
      return row || null;
    } catch (err) {
      console.error('[DB Get Error]', err.message, '\nSQL:', sql, '\nParams:', params);
      throw err;
    }
  },

  run(sql, params = []) {
    try {
      const stmt = sqlite.prepare(sql);
      return stmt.run(...params);
    } catch (err) {
      console.error('[DB Run Error]', err.message, '\nSQL:', sql, '\nParams:', params);
      throw err;
    }
  },

  exec(sql) {
    return sqlite.exec(sql);
  },

  transaction(fn) {
    sqlite.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const result = fn(db);
      sqlite.exec('COMMIT;');
      return result;
    } catch (err) {
      sqlite.exec('ROLLBACK;');
      throw err;
    }
  },

  nextId(prefix) {
    const year = new Date().getFullYear();
    const key = `${prefix}-${year}`;
    let val = 1;

    // Use transaction to atomically increment Counter
    this.transaction(() => {
      const existing = this.get('SELECT value FROM Counter WHERE key = ?', [key]);
      if (existing) {
        val = existing.value + 1;
        this.run('UPDATE Counter SET value = ? WHERE key = ?', [val, key]);
      } else {
        val = 1;
        this.run('INSERT INTO Counter (key, value) VALUES (?, ?)', [key, val]);
      }
    });

    return `${prefix}-${year}-${String(val).padStart(4, '0')}`;
  }
};

// ============================================================================
// Schema — mirrors Backend/prisma/schema.prisma (SQLite dialect).
// ============================================================================
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  nameBn TEXT,
  role TEXT NOT NULL,
  office TEXT,
  phone TEXT,
  lang TEXT DEFAULT 'bn',
  pinHash TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Session (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  userId TEXT,
  citizenApplicationId TEXT,
  citizenRole TEXT,
  expiresAt TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Applicant (
  id TEXT PRIMARY KEY,
  fullName TEXT NOT NULL,
  district TEXT NOT NULL,
  upazila TEXT,
  nidRef TEXT,
  primaryPhone TEXT,
  altPhone TEXT,
  contactNote TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Application (
  id TEXT PRIMARY KEY,
  applicantId TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT DEFAULT 'SUBMITTED',
  caseType TEXT NOT NULL,
  narrative TEXT NOT NULL,
  district TEXT NOT NULL,
  office TEXT NOT NULL,
  language TEXT DEFAULT 'bn',
  urgencyFlag INTEGER DEFAULT 0,
  sensitiveFlag INTEGER DEFAULT 0,
  freeServiceNoticeShown INTEGER DEFAULT 0,
  assistedByUserId TEXT,
  helplineOperatorUserId TEXT,
  intakeSessionId TEXT,
  caseId TEXT,
  rejectionReason TEXT,
  rejectionDecidedByUserId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS "Case" (
  id TEXT PRIMARY KEY,
  applicationId TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'OPEN',
  caseType TEXT NOT NULL,
  office TEXT NOT NULL,
  district TEXT NOT NULL,
  jurisdiction TEXT DEFAULT 'DISTRICT_DLAO',
  priority TEXT DEFAULT 'MEDIUM',
  priorityReason TEXT,
  prioritySource TEXT,
  sensitivity TEXT DEFAULT 'NORMAL',
  incidentGroupId TEXT,
  outcome TEXT,
  closedAt TEXT,
  closedByUserId TEXT,
  acceptedByUserId TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS RecordEntry (
  id TEXT PRIMARY KEY,
  applicationId TEXT,
  caseId TEXT,
  provenance TEXT NOT NULL,
  text TEXT NOT NULL,
  originalText TEXT,
  language TEXT DEFAULT 'bn',
  statedByName TEXT NOT NULL,
  statedByRole TEXT NOT NULL,
  recordedByUserId TEXT,
  channel TEXT NOT NULL,
  kind TEXT DEFAULT 'STATEMENT',
  supersedesEntryId TEXT,
  withdrawn INTEGER DEFAULT 0,
  withdrawnReason TEXT,
  withdrawnAt TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Consent (
  id TEXT PRIMARY KEY,
  applicationId TEXT,
  caseId TEXT,
  scope TEXT NOT NULL,
  scopeDetail TEXT NOT NULL,
  authorityStatus TEXT DEFAULT 'ACTIVE',
  grantedByApplicantId TEXT NOT NULL,
  representativeUserId TEXT,
  representativeName TEXT NOT NULL,
  relationship TEXT NOT NULL,
  channel TEXT NOT NULL,
  grantedAt TEXT DEFAULT (datetime('now')),
  revokedAt TEXT,
  recordedByUserId TEXT
);

CREATE TABLE IF NOT EXISTS ContactRule (
  id TEXT PRIMARY KEY,
  caseId TEXT,
  applicantId TEXT,
  mode TEXT NOT NULL,
  safeNumber TEXT,
  safeTimeWindow TEXT,
  blockedNumbers TEXT DEFAULT '[]',
  neutralWording INTEGER DEFAULT 1,
  reason TEXT NOT NULL,
  createdByUserId TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS ContactAttempt (
  id TEXT PRIMARY KEY,
  caseId TEXT,
  applicationId TEXT,
  attemptedNumber TEXT NOT NULL,
  attemptType TEXT NOT NULL,
  claimedIdentity TEXT,
  outcome TEXT NOT NULL,
  notes TEXT,
  attemptedByUserId TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Task (
  id TEXT PRIMARY KEY,
  caseId TEXT,
  applicationId TEXT,
  title TEXT NOT NULL,
  titleBn TEXT,
  type TEXT NOT NULL,
  ownerRole TEXT NOT NULL,
  ownerUserId TEXT,
  dueAt TEXT,
  status TEXT DEFAULT 'OPEN',
  priority TEXT DEFAULT 'MEDIUM',
  reason TEXT,
  sourceModule TEXT,
  completedByUserId TEXT,
  completedAt TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS Notification (
  id TEXT PRIMARY KEY,
  caseId TEXT,
  applicationId TEXT,
  targetRole TEXT,
  targetUserId TEXT,
  channel TEXT NOT NULL,
  message TEXT NOT NULL,
  neutralWording INTEGER DEFAULT 0,
  status TEXT DEFAULT 'SENT',
  relatedModule TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS DocumentRecord (
  id TEXT PRIMARY KEY,
  applicationId TEXT,
  caseId TEXT,
  title TEXT NOT NULL,
  docType TEXT NOT NULL,
  mimeType TEXT,
  dataUrl TEXT,
  textContent TEXT,
  sourceNote TEXT,
  provenance TEXT NOT NULL,
  uploadedByUserId TEXT,
  uploadedByName TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  isCurrent INTEGER DEFAULT 1,
  status TEXT DEFAULT 'CURRENT',
  sensitivity TEXT DEFAULT 'NORMAL',
  checksum TEXT,
  aiBriefing TEXT,
  qualityFlags TEXT DEFAULT '[]',
  incidentGroupId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS ChecklistTemplate (
  id TEXT PRIMARY KEY,
  caseType TEXT UNIQUE,
  itemsJson TEXT NOT NULL,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS AuditEntry (
  id TEXT PRIMARY KEY,
  actorUserId TEXT,
  actorName TEXT NOT NULL,
  actorRole TEXT NOT NULL,
  channel TEXT NOT NULL,
  action TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  caseId TEXT,
  applicationId TEXT,
  before TEXT,
  after TEXT,
  reason TEXT,
  onWhoseAuthority TEXT,
  metadataJson TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Referral (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  kind TEXT DEFAULT 'REFERRAL',
  fromOffice TEXT NOT NULL,
  toOffice TEXT NOT NULL,
  reason TEXT NOT NULL,
  historySummary TEXT NOT NULL,
  documentIdsJson TEXT DEFAULT '[]',
  responsibleActor TEXT NOT NULL,
  expectedAction TEXT NOT NULL,
  deadline TEXT NOT NULL,
  ackStatus TEXT DEFAULT 'SENT',
  ackReason TEXT,
  ackAt TEXT,
  ackDeadline TEXT NOT NULL,
  returnCount INTEGER DEFAULT 0,
  escalationLevel INTEGER DEFAULT 0,
  finalRouteDecisionByUserId TEXT,
  finalRouteDecision TEXT,
  sensitive INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS LawyerAssignment (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  lawyerUserId TEXT NOT NULL,
  status TEXT DEFAULT 'PROPOSED',
  assignedAt TEXT DEFAULT (datetime('now')),
  acceptedAt TEXT,
  declinedReason TEXT,
  stage TEXT DEFAULT 'PRE_LITIGATION',
  paymentStatus TEXT DEFAULT 'NOT_DUE',
  paymentNote TEXT,
  lastUpdateAt TEXT,
  inactivityFlaggedAt TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS Hearing (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  lawyerAssignmentId TEXT,
  hearingDate TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT DEFAULT 'SCHEDULED',
  notes TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS LawyerUpdate (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  lawyerAssignmentId TEXT NOT NULL,
  text TEXT NOT NULL,
  submittedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS LawyerChangeRequest (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  requestedByName TEXT NOT NULL,
  requestedByRole TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'SUBMITTED',
  reviewedByUserId TEXT,
  reviewNotes TEXT,
  reviewDecision TEXT,
  decidedAt TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS MediationSession (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  mediatorUserId TEXT NOT NULL,
  scheduledAt TEXT NOT NULL,
  mode TEXT DEFAULT 'IN_PERSON',
  locationOrLink TEXT NOT NULL,
  partyAName TEXT NOT NULL,
  partyBName TEXT NOT NULL,
  attendanceJson TEXT DEFAULT '{}',
  status TEXT DEFAULT 'SCHEDULED',
  outcome TEXT,
  outcomeDetails TEXT,
  inPersonFallbackReason TEXT,
  noticesJson TEXT DEFAULT '[]',
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS SettlementDraft (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  mediationSessionId TEXT,
  templateType TEXT NOT NULL,
  mediatorNotes TEXT NOT NULL,
  draftText TEXT NOT NULL,
  aiSegmentsJson TEXT DEFAULT '[]',
  warningsJson TEXT DEFAULT '[]',
  status TEXT DEFAULT 'DRAFT',
  reviewedByUserId TEXT,
  reviewNotes TEXT,
  finalizedText TEXT,
  version INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS SignatureSession (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  settlementDraftId TEXT NOT NULL,
  documentHash TEXT NOT NULL,
  docVersion INTEGER NOT NULL,
  partiesJson TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS SignatureRecord (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  partyName TEXT NOT NULL,
  partyRole TEXT NOT NULL,
  signatureHash TEXT,
  nonce TEXT NOT NULL,
  signedAt TEXT,
  method TEXT DEFAULT 'ONLINE',
  syncStatus TEXT DEFAULT 'SYNCED',
  verified INTEGER,
  verifiedAt TEXT,
  verifyResult TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS IncidentGroup (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  incidentDate TEXT,
  location TEXT,
  description TEXT NOT NULL,
  createdById TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS DuplicateCandidate (
  id TEXT PRIMARY KEY,
  applicationAId TEXT NOT NULL,
  applicationBId TEXT NOT NULL,
  score INTEGER NOT NULL,
  matchedFieldsJson TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  reviewedByUserId TEXT,
  reviewNotes TEXT,
  decidedAt TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS TriageRun (
  id TEXT PRIMARY KEY,
  caseId TEXT,
  applicationId TEXT,
  categoryResultJson TEXT NOT NULL,
  complianceResultJson TEXT NOT NULL,
  orchestrationResultJson TEXT NOT NULL,
  conflictsDetected INTEGER DEFAULT 0,
  finalRecommendation TEXT NOT NULL,
  status TEXT DEFAULT 'RECOMMENDED',
  decision TEXT,
  humanDecisionByUserId TEXT,
  humanDecisionReason TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS OfflineSyncRecord (
  id TEXT PRIMARY KEY,
  tempUuid TEXT UNIQUE NOT NULL,
  deviceId TEXT NOT NULL,
  payloadType TEXT NOT NULL,
  payloadJson TEXT NOT NULL,
  integrityHash TEXT NOT NULL,
  status TEXT DEFAULT 'QUEUED',
  conflictWithId TEXT,
  resolution TEXT,
  syncedAt TEXT,
  syncedEntityId TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS IntakeSession (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  language TEXT DEFAULT 'bn',
  citizenName TEXT,
  slotsJson TEXT DEFAULT '{}',
  transcriptJson TEXT DEFAULT '[]',
  status TEXT DEFAULT 'IN_PROGRESS',
  sensitiveFlag INTEGER DEFAULT 0,
  handoffReason TEXT,
  operatorUserId TEXT,
  applicationId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS SensitiveAccessLog (
  id TEXT PRIMARY KEY,
  caseId TEXT,
  documentId TEXT,
  accessedByUserId TEXT NOT NULL,
  actorRole TEXT NOT NULL,
  purpose TEXT,
  accessedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Counter (
  key TEXT PRIMARY KEY,
  value INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_application_status ON Application(status);
CREATE INDEX IF NOT EXISTS idx_application_applicant ON Application(applicantId);
CREATE INDEX IF NOT EXISTS idx_case_application ON "Case"(applicationId);
CREATE INDEX IF NOT EXISTS idx_record_application ON RecordEntry(applicationId);
CREATE INDEX IF NOT EXISTS idx_session_token ON Session(token);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON AuditEntry(entityType, entityId);
`;

// ============================================================================
// Demo seed — runs once when the database is empty.
// Demo PIN for every staff account: 1234  (hash = sha256('dlas-demo:1234'))
// ============================================================================
function seedIfEmpty() {
  const existing = sqlite.prepare("SELECT count(*) as cnt FROM User").get();
  if (existing && existing.cnt > 0) return;

  console.log('[DB] Empty database — creating schema + demo seed…');
  sqlite.exec(SCHEMA_SQL);

  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const PIN = sha('dlas-demo:1234');
  const now = Date.now();
  const day = 86400000;
  const iso = (d) => new Date(d).toISOString();
  const rnd = () => crypto.randomBytes(8).toString('hex');

  try {
    sqlite.exec('BEGIN IMMEDIATE TRANSACTION;');

    // ---- Staff / representative users (demo PIN 1234) ----
    const users = [
      ['officer.joypurhat', 'Rahima Khatun', 'রহিমা খাতুন', 'DLAO_OFFICER', 'জেলা আইনি সহায়তা কার্যালয়, জয়পুরহাট'],
      ['officer.jhenaidah', 'Mahmudul Hasan', 'মাহমুদুল হাসান', 'DLAO_OFFICER', 'জেলা আইনি সহায়তা কার্যালয়, ঝিনাইদহ'],
      ['officer.barguna', 'Arif Chowdhury', 'আরিফ চৌধুরী', 'DLAO_OFFICER', 'জেলা আইনি সহায়তা কার্যালয়, বরগুনা'],
      ['mediator.joypurhat', 'Nasrin Sultana', 'নাসরিন সুলতানা', 'MEDIATOR', 'জেলা আইনি সহায়তা কার্যালয়, জয়পুরহাট'],
      ['helpline.agent1', 'Farid Mia', 'ফরিদ মিয়া', 'HELPLINE', '১৬৬৯৯ হেল্পলাইন'],
      ['udc.khagrachari', 'Joyonto Chakma', 'জয়ন্ত চাকমা', 'UDC', 'ইউনিয়ন ডিজিটাল সেন্টার, খাগড়াছড়ি'],
      ['lawyer.shahana', 'Adv. Shahana Akter', 'অ্যাডভোকেট শাহানা আক্তার', 'LAWYER', 'জয়পুরহাট জেলা আদালত'],
      ['lawyer.kabir', 'Adv. Kabir Hossain', 'অ্যাডভোকেট কবির হোসেন', 'LAWYER', 'বরগুনা জেলা আদালত'],
      ['receiving.dhaka', 'Tanvir Ahmed', 'তানভীর আহমেদ', 'RECEIVING_DLAO', 'জেলা আইনি সহায়তা কার্যালয়, ঢাকা'],
      ['support.staff1', 'Salma Parvin', 'সালমা পারভীন', 'CASE_SUPPORT', 'জেলা আইনি সহায়তা কার্যালয়, জয়পুরহাট'],
      ['admin', 'System Administrator', 'সিস্টেম প্রশাসক', 'ADMIN', 'ডিবিএলএ'],
      ['ripon.rep', 'Ripon Akter', 'রিপন আক্তার', 'REPRESENTATIVE', 'জয়পুরহাট'],
    ];
    const uid = {};
    for (const [username, name, nameBn, role, office] of users) {
      const id = 'usr_' + rnd();
      uid[username] = id;
      sqlite.prepare(`INSERT INTO User (id, username, name, nameBn, role, office, pinHash, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`)
        .run(id, username, name, nameBn, role, office, PIN, iso(now));
    }

    // ---- Helper: applicant + application ----
    const mkApplicant = (fullName, district, phone, nidRef, note) => {
      const id = 'applc_' + rnd();
      sqlite.prepare(`INSERT INTO Applicant (id, fullName, district, primaryPhone, nidRef, contactNote, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, fullName, district, phone, nidRef || null, note || null, iso(now));
      return id;
    };
    const mkApplication = (seq, applicantId, opts) => {
      const id = `APP-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
      sqlite.prepare(`INSERT INTO Application (id, applicantId, channel, status, caseType, narrative, district, office, urgencyFlag, sensitiveFlag, freeServiceNoticeShown, helplineOperatorUserId, assistedByUserId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, applicantId, opts.channel, opts.status || 'SUBMITTED', opts.caseType, opts.narrative, opts.district,
          opts.office || `জেলা আইনি সহায়তা কার্যালয়, ${opts.district}`,
          opts.urgent ? 1 : 0, opts.sensitive ? 1 : 0,
          (opts.channel === 'ASSISTED_UDC' || opts.channel === 'HELPLINE') ? 1 : 0,
          opts.helpline ? uid[opts.helpline] : null, opts.udc ? uid[opts.udc] : null,
          iso(now - (opts.daysAgo || 2) * day), iso(now));
      sqlite.prepare(`INSERT INTO RecordEntry (id, applicationId, provenance, text, language, statedByName, statedByRole, channel, kind, createdAt)
        VALUES (?, ?, ?, ?, 'bn', ?, ?, ?, 'STATEMENT', ?)`)
        .run('rec_' + rnd(), id, opts.provenance, opts.narrative, opts.statedByName || 'নাগরিক',
          opts.statedByRole || 'APPLICANT', opts.channel, iso(now - (opts.daysAgo || 2) * day));
      return id;
    };

    // ---- A1 Moyuri (Joypurhat) — safe contact, sensitive, converted to case ----
    const moyuriApplicant = mkApplicant('Moyuri Akter', 'জয়পুরহাট', '01711223344', null, 'আবেদনকারীর নিজের বাটন-ফোন; দিনে স্বামী ফোন নিয়ন্ত্রণ করেন');
    const moyuriApp = mkApplication(1, moyuriApplicant, {
      channel: 'HELPLINE', caseType: 'DOMESTIC_VIOLENCE', district: 'জয়পুরহাট',
      narrative: 'স্বামী দিনের বেলা তাঁর ফোন নিয়ন্ত্রণ করেন ও হুমকি দেন। তাঁর নিজের ভাষায় এখনো কার্যালয় শোনেনি — ভাই ১৬৬৯৯-এ কথা বলেছেন।',
      provenance: 'REPRESENTATIVE_REPORTED', statedByName: 'রিপন আক্তার (ভাই, প্রতিনিধি)', statedByRole: 'REPRESENTATIVE',
      helpline: 'helpline.agent1', sensitive: true, urgent: true, daysAgo: 7,
    });
    const moyuriCase = 'CASE-' + new Date().getFullYear() + '-0001';
    sqlite.prepare(`INSERT INTO "Case" (id, applicationId, status, caseType, office, district, priority, priorityReason, prioritySource, sensitivity, acceptedByUserId, createdAt, updatedAt)
      VALUES (?, ?, 'OPEN', ?, ?, ?, 'URGENT', 'গ্রহণের সময় কর্মকর্তার প্রাথমিক মূল্যায়ন', 'OFFICER_DECISION', 'SENSITIVE', ?, ?, ?)`)
      .run(moyuriCase, moyuriApp, 'DOMESTIC_VIOLENCE', 'জেলা আইনি সহায়তা কার্যালয়, জয়পুরহাট', 'জয়পুরহাট', uid['officer.joypurhat'], iso(now - 5 * day), iso(now));
    sqlite.prepare(`UPDATE Application SET status = 'CONVERTED_TO_CASE', caseId = ? WHERE id = ?`).run(moyuriCase, moyuriApp);

    sqlite.prepare(`INSERT INTO ContactRule (id, caseId, mode, safeNumber, safeTimeWindow, blockedNumbers, neutralWording, reason, createdByUserId, active, createdAt)
      VALUES (?, ?, 'ALLOW_ONLY', '01711223344', '14:00-17:00', '["01899887766"]', 1, 'স্বামী অনিরাপদ ব্যক্তি — শুধু আবেদনকারীর নিজের নম্বরে, বিকাল ২টা–৫টার নিরাপদ সময়ে, নিরপেক্ষ বার্তায় যোগাযোগ করা যাবে', ?, 1, ?)`)
      .run('rule_' + rnd(), moyuriCase, uid['officer.joypurhat'], iso(now - 5 * day));
    sqlite.prepare(`INSERT INTO ContactAttempt (id, caseId, attemptedNumber, attemptType, claimedIdentity, outcome, notes, createdAt) VALUES (?, ?, '01899887766', 'CALL', 'স্বামী (অনিরাপদ)', 'BLOCKED_UNSAFE', 'নিরাপদ যোগাযোগ নিয়ম অনুযায়ী প্রতিহত', ?)`).run('att_' + rnd(), moyuriCase, iso(now - 4 * day));
    sqlite.prepare(`INSERT INTO ContactAttempt (id, caseId, attemptedNumber, attemptType, claimedIdentity, outcome, notes, createdAt) VALUES (?, ?, '01711223344', 'IVR', 'ময়ূরী আক্তার', 'COMPLETED', 'নিরাপদ সময়সীমার মধ্যে সফল যোগাযোগ', ?)`).run('att_' + rnd(), moyuriCase, iso(now - 3 * day));
    sqlite.prepare(`INSERT INTO Consent (id, applicationId, scope, scopeDetail, authorityStatus, grantedByApplicantId, representativeUserId, representativeName, relationship, channel, grantedAt)
      VALUES (?, ?, 'REPRESENTATION', 'ভাই রিপন শুধুমাত্র আবেদন জানাতে ও অবস্থা জানতে পারবেন; সিদ্ধান্ত নেবেন না', 'ACTIVE', ?, ?, 'রিপন আক্তার (ভাই)', 'ভাই', 'VOICE_IVR', ?)`)
      .run('cons_' + rnd(), moyuriApp, moyuriApplicant, uid['ripon.rep'], iso(now - 6 * day));
    sqlite.prepare(`INSERT INTO Task (id, caseId, title, type, ownerRole, priority, reason, sourceModule, status, createdAt) VALUES (?, ?, 'নিরাপদ যোগাযোগ নিয়ম পর্যালোচনা (A1)', 'SAFETY_REVIEW', 'DLAO_OFFICER', 'HIGH', 'সংবেদনশীল কেস — নিরাপদ যোগাযোগ সক্রিয়', 'SAFE_CONTACT', 'OPEN', ?)`)
      .run('task_' + rnd(), moyuriCase, iso(now - 4 * day));

    // ---- A3 Nabila (Jhenaidah) — urgent, restricted, referral pending ack ----
    const nabilaApplicant = mkApplicant('Nabila Khatun', 'ঝিনাইদহ', '01822334455');
    const nabilaApp = mkApplication(2, nabilaApplicant, {
      channel: 'WEB', caseType: 'CYBER_HARASSMENT', district: 'ঝিনাইদহ',
      narrative: 'পুরাতন সহপাঠী ভুয়া/পরিবর্তিত ছবি ছড়িয়ে চাপ সৃষ্টি করছে। ক্ষতি বিস্তার লাভ করছে; কিছু প্রতিকারের জন্য অন্য সক্ষম কর্তৃপক্ষের প্রয়োজন হতে পারে।',
      provenance: 'APPLICANT_CONFIRMED', sensitive: true, urgent: true, daysAgo: 3,
    });
    const nabilaCase = 'CASE-' + new Date().getFullYear() + '-0002';
    sqlite.prepare(`INSERT INTO "Case" (id, applicationId, status, caseType, office, district, priority, priorityReason, prioritySource, sensitivity, acceptedByUserId, createdAt, updatedAt)
      VALUES (?, ?, 'OPEN', ?, ?, ?, 'URGENT', 'গ্রহণের সময় কর্মকর্তার প্রাথমিক মূল্যায়ন', 'OFFICER_DECISION', 'RESTRICTED', ?, ?, ?)`)
      .run(nabilaCase, nabilaApp, 'CYBER_HARASSMENT', 'জেলা আইনি সহায়তা কার্যালয়, ঝিনাইদহ', 'ঝিনাইদহ', uid['officer.jhenaidah'], iso(now - 3 * day), iso(now));
    sqlite.prepare(`UPDATE Application SET status = 'CONVERTED_TO_CASE', caseId = ? WHERE id = ?`).run(nabilaCase, nabilaApp);
    sqlite.prepare(`INSERT INTO Referral (id, caseId, kind, fromOffice, toOffice, reason, historySummary, responsibleActor, expectedAction, deadline, ackStatus, ackDeadline, sensitive, createdAt)
      VALUES (?, ?, 'REFERRAL', 'জেলা আইনি সহায়তা কার্যালয়, ঝিনাইদহ', 'সাইবার ট্রাইব্যুনাল পথ (রেফারেল) — ঢাকা', 'ভুয়া/পরিবর্তিত ছবি বিস্তার — সাইবার-অপরাধ সংশ্লিষ্ট সক্ষম কর্তৃপক্ষের প্রয়োজন', 'আবেদন, জরুরি পতাকা, সংবেদনশীল প্রমাণ-প্যাকেজ সংরক্ষিত', 'গ্রহণকারী কর্তৃপক্ষের দায়িত্বপ্রাপ্ত কর্মকর্তা', '৩ কার্যদিবসের মধ্যে স্বীকৃতি', ?, 'SENT', ?, 1, ?)`)
      .run('ref_' + rnd(), nabilaCase, iso(now + 21 * day), iso(now - 1 * day), iso(now - 2 * day));
    sqlite.prepare(`INSERT INTO Task (id, caseId, title, type, ownerRole, priority, dueAt, reason, sourceModule, status, createdAt) VALUES (?, ?, 'স্বীকৃতি পাওয়া যায়নি — সাইবার ট্রাইব্যুনাল পথ', 'REFERRAL_ACK', 'DLAO_OFFICER', 'HIGH', ?, 'স্বীকৃতির সময়সীমা অতিক্রান্ত — অনুসরণ সতর্কতা (A3)', 'REFERRAL_FOLLOWUP', 'OVERDUE', ?)`)
      .run('task_' + rnd(), nabilaCase, iso(now - 1 * day), iso(now - 1 * day));

    // ---- A4 Nuching (Khagrachari) — UDC assisted, translation provenance ----
    const nuchingApplicant = mkApplicant('Nuching Marma', 'খাগড়াছড়ি', '01933445566', null, 'নম্বরটি ইউডিসি উদ্যোক্তার');
    const nuchingApp = mkApplication(3, nuchingApplicant, {
      channel: 'ASSISTED_UDC', caseType: 'LAND_DISPUTE', district: 'খাগড়াছড়ি',
      narrative: 'পাহাড়ি জমির দখল নিয়ে বিরোধ। (মারমা ভাষায় বলা বিবরণের বাংলা অনুবাদ — ইউডিসি উদ্যোক্তা টাইপ করেছেন)',
      provenance: 'INTERMEDIARY_TRANSLATED', statedByName: 'নুচিং মারমা', statedByRole: 'INTERMEDIARY',
      udc: 'udc.khagrachari', daysAgo: 4,
    });
    sqlite.prepare(`INSERT INTO Consent (id, applicationId, scope, scopeDetail, authorityStatus, grantedByApplicantId, representativeUserId, representativeName, relationship, channel, grantedAt)
      VALUES (?, ?, 'ASSISTED_INTAKE', 'ইউডিসি উদ্যোক্তা আবেদনপত্র টাইপ/ছবি তোলায় সহায়তা করেছেন; নুচিং সম্মতি দিয়েছেন', 'ACTIVE', ?, ?, 'জয়ন্ত চাকমা (ইউডিসি উদ্যোক্তা)', 'সহায়তাকারী', 'ASSISTED_UDC', ?)`)
      .run('cons_' + rnd(), nuchingApp, nuchingApplicant, uid['udc.khagrachari'], iso(now - 4 * day));

    // ---- A5 Malek (Barguna) — long-running, lawyer overdue ----
    const malekApplicant = mkApplicant('Abdul Malek', 'বরগুনা', '01655667788', null, 'নম্বরটি দোকানের — আবেদনকারীর নিজের নয়');
    const malekApp = mkApplication(4, malekApplicant, {
      channel: 'DLAO_WALKIN', caseType: 'LABOUR_WAGES', district: 'বরগুনা',
      narrative: 'বকেয়া মজুরির মামলা; হিয়ারিংয়ের তারিখ অনানুষ্ঠানিকভাবে জানা যায়; ভ্রমণে দৈনিক মজুরি নষ্ট হয়; প্যানেল আইনজীবীর হালনাগাদ পাওয়া যায় না।',
      provenance: 'STAFF_ENTERED', statedByRole: 'STAFF', daysAgo: 210,
    });
    const malekCase = 'CASE-' + new Date().getFullYear() + '-0003';
    sqlite.prepare(`INSERT INTO "Case" (id, applicationId, status, caseType, office, district, priority, priorityReason, prioritySource, sensitivity, acceptedByUserId, createdAt, updatedAt)
      VALUES (?, ?, 'LAWYER_ASSIGNED', ?, ?, ?, 'HIGH', 'গ্রহণের সময় কর্মকর্তার প্রাথমিক মূল্যায়ন', 'OFFICER_DECISION', 'NORMAL', ?, ?, ?)`)
      .run(malekCase, malekApp, 'LABOUR_WAGES', 'জেলা আইনি সহায়তা কার্যালয়, বরগুনা', 'বরগুনা', uid['officer.barguna'], iso(now - 200 * day), iso(now));
    sqlite.prepare(`UPDATE Application SET status = 'CONVERTED_TO_CASE', caseId = ? WHERE id = ?`).run(malekCase, malekApp);
    const malekAssign = 'la_' + rnd();
    sqlite.prepare(`INSERT INTO LawyerAssignment (id, caseId, lawyerUserId, status, assignedAt, acceptedAt, stage, lastUpdateAt, createdAt)
      VALUES (?, ?, ?, 'ACCEPTED', ?, ?, 'HEARING', ?, ?)`)
      .run(malekAssign, malekCase, uid['lawyer.kabir'], iso(now - 200 * day), iso(now - 200 * day), iso(now - 45 * day), iso(now - 200 * day));
    sqlite.prepare(`INSERT INTO Hearing (id, caseId, lawyerAssignmentId, hearingDate, location, status, createdAt) VALUES (?, ?, ?, ?, 'বরগুনা জেলা আদালত', 'SCHEDULED', ?)`)
      .run('hear_' + rnd(), malekCase, malekAssign, iso(now + 5 * day), iso(now - 60 * day));
    sqlite.prepare(`INSERT INTO Task (id, caseId, title, type, ownerRole, ownerUserId, dueAt, status, priority, reason, sourceModule, createdAt)
      VALUES (?, ?, 'হিয়ারিং-পূর্ব হালনাগাদ জমা দিন', 'LAWYER_UPDATE', 'LAWYER', ?, ?, 'OVERDUE', 'HIGH', 'হিয়ারিংয়ের ২ দিন আগে হালনাগাদ জমা হয়নি (A5 failure test)', 'B5', ?)`)
      .run('task_' + rnd(), malekCase, uid['lawyer.kabir'], iso(now - 2 * day), iso(now - 10 * day));

    // ---- Counters ----
    const year = new Date().getFullYear();
    sqlite.prepare(`INSERT INTO Counter (key, value) VALUES (?, ?)`).run(`APP-${year}`, 4);
    sqlite.prepare(`INSERT INTO Counter (key, value) VALUES (?, ?)`).run(`CASE-${year}`, 3);

    sqlite.exec('COMMIT;');
    console.log('[DB] Demo seed complete — 12 users (PIN 1234), 4 applications, 3 cases.');
  } catch (err) {
    try { sqlite.exec('ROLLBACK;'); } catch (e) { /* ignore */ }
    console.error('[DB] Seed failed:', err.message);
    console.error(err.stack);
  }
}

// Auto-create schema (idempotent) then seed if empty.
sqlite.exec(SCHEMA_SQL);
try {
  seedIfEmpty();
} catch (err) {
  console.error('[DB] Init error:', err.message);
}

module.exports = db;
