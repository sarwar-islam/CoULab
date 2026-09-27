import { createHash } from "crypto";

/** Demo-only PIN hashing (SHA-256). A production deployment would replace
 *  this with the national-id-linked credential flow — see docs/LIMITATIONS. */
export function hashPin(pin: string): string {
  return createHash("sha256").update(`dlas-demo:${pin}`).digest("hex");
}

/** SHA-256 helper used by T9 integrity verification and T11 signatures. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
