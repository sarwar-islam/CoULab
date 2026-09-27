// ============================================================================
// ডিজিটাল আইনগত সহায়তা পোর্টাল — DLAS Production Server
// Five Doors, One Record. Integrated Digital Legal Aid System for Bangladesh.
// ============================================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const db = require('./server/db');
const { parseCookies, getSessionContext, SESSION_COOKIE } = require('./server/services/session');

// Route Handlers
const { handleAuth } = require('./server/routes/auth');
const { handleApplications } = require('./server/routes/applications');
const { handleCases } = require('./server/routes/cases');
const { handleContact } = require('./server/routes/contact');
const { handleStatus } = require('./server/routes/status');
const { handleTriage } = require('./server/routes/triage');
const { handleDuplicates } = require('./server/routes/duplicates');
const { handleReferrals } = require('./server/routes/referrals');
const { handleMediation } = require('./server/routes/mediation');
const { handleLawyer } = require('./server/routes/lawyer');
const { handleSync } = require('./server/routes/sync');
const { handleCoverage } = require('./server/routes/coverage');
const { handleAudit } = require('./server/routes/audit');
const { handleDocuments } = require('./server/routes/documents');
const { handleIncidentGroups } = require('./server/routes/incident-groups');
const { handleAttachments } = require('./server/routes/attachments');
const { handleResources } = require('./server/routes/resources');
const { handleAinShohay, currentUser: getAinShohayUser } = require('./server/routes/ain-shohay');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');  const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 20e6) req.destroy(); // 20MB limit
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendResponse(res, statusCode, data, headers = {}) {
  const isJson = typeof data === 'object' && !(data instanceof Buffer);
  const payload = isJson ? JSON.stringify(data) : (data || '');
  const contentType = isJson ? 'application/json; charset=utf-8' : (headers['Content-Type'] || 'text/plain');

  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    ...headers
  });
  res.end(payload);
}

