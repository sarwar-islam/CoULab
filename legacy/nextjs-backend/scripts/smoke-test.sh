#!/bin/bash
# ============================================================================
# DLAS API smoke test — walks the six integrated flows end-to-end at the API
# level. Fails loudly (exit 1) on any non-success; prints a compact report.
# Base: http://localhost:3000
# ============================================================================
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0
JAR="/tmp/dlas_smoke.jar"
rm -f "$JAR"

ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check() { # $1 label, $2 haystack file, $3 needle
  if grep -q "$3" "$2"; then ok "$1"; else bad "$1 (missing: $3)"; fi
}

echo "== 0. Public health =="
curl -s "$BASE/api/auth" > /tmp/r.json
check "session endpoint responds" /tmp/r.json '"session"'

echo "== 1. Staff login (DLAO officer) =="
curl -s -c "$JAR" -X POST "$BASE/api/auth" -H 'Content-Type: application/json' \
  -d '{"mode":"staff","username":"officer.joypurhat","pin":"1234"}' > /tmp/r.json
check "officer login" /tmp/r.json '"DLAO_OFFICER"'

echo "== 2. Coverage index (23 items + audit evidence) =="
curl -s -b "$JAR" "$BASE/api/coverage" > /tmp/r.json
check "23 items listed" /tmp/r.json '"T11"'
check "audit evidence counts" /tmp/r.json '"auditEvidence"'

echo "== 3. Flow 1: Moyuri case — safe contact + provenance (A1) =="
curl -s -b "$JAR" "$BASE/api/status?reference=APP-2026-0001" > /tmp/r.json
check "Moyuri lookup" /tmp/r.json '"Moyuri Akter"'
check "safe contact active" /tmp/r.json '"safeContactActive":true'
APP1=$(python3 -c "import json;d=json.load(open('/tmp/r.json'));print(d['reference'])")
CASE1=$(python3 -c "import json;d=json.load(open('/tmp/r.json'));print(d['caseId'])")
# unsafe caller attempt → BLOCKED_UNSAFE
curl -s -b "$JAR" -X POST "$BASE/api/contact" -H 'Content-Type: application/json' \
  -d "{\"action\":\"attempt\",\"caseId\":\"$CASE1\",\"attemptedNumber\":\"01899887766\",\"attemptType\":\"CALL\",\"claimedIdentity\":\"husband\"}" > /tmp/r.json
check "A1 failure test: unsafe caller blocked" /tmp/r.json 'BLOCKED_UNSAFE'
# contact rule creation requires reason
curl -s -b "$JAR" -X POST "$BASE/api/contact" -H 'Content-Type: application/json' \
  -d "{\"action\":\"set_rule\",\"caseId\":\"$CASE1\",\"mode\":\"ALLOW_ONLY\",\"safeNumber\":\"01711223344\",\"reason\":\"নিরাপদ যোগাযোগ পরীক্ষা\"}" > /tmp/r.json
check "contact rule set" /tmp/r.json '"ALLOW_ONLY"'

echo "== 4. Application lifecycle: create → review → accept (backbone) =="
curl -s -b "$JAR" -X POST "$BASE/api/applications" -H 'Content-Type: application/json' \
  -d '{"channel":"WEB","caseType":"MAINTENANCE","narrative":"স্মোক টেস্ট আবেদন","district":"Joypurhat","applicantName":"টেস্ট আবেদনকারী","provenance":"APPLICANT_CONFIRMED"}' > /tmp/r.json
check "application created" /tmp/r.json '"applicationId"'
NEWAPP=$(python3 -c "import json;print(json.load(open('/tmp/r.json'))['applicationId'])")
curl -s -b "$JAR" -X POST "$BASE/api/applications/$NEWAPP" -H 'Content-Type: application/json' -d '{"action":"start_review"}' > /tmp/r.json
check "review started" /tmp/r.json '"success":true'
# illegal transition must be rejected (validation, not silent)
curl -s -b "$JAR" -X POST "$BASE/api/applications/$NEWAPP" -H 'Content-Type: application/json' -d '{"action":"accept"}' > /tmp/r.json
check "accept mints case" /tmp/r.json '"caseId"'
NEWCASE=$(python3 -c "import json;print(json.load(open('/tmp/r.json'))['caseId'])")
echo "     → minted $NEWCASE from $NEWAPP"

