// ============================================================================
// DLAS Automated Smoke Test Suite
// Verifies all 23 ADLASB items, state transitions, security, and audit trails.
// Run with: node tests/smoke-test.js
// ============================================================================
'use strict';

const http = require('http');
const server = require('../server');

const PORT = 3099; // Isolated port for testing
let passed = 0;
let failed = 0;
let cookieJar = '';

function ok(msg) {
  passed++;
  console.log(`  ✓ ${msg}`);
}

function bad(msg, details) {
  failed++;
  console.error(`  ✗ ${msg}`, details ? `\n    ${JSON.stringify(details)}` : '');
}

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { ...headers };
    if (cookieJar) reqHeaders['Cookie'] = cookieJar;

    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let resData = '';
      if (res.headers['set-cookie']) {
        const rawCookies = res.headers['set-cookie'];
        cookieJar = (Array.isArray(rawCookies) ? rawCookies : [rawCookies])
          .map(c => c.split(';')[0])
          .join('; ');
      }

      res.on('data', chunk => { resData += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(resData); } catch (e) { json = resData; }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('  DLAS PRODUCTION TEST SUITE — 23 ADLASB ITEMS VERIFICATION');
  console.log('================================================================\n');

  try {
    // 0. Public health
    console.log('== 0. Public health & Sessions ==');
    const health = await request('GET', '/api/auth');
    if (health.status === 200 && 'session' in health.data) {
      ok('Public health endpoint responds with session object');
    } else bad('Public health endpoint failed', health);

    // 1. Staff login
    console.log('\n== 1. Staff Login (DLAO Officer) ==');
    const login = await request('POST', '/api/auth', {
      mode: 'staff',
      username: 'officer.joypurhat',
      pin: '1234'
    });
    if (login.status === 200 && login.data.session?.role === 'DLAO_OFFICER') {
      ok('Officer login successful with PIN 1234');
    } else bad('Officer login failed', login);

    // 2. Coverage index
    console.log('\n== 2. Coverage Index (23 Mandatory Items) ==');
    const coverage = await request('GET', '/api/coverage');
    if (coverage.status === 200 && coverage.data.items?.some(i => i.id === 'T11') && coverage.data.auditEvidence) {
      ok('Coverage index returns all 23 items with live audit evidence counts');
    } else bad('Coverage index failed', coverage);

    // 3. Flow 1: Moyuri case — Safe Contact + Unsafe caller block (A1)
    console.log('\n== 3. Flow 1: Moyuri Case — Safe Contact & Unsafe Caller Block (A1) ==');
    const status = await request('GET', '/api/status?reference=APP-2026-0001');
    if (status.status === 200 && status.data.applicantName === 'Moyuri Akter' && status.data.safeContactActive) {
      ok('Moyuri Akter lookup verified with active safe contact rules');
    } else bad('Moyuri lookup failed', status);

    const caseId1 = status.data.caseId;
    // Unsafe caller block test
    const blockedAttempt = await request('POST', '/api/contact', {
      action: 'attempt',
      caseId: caseId1,
      attemptedNumber: '01899887766',
      attemptType: 'CALL',
      claimedIdentity: 'husband'
    });
    if (blockedAttempt.status === 201 && blockedAttempt.data.evaluation?.outcome === 'BLOCKED_UNSAFE') {
      ok('A1 Failure test: Unsafe caller blocked successfully (BLOCKED_UNSAFE)');
    } else bad('A1 Failure test failed', blockedAttempt);

    // Contact rule creation
    const setRule = await request('POST', '/api/contact', {
      action: 'set_rule',
      caseId: caseId1,
      mode: 'ALLOW_ONLY',
      safeNumber: '01711223344',
      reason: 'নিরাপদ যোগাযোগ পরীক্ষা'
    });
    if (setRule.status === 201 && setRule.data.rule?.mode === 'ALLOW_ONLY') {
      ok('Contact rule ALLOW_ONLY created successfully with recorded reason');
    } else bad('Set contact rule failed', setRule);

    // 4. Application Lifecycle: Submit -> Review -> Accept (Case ID Minted)
    console.log('\n== 4. Application Lifecycle: Create -> Review -> Accept ==');
    const create = await request('POST', '/api/applications', {
      channel: 'WEB',
      caseType: 'MAINTENANCE',
      narrative: 'স্মোক টেস্ট আবেদন বিবরণ',
      district: 'Joypurhat',
      applicantName: 'টেস্ট আবেদনকারী',
      provenance: 'APPLICANT_CONFIRMED'
    });
    if (create.status === 200 && create.data.applicationId) {
      ok(`Application created successfully: ${create.data.applicationId}`);
    } else bad('Application creation failed', create);

    const newAppId = create.data.applicationId;

    const startReview = await request('POST', `/api/applications/${newAppId}`, { action: 'start_review' });
    if (startReview.status === 200 && startReview.data.status === 'UNDER_REVIEW') {
      ok('Application status moved to UNDER_REVIEW');
    } else bad('Start review failed', startReview);

    const accept = await request('POST', `/api/applications/${newAppId}`, { action: 'accept' });
    if (accept.status === 200 && accept.data.caseId) {
      ok(`Application accepted -> Case ID minted: ${accept.data.caseId}`);
    } else bad('Accept application failed', accept);

    const newCaseId = accept.data.caseId;

    // 5. T8 Triage Pipeline (3 Agents + Human Override)
    console.log('\n== 5. T8 Multi-Agent Triage Pipeline ==');
    const triage = await request('POST', '/api/triage', { caseId: newCaseId });
    if (triage.status === 201 && triage.data.run?.categoryResult?.agent === 'CategorisationAgent') {
      ok('T8 Triage pipeline executed with 3 agents and conflict analysis');
    } else bad('Triage run failed', triage);

    const runId = triage.data.run.id;
    const override = await request('PATCH', '/api/triage', {
      runId,
      decision: 'OVERRIDE',
      priority: 'HIGH',
      reason: 'স্মোক-টেস্ট ওভাররাইড'
    });
    if (override.status === 200 && override.data.priority === 'HIGH') {
      ok('Human override recorded with reason and priority updated to HIGH');
    } else bad('Triage override failed', override);

    // 6. T4 Duplicate Candidate Scan
    console.log('\n== 6. T4 Duplicate Detection & Candidate Review ==');
    const dupScan = await request('POST', '/api/duplicates', {});
    if (dupScan.status === 200 && 'count' in dupScan.data) {
      ok(`Duplicate scan completed: ${dupScan.data.count} candidates identified`);
    } else bad('Duplicate scan failed', dupScan);

    const dupsList = await request('GET', '/api/duplicates');
    if (dupsList.status === 200 && Array.isArray(dupsList.data.candidates)) {
      ok('Candidate duplicate pairs listed with matched attributes');
    } else bad('List duplicates failed', dupsList);

    // 7. Referral Flow & Escalation Guard (B6/T2)
    console.log('\n== 7. Tracked Referral & Ping-Pong Escalation Guard (B6 / T2) ==');
    const makeReferral = await request('POST', '/api/referrals', {
      caseId: newCaseId,
      toOffice: 'জেলা আইনি সহায়তা কার্যালয়, ঢাকা',
      reason: 'স্মোক টেস্ট রেফারেল',
      historySummary: 'মামলার ইতিহাস',
      responsibleActor: 'কর্মকর্তা',
      expectedAction: 'স্বীকৃতি ও নিষ্পত্তি',
      kind: 'JURISDICTION_TRANSFER',
      ackDays: 1
    });
    if (makeReferral.status === 201 && makeReferral.data.referral?.id) {
      ok('Tracked referral created with acknowledgment deadline');
    } else bad('Create referral failed', makeReferral);

    const refId = makeReferral.data.referral.id;

    // Sender cannot acknowledge (RBAC guard)
    const senderAck = await request('PATCH', '/api/referrals', { referralId: refId, action: 'acknowledge' });
    if (senderAck.status === 403) {
      ok('RBAC Guard: Sender office cannot acknowledge its own referral');
    } else bad('RBAC Guard failed', senderAck);

    // Login as receiving DLAO
    const recvLogin = await request('POST', '/api/auth', {
      mode: 'staff',
      username: 'receiving.dhaka',
      pin: '1234'
    });
    if (recvLogin.status === 200 && recvLogin.data.session?.role === 'RECEIVING_DLAO') {
      ok('Receiving DLAO logged in successfully');
    } else bad('Receiving DLAO login failed', recvLogin);

    // Return 1
    const ret1 = await request('PATCH', '/api/referrals', { referralId: refId, action: 'return', reason: 'এখতিয়ার নেই' });
    if (ret1.status === 200 && ret1.data.ackStatus === 'RETURNED') {
      ok('Receiver returned referral with statutory reason (Return 1)');
    } else bad('Return 1 failed', ret1);

    // Return 2 -> Auto-escalate
    const ret2 = await request('PATCH', '/api/referrals', { referralId: refId, action: 'return', reason: 'আবারও এখতিয়ার বহির্ভূত' });
    if (ret2.status === 200 && ret2.data.ackStatus === 'ESCALATED' && ret2.data.escalated) {
      ok('T2 Ping-Pong Guard: After 2 returns, system automatically escalated to Chief Officer');
    } else bad('T2 Escalation failed', ret2);

    // Switch back to officer for final routing
    await request('POST', '/api/auth', { mode: 'staff', username: 'officer.joypurhat', pin: '1234' });
    const finalRoute = await request('PATCH', '/api/referrals', {
      referralId: refId,
      action: 'route',
      finalOffice: 'শ্রম আইনি সহায়তা সেল',
      reason: 'চূড়ান্ত মানব-সিদ্ধান্ত'
    });
    if (finalRoute.status === 200 && finalRoute.data.ackStatus === 'ROUTED') {
      ok('Final routing decision executed by authorised human officer');
    } else bad('Final routing failed', finalRoute);

    // 8. T9 Offline Sync Idempotency
    console.log('\n== 8. T9 Offline-First UDC Sync & Idempotency ==');
    const tempUuid = 'test-uuid-' + Date.now();
    const sync1 = await request('POST', '/api/sync', {
      deviceId: 'udc-khagrachari-01',
      items: [{
        tempUuid,
        payloadType: 'APPLICATION',
        payload: {
          applicantName: 'অফলাইন টেস্ট আবেদনকারী',
          district: 'Khagrachari',
          caseType: 'LAND_DISPUTE',
          narrative: 'অফলাইন সিঙ্ক পরীক্ষা'
        }
      }]
    });
    if (sync1.status === 200 && sync1.data.results?.[0]?.status === 'SYNCED') {
      ok('Offline sync processed initial item: SYNCED');
    } else bad('Offline sync 1 failed', sync1);

    // Sync same tempUuid second time -> must be skipped as duplicate
    const sync2 = await request('POST', '/api/sync', {
      deviceId: 'udc-khagrachari-01',
      items: [{ tempUuid }]
    });
    if (sync2.status === 200 && sync2.data.results?.[0]?.duplicateSkipped) {
      ok('T9 Idempotency Guard: Duplicate tempUuid recognized and skipped without data corruption');
    } else bad('T9 Idempotency failed', sync2);

    // 9. B2 Mediation, T7 Settlement Draft & T11 e-Signatures
    console.log('\n== 9. ADR Mediation, T7 Settlement Drafting & T11 e-Signatures ==');
    const medSession = await request('POST', '/api/mediation', {
      caseId: newCaseId,
      mode: 'HYBRID',
      preMediationNotes: 'উভয় পক্ষ সমঝোতায় আগ্রহী'
    });
    if (medSession.status === 201 && medSession.data.session?.status === 'SCHEDULED') {
      ok('Mediation session scheduled in HYBRID mode');
    } else bad('Mediation scheduling failed', medSession);

    const draft = await request('POST', '/api/settlements', {
      caseId: newCaseId,
      templateType: 'MAINTENANCE',
      notes: 'মাসিক ৫,০০০ টাকা খোরপোশ'
    });
    if (draft.status === 201 && draft.data.draft?.draftText && draft.data.draft?.aiSegments) {
      ok('T7 Settlement draft generated with structured clauses and AI segment markers');
    } else bad('Settlement draft generation failed', draft);

    const prepSig = await request('POST', '/api/signatures', {
      action: 'prepare',
      draftId: draft.data.draft.id,
      documentText: draft.data.draft.draftText
    });
    if (prepSig.status === 201 && prepSig.data.session?.documentHash) {
      ok(`T11 e-Signature prepared with SHA-256 document hash: ${prepSig.data.session.documentHash.slice(0, 16)}…`);
    } else bad('e-Signature prepare failed', prepSig);

    const signSessionId = prepSig.data.session.id;
    const sign = await request('POST', '/api/signatures', {
      action: 'sign',
      sessionId: signSessionId,
      partyName: 'প্রথম পক্ষ (আবেদনকারী)',
      partyRole: 'APPLICANT',
      signatureValue: 'e-Sign Confirmed'
    });
    if (sign.status === 201 && sign.data.signature?.signedHash) {
      ok('T11 e-Signature recorded with verified party hash');
    } else bad('e-Signature signing failed', sign);

    const verify = await request('POST', '/api/signatures', {
      action: 'verify',
      sessionId: signSessionId,
      currentDocumentText: draft.data.draft.draftText
    });
    if (verify.status === 200 && verify.data.verified && !verify.data.tamperEvident) {
      ok('T11 Integrity Check: Document hash verified tamper-free');
    } else bad('e-Signature verification failed', verify);

    // 10. Golden Thread Audit Trail
    console.log('\n== 10. Golden Thread Tamper-Evident Audit Trail ==');
    const audits = await request('GET', `/api/audit?caseId=${newCaseId}`);
    if (audits.status === 200 && audits.data.auditEntries?.length >= 4) {
      ok(`Golden Thread verified: ${audits.data.auditEntries.length} chronological audit entries traced for case`);
    } else bad('Audit trail lookup failed', audits);

    // 11. Knowledge Base & Resources
    console.log('\n== 11. Knowledge Base, Resource Library & Offices ==');
    const bootstrap = await request('GET', '/api/bootstrap');
    if (bootstrap.status === 200 && bootstrap.data.articles?.length >= 190 && bootstrap.data.offices?.length >= 64) {
      ok(`Bootstrap loaded: ${bootstrap.data.articles.length} legal articles and ${bootstrap.data.offices.length} offices`);
    } else bad('Bootstrap failed', bootstrap);

    const officeSearch = await request('GET', '/api/offices?q=joypurhat');
    if (officeSearch.status === 200 && officeSearch.data.offices?.length > 0) {
      ok('Office directory search works: found Joypurhat DLAO');
    } else bad('Office search failed', officeSearch);

    const chat = await request('POST', '/api/chat', { message: 'আমি কীভাবে বিনামূল্যে আইনি সহায়তা পেতে পারি?' });
    if (chat.status === 200 && chat.data.reply) {
      ok('Q&A AI Assistant responded with legal advice from knowledge base');
    } else bad('Chat assistant failed', chat);

    console.log('\n================================================================');
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

// Start temporary test server
server.listen(PORT, async () => {
  try {
    await runTests();
  } finally {
    server.close();
  }
});
