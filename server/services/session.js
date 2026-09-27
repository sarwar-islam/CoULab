// ============================================================================
// DLAS Session Service (Cookie management, staff login, citizen door tokens).
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { ROLES } = require('../constants');

const SESSION_COOKIE = "dlas_session";
const SESSION_TTL_HOURS = 24;

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createStaffSession(userId) {
  const user = db.get('SELECT * FROM User WHERE id = ?', [userId]);
  if (!user) throw new Error("USER_NOT_FOUND");

  let citizenApplicationId = null;
  if (user.role === ROLES.CITIZEN || user.role === ROLES.REPRESENTATIVE) {
    const consent = db.get(`
      SELECT applicationId FROM Consent
      WHERE representativeUserId = ? AND authorityStatus = 'ACTIVE'
      ORDER BY grantedAt DESC LIMIT 1
    `, [user.id]);
    citizenApplicationId = consent?.applicationId || null;
  }

  const id = 'sess_' + crypto.randomBytes(12).toString('hex');
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3600000).toISOString();

  db.run(`
    INSERT INTO Session (id, token, userId, citizenApplicationId, citizenRole, expiresAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, token, userId, citizenApplicationId, null, expiresAt, now.toISOString()]);

  return { id, token, user, expiresAt };
}

function createCitizenSession(applicationId, citizenRole = "CITIZEN") {
  const id = 'sess_' + crypto.randomBytes(12).toString('hex');
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3600000).toISOString();

  db.run(`
    INSERT INTO Session (id, token, userId, citizenApplicationId, citizenRole, expiresAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, token, null, applicationId, citizenRole, expiresAt, now.toISOString()]);

  return { id, token, citizenApplicationId: applicationId, citizenRole, expiresAt };
}

function getSessionContext(token) {
  if (!token) return null;

  const session = db.get(`
    SELECT s.*, u.username, u.name, u.nameBn, u.role, u.office, u.phone, u.lang
    FROM Session s
    LEFT JOIN User u ON s.userId = u.id
    WHERE s.token = ?
  `, [token]);

  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    db.run('DELETE FROM Session WHERE id = ?', [session.id]);
    return null;
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    role: session.role || session.citizenRole || "CITIZEN",
    name: session.name || "নাগরিক",
    nameBn: session.nameBn || session.name || "নাগরিক",
    username: session.username || null,
    office: session.office || null,
    citizenApplicationId: session.citizenApplicationId || null,
  };
}

module.exports = {
  SESSION_COOKIE,
  parseCookies,
  createStaffSession,
  createCitizenSession,
  getSessionContext,
};