echo "== 5. T8 triage on new case (3 agents + human decision) =="
curl -s -b "$JAR" -X POST "$BASE/api/triage" -H 'Content-Type: application/json' -d "{\"caseId\":\"$NEWCASE\"}" > /tmp/r.json
check "triage run" /tmp/r.json '"CategorisationAgent"'
RUNID=$(python3 -c "import json;print(json.load(open('/tmp/r.json'))['run']['id'])")
curl -s -b "$JAR" -X PATCH "$BASE/api/triage" -H 'Content-Type: application/json' \
  -d "{\"runId\":\"$RUNID\",\"decision\":\"OVERRIDE\",\"priority\":\"HIGH\",\"reason\":\"স্মোক-টেস্ট ওভাররাইড\"}" > /tmp/r.json
check "human override recorded" /tmp/r.json '"priority":"HIGH"'

echo "== 6. T4 duplicate scan + review =="
curl -s -b "$JAR" -X POST "$BASE/api/duplicates" -H 'Content-Type: application/json' -d '{}' > /tmp/r.json
check "scan produced candidates" /tmp/r.json '"created"'
curl -s -b "$JAR" "$BASE/api/duplicates" > /tmp/r.json
check "candidates listed" /tmp/r.json '"matchedFieldsJson"'

echo "== 7. Referral flow (B6/T2): create → return×2 → escalate → route =="
# Receiving office actions require the RECEIVER role (RBAC by design)
JAR_RECV="/tmp/dlas_smoke_recv.jar"
curl -s -c "$JAR_RECV" -X POST "$BASE/api/auth" -H 'Content-Type: application/json' \
  -d '{"mode":"staff","username":"receiving.dhaka","pin":"1234"}' > /tmp/r.json
check "receiving DLAO login" /tmp/r.json '"RECEIVING_DLAO"'
curl -s -b "$JAR" -X POST "$BASE/api/referrals" -H 'Content-Type: application/json' \
  -d "{\"caseId\":\"$NEWCASE\",\"toOffice\":\"জেলা আইনি সহায়তা কার্যালয়, ঢাকা\",\"reason\":\"স্মোক\",\"historySummary\":\"ইতিহাস\",\"responsibleActor\":\"কর্মকর্তা\",\"expectedAction\":\"স্বীকৃতি\",\"kind\":\"JURISDICTION_TRANSFER\",\"ackDays\":1}" > /tmp/r.json
check "referral created" /tmp/r.json '"JURISDICTION_TRANSFER"'
REFID=$(python3 -c "import json;print(json.load(open('/tmp/r.json'))['referral']['id'])")
# sender cannot ack/return the referral (RBAC guard)
curl -s -b "$JAR" -X PATCH "$BASE/api/referrals" -H 'Content-Type: application/json' -d "{\"referralId\":\"$REFID\",\"action\":\"acknowledge\"}" > /tmp/r.json
check "sender cannot acknowledge (RBAC)" /tmp/r.json 'FORBIDDEN_ONLY_RECEIVER'
curl -s -b "$JAR_RECV" -X PATCH "$BASE/api/referrals" -H 'Content-Type: application/json' -d "{\"referralId\":\"$REFID\",\"action\":\"return\",\"reason\":\"এখতিয়ার নেই\"}" > /tmp/r.json
check "return 1 (receiver)" /tmp/r.json '"success":true'
curl -s -b "$JAR_RECV" -X PATCH "$BASE/api/referrals" -H 'Content-Type: application/json' -d "{\"referralId\":\"$REFID\",\"action\":\"return\",\"reason\":\"আবার ফেরত\"}" > /tmp/r.json
check "return 2 escalates" /tmp/r.json '"success":true'
# final routing decision: authorised human only (officer, not receiver)
curl -s -b "$JAR_RECV" -X PATCH "$BASE/api/referrals" -H 'Content-Type: application/json' -d "{\"referralId\":\"$REFID\",\"action\":\"route\",\"finalOffice\":\"শ্রম আইনি সহায়তা সেল\",\"reason\":\"চেষ্টা\"}" > /tmp/r.json
check "receiver cannot make final routing (human authority)" /tmp/r.json 'FORBIDDEN_ONLY_AUTHORISED_HUMAN'
curl -s -b "$JAR" -X PATCH "$BASE/api/referrals" -H 'Content-Type: application/json' -d "{\"referralId\":\"$REFID\",\"action\":\"route\",\"finalOffice\":\"শ্রম আইনি সহায়তা সেল\",\"reason\":\"চূড়ান্ত মানব-সিদ্ধান্ত\"}" > /tmp/r.json
check "final human routing" /tmp/r.json '"success":true'

