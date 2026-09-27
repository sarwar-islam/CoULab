// ============================================================================
// Legal Resources, Bootstrap, Office Finder, News, Q&A Chat, Complaints & Reports.
// Integrates the 205 legal articles, 49 forms, 68 offices, guide tree & news.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const seed = require('../seed');
const { writeAudit } = require('../services/audit');
const { intakeTurn } = require('../services/ai');

function handleResources(req, res, pathParts, query, body, ctx) {
  const endpoint = pathParts[0];

  // ---------- GET /api/bootstrap ----------
  if (endpoint === 'bootstrap') {
    return {
      categories: seed.CATEGORIES,
      sections: seed.SECTIONS,
      articles: seed.ARTICLES.map(({ body: artBody, ...rest }) => ({ ...rest, bodyLen: artBody ? artBody.length : 0 })),
      offices: seed.OFFICES,
      divisions: seed.DIVISIONS,
      news: seed.NEWS,
      caseTypes: seed.CASE_TYPES,
      guide: seed.GUIDE_TREE,
      eligibility: seed.ELIGIBILITY,
      stages: seed.APPLICATION_STAGES,
      mediationDistricts: seed.MANDATORY_MEDIATION_DISTRICTS
    };
  }

  // ---------- GET /api/article?id=... ----------
  if (endpoint === 'article') {
    const article = seed.ARTICLES.find((a) => a.id === query.id);
    if (!article) return { status: 404, data: { error: 'Article not found' } };
    return { article };
  }

  // ---------- GET /api/form?id=... ----------
  if (endpoint === 'form') {
    const form = seed.FORMS[query.id];
    if (!form) return { status: 404, data: { error: 'Form not found' } };
    return { form };
  }

  // ---------- GET /api/offices?q=... ----------
  if (endpoint === 'offices') {
    const rawQ = (query.q || '').trim();
    const q = rawQ.toLowerCase();
    const div = query.division;
    let list = seed.OFFICES;
    if (div) {
      list = list.filter((o) => o.division === div);
    }
    if (q) {
      const EN_BN_DISTRICTS = {
        'joypurhat': 'জয়পুরহাট', 'dhaka': 'ঢাকা', 'chattogram': 'চট্টগ্রাম', 'chittagong': 'চট্টগ্রাম',
        'khagrachari': 'খাগড়াছড়ি', 'barguna': 'বরগুনা', 'netrokona': 'নেত্রকোনা', 'jhenaidah': 'ঝিনাইদহ',
        'sylhet': 'সিলেট', 'rajshahi': 'রাজশাহী', 'khulna': 'খুলনা', 'barishal': 'বরিশাল',
        'rangpur': 'রংপুর', 'mymensingh': 'ময়মনসিংহ', 'cumilla': 'কুমিল্লা', 'comilla': 'কুমিল্লা',
        'bogura': 'বগুড়া', 'bogra': 'বগুড়া', 'pabna': 'পাবনা', 'sirajganj': 'সিরাজগঞ্জ',
        'natore': 'নাটোর', 'naogaon': 'নওগাঁ', 'coxsbazar': 'কক্সবাজার', 'gazipur': 'গাজীপুর'
      };
      const bnMatch = EN_BN_DISTRICTS[q] || '';
      list = list.filter((o) =>
        (o.district && o.district.toLowerCase().includes(q)) ||
        (o.name && o.name.toLowerCase().includes(q)) ||
        (o.address && o.address.toLowerCase().includes(q)) ||
        (bnMatch && (o.district.includes(bnMatch) || o.name.includes(bnMatch)))
      );
    }
    return { offices: list, total: list.length };
  }

  // ---------- GET /api/news ----------
  if (endpoint === 'news') {
    return { news: seed.NEWS };
  }

  // ---------- POST /api/chat (T5 Conversational Assistant / KB search) ----------
  if (endpoint === 'chat') {
    if (req.method === 'POST') {
      const { message = "", transcript = [], slots = {} } = body;
      
      // First check if query matches a predefined question in KB
      const lower = message.toLowerCase();
      const kbMatch = (seed.CHAT_KB || []).find((item) =>
        item.k && item.k.some((k) => lower.includes(k.toLowerCase()))
      );

      if (kbMatch) {
        return {
          reply: kbMatch.a,
          category: "LEGAL_AID_INFO",
          slots,
          status: "IN_PROGRESS",
          aiAvailable: true
        };
      }

      // Fallback to conversational intake slot extraction & crisis detection
      const turnResult = intakeTurn({
        transcript,
        slots,
        latestUserMessage: message
      });

      return turnResult;
    }
  }

  // ---------- POST /api/complaints (Grievance Filing) ----------
  if (endpoint === 'complaints') {
    if (req.method === 'POST') {
      const { name, phone, against, details, office } = body;
      if (!name || !phone || !details) {
        return { status: 400, data: { error: 'Name, phone, and grievance details are required' } };
      }

      const complaintId = 'CMP-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
      const now = new Date().toISOString();

      const taskId = 'task_' + crypto.randomBytes(8).toString('hex');
      db.run(`
        INSERT INTO Task (id, title, titleBn, type, ownerRole, priority, reason, sourceModule, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        taskId,
        `নাগরিক অভিযোগ — ${complaintId}`,
        `Citizen grievance ${complaintId}`,
        'GRIEVANCE_TRIAGE',
        'ADMIN',
        'HIGH',
        `${name} (${phone}) অভিযোগ দাখিল করেছেন: ${details}`,
        'GRIEVANCE_SERVICE',
        'OPEN',
        now,
        now
      ]);

      const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name, role: "CITIZEN" };
      writeAudit({
        actor,
        channel: "WEB",
        action: "GRIEVANCE_SUBMITTED",
        entityType: "Complaint",
        entityId: complaintId,
        reason: details,
        onWhoseAuthority: name
      });

      return {
        status: 201,
        data: {
          success: true,
          complaintId,
          message: "আপনার অভিযোগ সফলভাবে সংরক্ষিত হয়েছে। প্রশাসন এটি গুরুত্ব সহকারে তদন্ত করবে।"
        }
      };
    }
  }

  // ---------- GET /api/reports ----------
  if (endpoint === 'reports') {
    const stats = {
      totalApplications: db.get('SELECT count(*) as c FROM Application')?.c || 0,
      totalCases: db.get('SELECT count(*) as c FROM "Case"')?.c || 0,
      openCases: db.get("SELECT count(*) as c FROM \"Case\" WHERE status = 'OPEN'")?.c || 0,
      inMediation: db.get("SELECT count(*) as c FROM \"Case\" WHERE status = 'IN_MEDIATION'")?.c || 0,
      lawyerAssigned: db.get("SELECT count(*) as c FROM \"Case\" WHERE status = 'LAWYER_ASSIGNED'")?.c || 0,
      closedCases: db.get("SELECT count(*) as c FROM \"Case\" WHERE status = 'CLOSED'")?.c || 0,
      pilotDistricts: [
        { code: "JOY", name: "Joypurhat", nameBn: "জয়পুরহাট", applications: 18, cases: 12 },
        { code: "JHE", name: "Jhenaidah", nameBn: "ঝিনাইদহ", applications: 14, cases: 9 },
        { code: "KHA", name: "Khagrachari", nameBn: "খাগড়াছড়ি", applications: 11, cases: 7 },
        { code: "BARG", name: "Barguna", nameBn: "বরগুনা", applications: 15, cases: 10 },
        { code: "NET", name: "Netrokona", nameBn: "নেত্রকোনা", applications: 22, cases: 16 }
      ]
    };
    return stats;
  }

  return { status: 404, data: { error: `Resource endpoint not found: ${endpoint}` } };
}

module.exports = { handleResources };
