'use strict';
const http = require('http');
const server = require('../server');

const PORT = 3098;
let passed = 0;
let failed = 0;
let cookie = '';

function ok(msg) {
  passed++;
  console.log(`  ✓ ${msg}`);
}
function bad(msg, details) {
  failed++;
  console.error(`  ✗ ${msg}`, details || '');
}

function req(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (cookie) headers['Cookie'] = cookie;
    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const r = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers
    }, (res) => {
      let data = '';
      if (res.headers['set-cookie']) {
        const sc = res.headers['set-cookie'];
        cookie = (Array.isArray(sc) ? sc : [sc]).map(c => c.split(';')[0]).join('; ');
      }
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function run() {
  console.log('Testing Ain-Shohay Frontend Compatibility Endpoints:');

  // 1. Bootstrap
  const boot = await req('GET', '/api/bootstrap');
  if (boot.status === 200 && boot.data.categories?.length > 0 && boot.data.articles?.length > 150) {
    ok('Bootstrap returns full category, section and article sets');
  } else bad('Bootstrap failed', boot);

  // 2. Article direct object
  const art = await req('GET', '/api/article?id=fam-div-cert');
  if (art.status === 200 && art.data.id === 'fam-div-cert' && Array.isArray(art.data.body)) {
    ok('Article returned directly as object with body array');
  } else bad('Article direct lookup failed', art);

  // 3. Form direct object
  const form = await req('GET', '/api/form?id=maintenance');
  if (form.status === 200 && form.data.title && Array.isArray(form.data.fields)) {
    ok('Form returned directly with title and fields');
  } else bad('Form direct lookup failed', form);

  // 4. Chat Q&A + command
  const chat = await req('POST', '/api/chat', { message: 'হ্যালো' });
  if (chat.status === 200 && chat.data.reply && Array.isArray(chat.data.actions)) {
    ok('Chat responded with actions and greeting');
  } else bad('Chat greeting failed', chat);

  // 5. Guide wizard
  const guide = await req('POST', '/api/guide', { topic: 'family', need: 'mediation', income: 15000 });
  if (guide.status === 200 && guide.data.topic?.id === 'family' && guide.data.eligibility) {
    ok('Guide wizard calculated eligibility and returned recommendations');
  } else bad('Guide failed', guide);

  // 6. Eligibility
  const elig = await req('POST', '/api/eligibility', { income: 10000 });
  if (elig.status === 200 && elig.data.level === 'likely') {
    ok('Eligibility accurately classified income 10,000 as likely');
  } else bad('Eligibility failed', elig);

  // 7. Register & Me
  const testPhone = '01799' + Math.floor(100000 + Math.random() * 900000);
  const reg = await req('POST', '/api/register', { name: 'রহিম মিয়া', phone: testPhone, password: 'password123' });
  if (reg.status === 200 && reg.data.ok && reg.data.user?.name === 'রহিম মিয়া') {
    ok('Citizen registered and session cookie set');
  } else bad('Registration failed', reg);

  const me = await req('GET', '/api/me');
  if (me.status === 200 && me.data.user?.name === 'রহিম মিয়া') {
    ok('/api/me returned registered citizen');
  } else bad('/api/me failed', me);

  // 8. Submit Application (from web app)
  const appSub = await req('POST', '/api/applications', {
    name: 'রহিম মিয়া',
    phone: testPhone,
    district: 'জয়পুরহাট',
    caseType: 'পারিবারিক — দেনমোহর ও ভরণপোষণ',
    problem: 'দেনমোহর পরিশোধ না করায় লিগ্যাল এইড চাই'
  });
  if (appSub.status === 200 && appSub.data.ok && appSub.data.appId) {
    ok(`Application submitted from web app format: ${appSub.data.appId}`);
  } else bad('Web application submission failed', appSub);

  const newAppId = appSub.data.appId;

  // 9. Track application
  const track = await req('POST', '/api/track', { appId: newAppId, last4: testPhone.slice(-4) });
  if (track.status === 200 && track.data.appId === newAppId && Array.isArray(track.data.stages)) {
    ok('Application tracked by ID and last 4 phone digits');
  } else bad('Track application failed', track);

  // 10. IVR simulator
  const ivr = await req('POST', '/api/ivr', { state: 'start' });
  if (ivr.status === 200 && Array.isArray(ivr.data.say)) {
    ok('IVR simulator returned voice prompt array');
  } else bad('IVR start failed', ivr);

  // 11. Role switch to dlao & dlao_queue
  await req('POST', '/api/role_switch', { role: 'dlao' });
  const queue = await req('GET', '/api/dlao_queue');
  if (queue.status === 200 && Array.isArray(queue.data.queue)) {
    ok(`DLAO queue accessed: ${queue.data.queue.length} items`);
  } else bad('DLAO queue failed', queue);

  // 12. Demo seed (5 personas A1-A5)
  const seedRes = await req('POST', '/api/demo_seed', {});
  if (seedRes.status === 200 && seedRes.data.personas?.A1) {
    ok(`5 Citizen personas seeded: A1=${seedRes.data.personas.A1}`);
  } else bad('Demo seed failed', seedRes);

  // 13. Role view for A1
  const rv = await req('GET', `/api/role_view?appId=${seedRes.data.personas.A1}`);
  if (rv.status === 200 && rv.data.record?.name === 'ময়ূরী আক্তার') {
    ok('Role view returned Moyuri Akter record with safe-contact and audit trail');
  } else bad('Role view failed', rv);

  // 14. B7 Case search & report
  const search = await req('POST', '/api/case_search', { q: 'ময়ূরী' });
  if (search.status === 200 && search.data.results?.length > 0) {
    ok('Case search found records matching query');
  } else bad('Case search failed', search);

  const report = await req('POST', '/api/case_report', {});
  if (report.status === 200 && report.data.total > 0 && Array.isArray(report.data.byStage)) {
    ok(`Case report generated: total ${report.data.total} cases analyzed`);
  } else bad('Case report failed', report);

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

server.listen(PORT, async () => {
  try {
    await run();
  } finally {
    server.close();
  }
});
