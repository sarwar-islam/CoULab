import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { STAFF_ROLES, ROLES } from "@/lib/constants";

export const SESSION_COOKIE = "dlas_session";
const SESSION_TTL_HOURS = 12;

export interface SessionContext {
  sessionId: string;
  userId?: string;
  role: string;
  name: string;
  office?: string | null;
  /** scope-limited citizen access: only this application is visible */
  citizenApplicationId?: string;
}

function newToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

/** Create a staff session (username + demo PIN login). */
export async function createStaffSession(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("USER_NOT_FOUND");
  // CITIZEN/REPRESENTATIVE accounts are scope-limited (G9): bind the session
  // to the ONE application they are authorized for via an ACTIVE representation
  // consent — otherwise the citizen portal has no record to read.
  let citizenApplicationId: string | null = null;
  if (user.role === ROLES.CITIZEN || user.role === ROLES.REPRESENTATIVE) {
    const consent = await db.consent.findFirst({
      where: { representativeUserId: user.id, authorityStatus: "ACTIVE" },
      orderBy: { grantedAt: "desc" },
    });
    citizenApplicationId = consent?.applicationId ?? null;
  }
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  const session = await db.session.create({
    data: { token: newToken(), userId, citizenApplicationId, expiresAt },
  });
  return session;
}

/** Create a scope-limited citizen session via door verification (no account). */
export async function createCitizenSession(applicationId: string, citizenRole: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  const session = await db.session.create({
    data: { token: newToken(), citizenApplicationId: applicationId, citizenRole, expiresAt },
  });
  return session;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  store.delete(SESSION_COOKIE);
}

/** Resolve the current session or null. Expired sessions are deleted. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.userId && session.user) {
    return {
      sessionId: session.id,
      userId: session.userId,
      role: session.user.role,
      name: session.user.name,
      office: session.user.office,
      citizenApplicationId: session.citizenApplicationId ?? undefined,
    };
  }
  if (session.citizenApplicationId) {
    return {
      sessionId: session.id,
      role: session.citizenRole ?? ROLES.CITIZEN,
      name: session.citizenRole === ROLES.REPRESENTATIVE ? "প্রতিনিধি (Ripon)" : "নাগরিক (আবেদনকারী)",
      citizenApplicationId: session.citizenApplicationId,
    };
  }
  return null;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Require an authenticated session; throw 401 otherwise. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new HttpError(401, "UNAUTHENTICATED");
  return ctx;
}

/** Require a staff session with one of the allowed roles. */
export async function requireRole(...allowed: string[]): Promise<SessionContext> {
  const ctx = await requireSession();
  const isAdminBypass = ctx.role === ROLES.ADMIN;
  if (!isAdminBypass && !allowed.includes(ctx.role)) {
    throw new HttpError(403, `FORBIDDEN_FOR_ROLE_${ctx.role}`);
  }
  return ctx;
}

export function isStaff(role: string): boolean {
  return STAFF_ROLES.includes(role);
}
