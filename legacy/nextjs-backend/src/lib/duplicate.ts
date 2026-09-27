// ============================================================================
// T4 — Duplicate / fraud-risk detection.
// Multi-attribute fuzzy matching producing confidence + evidence.
// GUARDRAIL (case PDF): never auto-reject, auto-merge, or label a person
// fraudulent. Output is a candidate list for side-by-side HUMAN review.
// ============================================================================

export interface MatchedField {
  field: string;
  valueA: string;
  valueB: string;
  similarity: number; // 0-100
}

interface ApplicantLike {
  fullName: string;
  district: string;
  primaryPhone?: string | null;
  nidRef?: string | null;
}

/** Jaro-free simple hybrid: token overlap + edit-distance ratio (0-100). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  // token overlap (handles name-order differences)
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const common = [...ta].filter((t) => tb.has(t)).length;
  const tokenScore = (2 * common) / (ta.size + tb.size);
  // char-level ratio (handles spelling variants)
  const dist = levenshtein(na, nb);
  const charScore = 1 - dist / Math.max(na.length, nb.length);
  return Math.round(100 * (0.6 * tokenScore + 0.4 * charScore));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = temp;
    }
  }
  return dp[n];
}

function phoneSimilarity(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const da = a.replace(/\D/g, "");
  const dbb = b.replace(/\D/g, "");
  if (!da || !dbb) return 0;
  if (da === dbb) return 100;
  // last-7-digit overlap catches "shop number vs personal number" confusion
  const tailA = da.slice(-7);
  const tailB = dbb.slice(-7);
  if (tailA === tailB) return 85;
  return 0;
}

function nidSimilarity(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const da = a.replace(/\D/g, "");
  const dbb = b.replace(/\D/g, "");
  if (!da || !dbb) return 0;
  return da === dbb ? 100 : 0;
}

/** Compare two applicants across multiple attributes with evidence. */
export function compareApplicants(
  a: ApplicantLike & { id: string },
  b: ApplicantLike & { id: string },
): { score: number; matchedFields: MatchedField[] } {
  const name = nameSimilarity(a.fullName, b.fullName);
  const phone = phoneSimilarity(a.primaryPhone, b.primaryPhone);
  const nid = nidSimilarity(a.nidRef, b.nidRef);
  const district = normalize(a.district) === normalize(b.district) ? 100 : 0;

  // Weighted multi-attribute score. Name alone is never enough (the PDF's
  // "two real people may look similar" trap) — name carries at most 40%.
  const score = Math.round(
    0.4 * name + 0.25 * phone + 0.25 * nid + 0.1 * district,
  );

  const matchedFields: MatchedField[] = [
    { field: "name", valueA: a.fullName, valueB: b.fullName, similarity: name },
    { field: "phone", valueA: a.primaryPhone ?? "-", valueB: b.primaryPhone ?? "-", similarity: phone },
    { field: "nid", valueA: a.nidRef ?? "-", valueB: b.nidRef ?? "-", similarity: nid },
    { field: "district", valueA: a.district, valueB: b.district, similarity: district },
  ];
  return { score, matchedFields };
}

export const DUPLICATE_REVIEW_THRESHOLD = 45; // display threshold; humans decide
