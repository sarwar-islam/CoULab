import { NextResponse } from "next/server";
import { HttpError } from "@/lib/session";

/** Uniform JSON responses + error mapping for every API route. */
export function ok(data: unknown, status = 200) {
  return NextResponse.json(data as Record<string, unknown>, { status });
}

export function fail(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
  // Illegal state transitions / validation failures surface as 400 — never silent
  const isValidation = /^(INVALID|ILLEGAL|VALIDATION|NOT_FOUND|ALREADY|CONFLICT)/.test(message);
  return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "INVALID_JSON_BODY");
  }
}

export function requireFields(body: Record<string, unknown>, fields: string[]) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length > 0) {
    throw new HttpError(400, `VALIDATION_MISSING_FIELDS:${missing.join(",")}`);
  }
}