function serveStatic(req, res, pathname) {
  let safePath = path.normalize(pathname).replace(/^([.][.][/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Security check: ensure path stays inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendResponse(res, 403, { error: 'Forbidden' });
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA Fallback: serve index.html for client-side routing
      const indexFile = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFile, (errIdx, content) => {
        if (errIdx) return sendResponse(res, 404, { error: 'File Not Found' });
        sendResponse(res, 200, content, { 'Content-Type': MIME_TYPES['.html'] });
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) return sendResponse(res, 500, { error: 'Failed to read file' });
      sendResponse(res, 200, content, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const base = `http://${req.headers.host || '127.0.0.1'}`;
  const parsedUrl = new URL(req.url, base);
  const pathname = parsedUrl.pathname || '/';
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  // Parse Cookie & Session Context
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[SESSION_COOKIE];
  const ctx = getSessionContext(sessionToken);

  // ---------- API Router (/api/*) ----------
  if (pathname.startsWith('/api')) {
    const apiPath = pathname.replace(/^\/api\/?/, '');
    const parts = apiPath.split('/').filter(Boolean);
    const rootRoute = parts[0] || '';
    const subParts = parts.slice(1);

    // multipart আপলোড (attachments) নিজে বডি পড়ে — এখানে প্রি-পার্স করা যাবে না
  const isMultipart = String(req.headers['content-type'] || '').includes('multipart/form-data');
  const body = (!isMultipart && ['POST', 'PATCH', 'PUT'].includes(req.method)) ? await readBody(req) : {};

    try {
      let result = null;

      switch (rootRoute) {
        case 'auth':
          result = handleAuth(req, res, subParts, query, body, ctx);
          break;
        case 'applications':
          if (subParts.length > 0) {
            result = handleApplications(req, res, subParts, query, body, ctx);
          } else if (req.method === 'POST') {
            if (body.applicantName && body.channel) {
              result = handleApplications(req, res, subParts, query, body, ctx);
            } else {
              result = handleAinShohay(req, res, 'applications', query, body);
            }
          } else if (req.method === 'GET') {
            const aUser = getAinShohayUser(req);
            if (aUser) {
              result = handleAinShohay(req, res, 'applications', query, body);
            } else {
              result = handleApplications(req, res, subParts, query, body, ctx);
            }
          }
          break;
        case 'cases':
          result = handleCases(req, res, subParts, query, body, ctx);
          break;
        case 'contact':
          result = handleContact(req, res, subParts, query, body, ctx);
          break;
        case 'status':
          result = handleStatus(req, res, subParts, query, body, ctx);
          break;
        case 'track':
          if (req.method === 'POST') {
            result = handleAinShohay(req, res, 'track', query, body);
          } else {
            result = handleStatus(req, res, subParts, query, body, ctx);
          }
          break;
        case 'triage':
          if (body && (body.caseId || body.runId) || req.method === 'PATCH') {
            result = handleTriage(req, res, subParts, query, body, ctx);
          } else {
            result = handleAinShohay(req, res, 'triage', query, body);
          }
          break;
        case 'duplicates':
          result = handleDuplicates(req, res, subParts, query, body, ctx);
          break;
        case 'referrals':
          result = handleReferrals(req, res, subParts, query, body, ctx);
          break;
        case 'mediation':
          if (body && body.caseId) {
            result = handleMediation(req, res, parts, query, body, ctx);
          } else {
            result = handleAinShohay(req, res, 'mediation', query, body);
          }
          break;
        case 'settlements':
        case 'signatures':
          result = handleMediation(req, res, parts, query, body, ctx);
          break;
        case 'lawyer':
          if (subParts.length > 0 && subParts[0] === 'assign') {
            result = handleLawyer(req, res, subParts, query, body, ctx);
          } else if (body && body.appId) {
            result = handleAinShohay(req, res, 'lawyer', query, body);
          } else {
            result = handleLawyer(req, res, subParts, query, body, ctx);
          }
          break;
        case 'sync':
          result = handleSync(req, res, subParts, query, body, ctx);
          break;
        case 'coverage':
          result = handleCoverage(req, res);
          break;
        case 'logout':
          // Unified logout — dlas_session ও session দুই কুকিই মুছে দেয়। সেশন
          // টোকেন হাতে পেয়ে Session টেবিল থেকেও ডিলিট করা হয়, তাই কোনোভাবেই
          // পুরনো কুকি দিয়ে আবার ঢোকা যাবে না।
          {
            const rawCookies = parseCookies(req.headers.cookie);
            const staleToken = rawCookies[SESSION_COOKIE] || rawCookies.session;
            if (staleToken) {
              try { db.run('DELETE FROM Session WHERE token = ?', [staleToken]); } catch (e) { /* ignore */ }
            }
            res.setHeader('Set-Cookie', [
              `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
              `session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
            ]);
            result = { ok: true, message: 'Logged out successfully' };
          }
          break;
        case 'audit':
          result = handleAudit(req, res, subParts, query, body, ctx);
          break;
        case 'documents':
          result = handleDocuments(req, res, subParts, query, body, ctx);
          break;
        case 'incident-groups':
          result = handleIncidentGroups(req, res, subParts, query, body, ctx);
          break;
        case 'attachments':
          result = handleAttachments(req, res, subParts, query, body);
          break;
        case 'bootstrap':
        case 'article':
        case 'form':
        case 'sections':
        case 'newsitem':
        case 'offices':
        case 'chat':
          result = handleAinShohay(req, res, rootRoute, query, body);
          break;
        default: {
          const ashRes = handleAinShohay(req, res, rootRoute, query, body);
          if (ashRes !== null) {
            result = ashRes;
          } else {
            result = handleResources(req, res, [rootRoute, ...subParts], query, body, ctx);
          }
        }
      }

      if (res.writableEnded) return;

      if (result && typeof result.status === 'number') {
        return sendResponse(res, result.status, result.data);
      }
      return sendResponse(res, 200, result || { ok: true });
    } catch (err) {
      console.error(`[API Error] ${req.method} ${pathname}:`, err);
      return sendResponse(res, 500, { error: err.message || 'Internal Server Error' });
    }
  }

  // ---------- Static File Serving (/public/*) ----------
  serveStatic(req, res, pathname);
});

// Start Server
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`  আইনসহায় — DLAS (পাঁচ দরজা, এক রেকর্ড / Five Doors, One Record)`);
    console.log(`  সার্ভার চালু হয়েছে: http://localhost:${PORT}`);
    console.log(`  প্রোভাইডার পিন: 1234 (যেমন officer.joypurhat, lawyer.kabir)`);
    console.log(`  নাগরিক ট্র্যাকিং: APP-2026-0001 / 3344 (ময়ূরী আক্তার)`);
    console.log(`  কভারেজ ইনডেক্স: http://localhost:${PORT}/api/coverage`);
    console.log(`================================================================`);
  });
}

module.exports = server;
