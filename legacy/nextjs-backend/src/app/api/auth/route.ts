import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { createStaffSession, createCitizenSession, setSessionCookie, clearSessionCookie, getSessionContext } from "@/lib/session";
import { hashPin } from "@/lib/crypto-server";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ mode: string; username?: string; pin?: string; applicationId?: string; verification?: string; citizenRole?: string }>(req);
    requireFields(body as never, ["mode"]);

    if (body.mode === "logout") {
      await clearSessionCookie();
      return ok({ success: true });
    }

    if (body.mode === "staff") {
      requireFields(body as never, ["username", "pin"]);
      const user = await db.user.findUnique({ where: { username: body.username!.trim() } });
      if (!user || !user.active || user.pinHash !== hashPin(body.pin!)) {
        return ok({ success: false, error: "INVALID_CREDENTIALS" }, 401);
      }
      const session = await createStaffSession(user.id);
      await setSessionCookie(session.token);
      await writeAudit({
        actor: { userId: user.id, name: user.name, role: user.role },
        channel: "WEB",
        action: "STAFF_LOGIN",
        entityType: "User",
        entityId: user.id,
      });
      return ok({ success: true, role: user.role, name: user.name });
    }

    if (body.mode === "citizen") {
      // Door verification: Application ID + verification token (last 4 digits
      // of the registered contact number). No account, no password to remember.
      requireFields(body as never, ["applicationId", "verification"]);
      const application = await db.application.findUnique({
        where: { id: body.applicationId!.trim() },
        include: { applicant: true },
      });
      if (!application) return ok({ success: false, error: "APPLICATION_NOT_FOUND" }, 404);
      const digits = (application.applicant.primaryPhone ?? "").replace(/\D/g, "");
      const nidDigits = (application.applicant.nidRef ?? "").replace(/\D/g, "");
      const ver = body.verification!.replace(/\D/g, "");
      const matchesPhone = digits.length >= 4 && ver === digits.slice(-4);
      const matchesNid = nidDigits.length >= 4 && ver === nidDigits.slice(-4);
      if (!matchesPhone && !matchesNid) {
        return ok({ success: false, error: "VERIFICATION_FAILED" }, 403);
      }
      const session = await createCitizenSession(application.id, body.citizenRole ?? "CITIZEN");
      await setSessionCookie(session.token);
      await writeAudit({
        actor: { name: application.applicant.fullName, role: "CITIZEN" },
        channel: "WEB",
        action: "CITIZEN_DOOR_ACCESS",
        entityType: "Application",
        entityId: application.id,
        applicationId: application.id,
      });
      return ok({ success: true, applicationId: application.id, name: application.applicant.fullName });
    }

    return fail(new Error("INVALID_AUTH_MODE"));
  } catch (error) {
    return fail(error);
  }
}

export async function GET() {
  const ctx = await getSessionContext();
  return ok({ session: ctx });
}
