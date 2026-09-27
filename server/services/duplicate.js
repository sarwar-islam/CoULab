// ============================================================================
// T4 — Duplicate / Fraud-Risk Detection.
// Multi-attribute fuzzy matching producing confidence + evidence.
// Never auto-rejects; produces candidate list for side-by-side human review.
// ============================================================================
'use strict';

function normalize(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = temp;
    }
  }
  return dp[n];
}

function nameSimilarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const common = [...ta].filter((t) => tb.has(t)).length;
  const tokenScore = (2 * common) / (ta.size + tb.size);
  const dist = levenshtein(na, nb);
  const charScore = 1 - dist / Math.max(na.length, nb.length);
  return Math.round(100 * (0.6 * tokenScore + 0.4 * charScore));
}

function phoneSimilarity(a, b) {
  if (!a || !b) return 0;
  const da = String(a).replace(/\D/g, "");
  const dbb = String(b).replace(/\D/g, "");
  if (!da || !dbb) return 0;
  if (da === dbb) return 100;
  const tailA = da.slice(-7);
  const tailB = dbb.slice(-7);
  if (tailA.length >= 7 && tailA === tailB) return 85;
  return 0;
}

function nidSimilarity(a, b) {
  if (!a || !b) return 0;
  const da = String(a).replace(/\D/g, "");
  const dbb = String(b).replace(/\D/g, "");
  if (!da || !dbb) return 0;
  return da === dbb ? 100 : 0;
}

function compareApplicants(a, b) {
  const name = nameSimilarity(a.fullName, b.fullName);
  const phone = phoneSimilarity(a.primaryPhone, b.primaryPhone);
  const nid = nidSimilarity(a.nidRef, b.nidRef);
  const district = normalize(a.district) === normalize(b.district) ? 100 : 0;

  const score = Math.round(0.4 * name + 0.25 * phone + 0.25 * nid + 0.1 * district);

  const matchedFields = [
    { field: "name", valueA: a.fullName, valueB: b.fullName, similarity: name },
    { field: "phone", valueA: a.primaryPhone || "-", valueB: b.primaryPhone || "-", similarity: phone },
    { field: "nid", valueA: a.nidRef || "-", valueB: b.nidRef || "-", similarity: nid },
    { field: "district", valueA: a.district || "-", valueB: b.district || "-", similarity: district },
  ];

  return { score, matchedFields };
}

const DUPLICATE_REVIEW_THRESHOLD = 45;

module.exports = {
  nameSimilarity,
  compareApplicants,
  DUPLICATE_REVIEW_THRESHOLD
};
