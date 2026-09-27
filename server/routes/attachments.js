// ============================================================================
// Attachment (Evidence File) Upload — /api/attachments
// নাগরিক আবেদনের সাথে ছবি/ভিডিও/পিডিএফ সংযুক্তি জমা দেয়। ফাইলগুলো ডিস্কে
// data/uploads/<appId>/ ফোল্ডারে সংরক্ষিত হয় এবং JSON স্টোরের আবেদন রেকর্ডে
// metadata (documents[] অ্যারে) হিসেবে যুক্ত হয় — ট্র্যাকিং পেজে দেখা যায়।
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('../app-db');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'data', 'uploads');
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB per file
const ALLOWED_EXT = { '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image', '.heic': 'image', '.pdf': 'pdf', '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.mp3': 'audio', '.m4a': 'audio', '.wav': 'audio', '.doc': 'doc', '.docx': 'doc' };

function safeName(name) {
  const ext = path.extname(name || '').toLowerCase().slice(0, 8);
  return Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + ext;
}

// Minimal multipart/form-data parser (single-field files + text fields)
function parseMultipart(buf, boundary) {
  const parts = [];
  const delim = Buffer.from('--' + boundary);
  let idx = buf.indexOf(delim);
  while (idx !== -1) {
    const next = buf.indexOf(delim, idx + delim.length);
    if (next === -1) break;
    let chunk = buf.slice(idx + delim.length, next);
    // strip leading CRLF
    if (chunk[0] === 13 && chunk[1] === 10) chunk = chunk.slice(2);
    // strip trailing CRLF
    if (chunk[chunk.length - 2] === 13 && chunk[chunk.length - 1] === 10) chunk = chunk.slice(0, -2);
    const headerEnd = chunk.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerStr = chunk.slice(0, headerEnd).toString('utf8');
      const body = chunk.slice(headerEnd + 4);
      const nameM = headerStr.match(/name="([^"]*)"/);
      const fileM = headerStr.match(/filename="([^"]*)"/);
      const typeM = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
      parts.push({
        name: nameM ? nameM[1] : '',
        filename: fileM ? fileM[1] : null,
        contentType: typeM ? typeM[1].trim() : null,
        data: body
      });
    }
    idx = next;
  }
  return parts;
}

function handleAttachments(req, res, pathParts, query, body) {
  // ---------- POST /api/attachments (multipart/form-data) ----------
  if (req.method === 'POST') {
    const contentType = String(req.headers['content-type'] || '');
    const bm = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!contentType.includes('multipart/form-data') || !bm) {
      return { status: 400, data: { error: 'multipart/form-data প্রয়োজন' } };
    }
    const boundary = (bm[1] || bm[2]).trim();

    return new Promise((resolve) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_FILE_BYTES * 4) { req.destroy(); resolve({ status: 413, data: { error: 'ফাইল খুব বড়' } }); }
        chunks.push(c);
      });
      req.on('end', () => {
        try {
          const buf = Buffer.concat(chunks);
          const parts = parseMultipart(buf, boundary);
          const appId = (parts.find((p) => p.name === 'appId') || {}).data;
          const appItemId = (parts.find((p) => p.name === 'itemAppId') || {}).data;
          const ownerLast4 = (parts.find((p) => p.name === 'last4') || {}).data;
          const files = parts.filter((p) => p.filename && p.data && p.data.length);

          if (!files.length) return resolve({ status: 400, data: { error: 'কোনো ফাইল পাওয়া যায়নি' } });

          // আবেদন রেকর্ড শনাক্ত (JSON স্টোরে থাকলে documents[]-এ যোগ হবে)
          const targetId = ((appId || appItemId || '') + '').toString();
          let jdb = null;
          try { jdb = db.load(); } catch (e) {}
          const appRec = jdb && targetId ? (jdb.applications || []).find((a) => String(a.appId).toUpperCase() === targetId.toUpperCase()) : null;

          const folder = targetId ? targetId.replace(/[^\w.-]+/g, '_') : 'misc';
          const dir = path.join(UPLOAD_ROOT, folder);
          fs.mkdirSync(dir, { recursive: true });

          const saved = [];
          for (const f of files) {
            const ext = path.extname(f.filename || '').toLowerCase();
            const kind = ALLOWED_EXT[ext] || (f.contentType || '').startsWith('video/') ? (ALLOWED_EXT[ext] || 'doc') : (ALLOWED_EXT[ext] || 'doc');
            if (!ALLOWED_EXT[ext]) {
              return resolve({ status: 400, data: { error: `অসমর্থিত ফাইল টাইপ: ${ext || 'unknown'} — ছবি, PDF, ভিডিও বা অডিও দিন` } });
            }
            if (f.data.length > MAX_FILE_BYTES) {
              return resolve({ status: 400, data: { error: `${f.filename} ফাইলটি ২৫ মেগাবাইটের বেশি` } });
            }
            const stored = safeName(f.filename);
            fs.writeFileSync(path.join(dir, stored), f.data);
            const meta = {
              id: 'att_' + crypto.randomBytes(6).toString('hex'),
              name: (f.filename || 'ফাইল').slice(0, 120),
              stored,
              kind: ALLOWED_EXT[ext],
              size: f.data.length,
              mime: f.contentType || '',
              url: `/data/uploads/${encodeURIComponent(folder)}/${encodeURIComponent(stored)}`,
              uploadedAt: new Date().toISOString()
            };
            saved.push(meta);
            // JSON স্টোরের আবেদন রেকর্ডে যুক্ত করি (ট্র্যাকিং পেজ এখান থেকেই দেখায়)
            if (appRec) {
              appRec.documents = appRec.documents || [];
              appRec.documents.push(meta);
              appRec.audit = appRec.audit || [];
              appRec.audit.push({
                at: meta.uploadedAt,
                action: 'document-attached',
                actor: 'applicant',
                detail: meta.name
              });
            }
          }
          if (appRec) { try { db.save(); } catch (e) {} }

          return resolve({
            ok: true,
            uploaded: saved.length,
            files: saved,
            folder: `data/uploads/${folder}`,
            note: ownerLast4 ? undefined : undefined
          });
        } catch (e) {
          return resolve({ status: 500, data: { error: e.message || 'আপলোড ব্যর্থ' } });
        }
      });
      req.on('error', () => resolve({ status: 500, data: { error: 'আপলোড ব্যর্থ' } }));
    });
  }

  // ---------- GET /api/attachments?appId=... ----------
  if (req.method === 'GET' && query.appId) {
    let jdb = null;
    try { jdb = db.load(); } catch (e) {}
    const appRec = jdb ? (jdb.applications || []).find((a) => String(a.appId).toUpperCase() === String(query.appId).toUpperCase()) : null;
    return { files: (appRec && appRec.documents) || [] };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleAttachments, UPLOAD_ROOT };