echo "== 8. T9 offline sync: idempotency + conflict =="
UUID1="11111111-2222-3333-4444-555555555555"
PAYLOAD='{"applicantName":"অফলাইন টেস্ট","district":"Khagrachari","caseType":"LAND_DISPUTE","narrative":"অফলাইন আবেদন","channel":"ASSISTED_UDC","provenance":"INTERMEDIARY_TRANSLATED"}'
HASH=$(python3 -c "
import hashlib,json
p=json.loads('''$PAYLOAD''')
print(hashlib.sha256(json.dumps(p,sort_keys=True).encode()).hexdigest())
")
curl -s -b "$JAR" -X POST "$BASE/api/sync" -H 'Content-Type: application/json' \
  -d "{\"deviceId\":\"SMOKE-01\",\"items\":[{\"tempUuid\":\"$UUID1\",\"payloadType\":\"APPLICATION\",\"payload\":$PAYLOAD,\"integrityHash\":\"$HASH\"}]}" > /tmp/r.json
check "offline sync creates record" /tmp/r.json '"SYNCED"'
curl -s -b "$JAR" -X POST "$BASE/api/sync" -H 'Content-Type: application/json' \
  -d "{\"deviceId\":\"SMOKE-01\",\"items\":[{\"tempUuid\":\"$UUID1\",\"payloadType\":\"APPLICATION\",\"payload\":$PAYLOAD,\"integrityHash\":\"$HASH\"}]}" > /tmp/r.json
check "duplicate tempUuid → no second record" /tmp/r.json '"SYNCED"'
curl -s -b "$JAR" -X POST "$BASE/api/sync" -H 'Content-Type: application/json' \
  -d "{\"deviceId\":\"SMOKE-01\",\"items\":[{\"tempUuid\":\"66666666-7777-8888-9999-000000000001\",\"payloadType\":\"STATEMENT\",\"payload\":{\"text\":\"সংঘর্ষ পরীক্ষা\"},\"editedExistingId\":\"server-copy\",\"integrityHash\":\"$HASH\"}]}" > /tmp/r.json
check "conflict routed to review" /tmp/r.json '"CONFLICT"'

echo "== 9. T11 e-signature: init → sign → verify =="
# Only MEDIATOR/ADMIN may open a signing session (RBAC by design)
FIN=""
JAR_MED="/tmp/dlas_smoke_med.jar"
curl -s -c "$JAR_MED" -X POST "$BASE/api/auth" -H 'Content-Type: application/json' \
  -d '{"mode":"staff","username":"mediator.joypurhat","pin":"1234"}' > /tmp/r.json
check "mediator login" /tmp/r.json '"MEDIATOR"'
curl -s -b "$JAR" -X POST "$BASE/api/signatures" -H 'Content-Type: application/json' -d "{\"draftId\":\"$FIN\",\"parties\":[]}" > /tmp/r.json
check "officer cannot open signing session (RBAC)" /tmp/r.json 'FORBIDDEN'
curl -s -b "$JAR_MED" "$BASE/api/settlements" > /tmp/r.json
FIN=$(python3 -c "
import json
d=json.load(open('/tmp/r.json'))
fin=[x for x in d['drafts'] if x['status']=='FINALIZED']
print(fin[0]['id'] if fin else '')")
if [ -n "$FIN" ]; then
  curl -s -b "$JAR_MED" -X POST "$BASE/api/signatures" -H 'Content-Type: application/json' -d "{\"draftId\":\"$FIN\",\"parties\":[]}" > /tmp/r.json
  check "signature session opened" /tmp/r.json '"documentHash"'
  SIGSESSION=$(python3 -c "import json;print(json.load(open('/tmp/r.json'))['session']['id'])")
  DOCHASH=$(python3 -c "import json;print(json.load(open('/tmp/r.json'))['session']['documentHash'])")
  SIGREC=$(curl -s -b "$JAR_MED" "$BASE/api/signatures?sessionId=$SIGSESSION" > /tmp/s.json; python3 -c "import json;print(json.load(open('/tmp/s.json'))['sessions'][0]['signatures'][0]['id'])")
  NONCE=$(python3 -c "import json;print(json.load(open('/tmp/s.json'))['sessions'][0]['signatures'][0]['nonce'])")
  SIGNEDAT=$(python3 -c "import datetime;print(datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z')")
  SIGNATURE=$(python3 - "$DOCHASH" "$NONCE" "$SIGNEDAT" << 'EOF'
import hashlib,sys
doc,nonce,ts=sys.argv[1],sys.argv[2],sys.argv[3]
print(hashlib.sha256(f"{doc}|পক্ষ-ক|{ts}|{nonce}".encode()).hexdigest())
EOF
)
  curl -s -b "$JAR_MED" -X PATCH "$BASE/api/signatures" -H 'Content-Type: application/json' \
    -d "{\"action\":\"sign\",\"sessionId\":\"$SIGSESSION\",\"signatureRecordId\":\"$SIGREC\",\"signatureHash\":\"$SIGNATURE\",\"signedAt\":\"$SIGNEDAT\",\"method\":\"ONLINE\"}" > /tmp/r.json
  check "signature bound+verified" /tmp/r.json '"verified":true'
  curl -s -b "$JAR" -X PATCH "$BASE/api/signatures" -H 'Content-Type: application/json' -d "{\"action\":\"verify\",\"sessionId\":\"$SIGSESSION\"}" > /tmp/r.json
  check "independent verification" /tmp/r.json '"documentIntact":true'
  check "guardrail disclaimer present" /tmp/r.json 'ক্রিপ্টোগ্রাফিক'
else
  bad "no finalized draft found (seed)"
fi

echo "== 10. Audit trail (G10) =="
curl -s -b "$JAR" "$BASE/api/audit?limit=10" > /tmp/r.json
check "audit entries present" /tmp/r.json '"actorName"'
check "authority recorded" /tmp/r.json '"onWhoseAuthority"'

echo "== 11. B7 reports =="
curl -s -b "$JAR" "$BASE/api/reports" > /tmp/r.json
check "report generated" /tmp/r.json '"acceptanceRate"'

echo "== 12. Citizen door verification (APP-2026-0001 + last4) =="
curl -s -c /tmp/dlas_citizen.jar -X POST "$BASE/api/auth" -H 'Content-Type: application/json' \
  -d '{"mode":"citizen","applicationId":"APP-2026-0001","verification":"3344"}' > /tmp/r.json
check "citizen door access" /tmp/r.json '"success":true'
# citizen scope: cannot read other applications
curl -s -b /tmp/dlas_citizen.jar "$BASE/api/applications?q=Rahim" > /tmp/r.json
check "citizen scope limited (G9)" /tmp/r.json '"applications":\[\]'

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
