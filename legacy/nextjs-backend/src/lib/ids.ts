import { db } from "@/lib/db";

/**
 * Sequential human-readable IDs (APP-2026-0001, CASE-2026-0001).
 * Uses a Counter row per prefix with an atomic upsert-increment so two
 * concurrent submissions can never receive the same ID.
 */
export async function nextId(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const counter = await db.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(counter.value).padStart(4, "0")}`;
}

export const APP_PREFIX = "APP";
export const CASE_PREFIX = "CASE";
