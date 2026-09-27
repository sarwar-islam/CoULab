// ADLASB প্রোভাইডার কনসোল — ৭ প্রোভাইডার সিনারিও + ১১ টেক চ্যালেঞ্জ এক পেজে টেস্টযোগ্য
async function modFetch(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function pageConsole() {
  if (!ME) return (location.hash = '#/login');
  const presetPersona = (location.hash.split('?')[1] || '').match(/persona=(A[1-5])/);
  app.innerHTML = `
  <div class="container page-head">
    <h1>🛠️ DLAS প্রোভাইডার কনসোল</h1>
    <p>এক শেয়ার্ড রেকর্ড — ৭ প্রোভাইডার রোল ও ১১ টেকনিক্যাল মডিউলের টেস্টযোগ্য ভিউ (রুলবুক: Part B + Part C)।</p>
  </div>
  <div class="container">
    <div class="form-card" style="max-width:none">
      <div class="field"><label>রোল নির্বাচন করুন (রোল-ভিত্তিক ভিউ — G9)</label>
        <select id="csRole">
          <option value="dlao">🏛️ DLAO কর্মকর্তা (B1)</option>
          <option value="mediator">⚖️ মধ্যস্থতাকারী (B2)</option>
          <option value="agent16699">📞 ১৬৬৯৯ এজেন্ট (B3)</option>
          <option value="udc">🏢 UDC উদ্যোক্তা (B4)</option>
          <option value="lawyer">👨‍⚖️ প্যানেল আইনজীবী (B5)</option>
          <option value="receiving">📥 গ্রহণকারী DLAO (B6)</option>
          <option value="staff">🗂️ কেস-সাপোর্ট স্টাফ (B7)</option>
        </select>
      </div>
      <div class="field" style="margin-top:.7rem"><label>আবেদন/কেস আইডি</label>
        <input id="csApp" placeholder="DLAS-NET-2026-… অথবা DLAS-CASE-…">
      </div>
      <div class="field" style="margin-top:.7rem"><label>🧑‍🤝‍🧑 রুলবুক সিনারিও (Part A) — এক ক্লিকে লোড</label>
        <div class="persona-row">
          <button class="btn btn-outline btn-sm" data-persona="A1">A1 ময়ূরী — সেফ-কন্টাক্ট</button>
          <button class="btn btn-outline btn-sm" data-persona="A2">A2 রিপন — প্রতিনিধি</button>
          <button class="btn btn-outline btn-sm" data-persona="A3">A3 নাবিলা — স্পর্শকাতর</button>
          <button class="btn btn-outline btn-sm" data-persona="A4">A4 নুচিং — UDC সহায়তা</button>
          <button class="btn btn-outline btn-sm" data-persona="A5">A5 মালেক — দীর্ঘস্থায়ী</button>
        </div>
      </div>
      <button class="btn btn-primary" id="csLoad" style="margin-top:.9rem">রেকর্ড লোড করুন</button>
      <div class="hint" style="margin-top:.5rem">💡 আইডি না থাকলে নিচের "ডেমো রেকর্ড তৈরি করুন" চাপুন — সাম্পল ডেটা দিয়ে সব ফ্লো টেস্ট করা যাবে।</div>
      <div id="csOut" style="margin-top:1rem"></div>
    </div>

    <h2 style="margin:1.6rem 0 .7rem">🧪 টেকনিক্যাল মডিউল (T1–T11) — সরাসরি টেস্ট</h2>
    <div class="module-grid" id="modGrid">
      ${[
        ['T1','👨‍⚖️','আইনজীবী আপডেট মিস — ওভারডিউ অ্যালার্ট','miss'],
        ['T2','🔀','জুরিসডিকশন পিং-পং — ২টি রিটার্নের পর এস্কালেশন','t2'],
        ['T3','🔗','এক ঘটনা, একাধিক কেস — লিংক (মার্জ নয়)','t3'],
        ['T4','👥','ডুপ্লিকেট ডিটেকশন — সাইড-বাই-সাইড মানব-রিভিউ','t4'],
        ['T5','💬','কথোপকথনে ইনটেক (AI সহায়ক — খুলে দেয়)','t5'],
        ['T6','📄','ডকুমেন্ট ব্রিফিং + চেকলিস্ট (মিসিং ফ্ল্যাগ)','t6'],
        ['T7','✍️','সেটেলমেন্ট ড্রাফট (AI খসড়া + হিউম্যান রিভিউ)','t7'],
        ['T8','🧠','মাল্টি-এজেন্ট ট্রায়াজ (৩ এজেন্ট + কনফ্লিক্ট)','t8'],
        ['T9','📡','অফলাইন সিঙ্ক — ডুপ্লিকেট ছাড়া + ইন্টিগ্রিটি','t9'],
        ['T10','📱','PWA — ইনস্টলেবল লো-ব্যান্ডউইথ','t10'],
        ['T11','🖋️','অ্যাসিনক্রোনাস ই-সিগনেচার + ভেরিফাই','t11']
      ].map(([id, ic, label, act]) => `
        <button class="module-card" data-m="${act}">
          <span class="mod-badge">${id}</span>
          <span class="mod-ic">${ic}</span>
          <span>${label}</span>
        </button>`).join('')}
    </div>
    <div id="modOut" style="margin-top:1rem"></div>
    <div class="form-error hidden" id="csErr" style="margin-top:.8rem"></div>

    <h2 style="margin:1.8rem 0 .7rem">📋 ম্যান্ডেটরি কভারেজ (২৩ আইটেম)</h2>
    <div class="form-card" style="max-width:none">
      <div class="quick-ans">রুলবুকের কভারেজ চেকলিস্ট — প্রতিটি আইটেম <strong>ইমপ্লিমেন্টেড · ইন্টিগ্রেটেড · টেস্টেবল</strong>। জুরি যেকোনো আইটেম লাইভ চেক করতে পারবেন।</div>
      <div class="form-grid" style="margin-top:.8rem">
        <div>
          <h3 style="margin:.2rem 0 .5rem">Part A — সিটিজেন সিনারিও</h3>
          <ul class="cov-list">
            <li><span class="cov-id">A1</span> ময়ূরী — সেফ-কন্টাক্ট, প্রতিনিধি, আইডেন্টিটি গ্যাপ <button class="btn btn-outline btn-sm" data-persona="A1">টেস্ট</button></li>
            <li><span class="cov-id">A2</span> রিপন — ব্লাইন্ড অ্যাক্সেস, কর্তৃত্বের স্কোপ <button class="btn btn-outline btn-sm" data-persona="A2">টেস্ট</button></li>
            <li><span class="cov-id">A3</span> নাবিলা — জরুরি, সংবেদনশীল অ্যাক্সেস, ট্র্যাকড রেফারেল <button class="btn btn-outline btn-sm" data-persona="A3">টেস্ট</button></li>
            <li><span class="cov-id">A4</span> নুচিং — অ্যাসিস্টেড, ভাষা/প্রোভেনেন্স, অফলাইন <button class="btn btn-outline btn-sm" data-persona="A4">টেস্ট</button></li>
            <li><span class="cov-id">A5</span> মালেক — দীর্ঘস্থায়ী স্টেটাস, আইনজীবী ফলো-আপ <button class="btn btn-outline btn-sm" data-persona="A5">টেস্ট</button></li>
          </ul>
          <h3 style="margin:1rem 0 .5rem">Part B — প্রোভাইডার রোল</h3>
          <ul class="cov-list">
            <li><span class="cov-id">B1</span> DLAO — অপারেশনাল ভিউ + ওভাররাইড <button class="btn btn-outline btn-sm" data-role="dlao">টেস্ট</button></li>
            <li><span class="cov-id">B2</span> মধ্যস্থতাকারী — রেজিস্ট্রেশন→আউটকাম + রিমোট <button class="btn btn-outline btn-sm" data-role="mediator">টেস্ট</button></li>
            <li><span class="cov-id">B3</span> ১৬৬৯৯ এজেন্ট — শেয়ার্ড লুক-আপ <button class="btn btn-outline btn-sm" data-role="agent16699">টেস্ট</button></li>
            <li><span class="cov-id">B4</span> UDC — অ্যাসিস্টেড ইনটেক + ফ্রি-নোটিশ <button class="btn btn-outline btn-sm" data-role="udc">টেস্ট</button></li>
            <li><span class="cov-id">B5</span> প্যানেল আইনজীবী — ওয়ার্কলিস্ট + accept/decline <button class="btn btn-outline btn-sm" data-role="lawyer">টেস্ট</button></li>
            <li><span class="cov-id">B6</span> গ্রহণকারী DLAO — রেফারেল + ack <button class="btn btn-outline btn-sm" data-role="receiving">টেস্ট</button></li>
            <li><span class="cov-id">B7</span> স্টাফ — সার্চ + রিপোর্ট (নিচে B7 টুল) <button class="btn btn-outline btn-sm" id="covB7">টেস্ট</button></li>
          </ul>
        </div>
        <div>
          <h3 style="margin:.2rem 0 .5rem">Part C — টেক চ্যালেঞ্জ</h3>
          <ul class="cov-list">
            <li><span class="cov-id">T1</span> আইনজীবী ইনঅ্যাকটিভিটি + পেমেন্ট-স্টেজ <button class="btn btn-outline btn-sm" data-m="miss">টেস্ট</button></li>
            <li><span class="cov-id">T2</span> জুরিসডিকশন পিং-পং + এস্কালেশন <button class="btn btn-outline btn-sm" data-m="t2">টেস্ট</button></li>
            <li><span class="cov-id">T3</span> এক ঘটনা একাধিক কেস — লিংক <button class="btn btn-outline btn-sm" data-m="t3">টেস্ট</button></li>
            <li><span class="cov-id">T4</span> ডুপ্লিকেট + হিউম্যান রিভিউ <button class="btn btn-outline btn-sm" data-m="t4">টেস্ট</button></li>
            <li><span class="cov-id">T5</span> কথোপকথনে বাংলা ইনটেক (AI সহায়ক) <button class="btn btn-outline btn-sm" data-m="t5">টেস্ট</button></li>
            <li><span class="cov-id">T6</span> ডকুমেন্ট ব্রিফ + চেকলিস্ট <button class="btn btn-outline btn-sm" data-m="t6">টেস্ট</button></li>
            <li><span class="cov-id">T7</span> সেটেলমেন্ট ড্রাফট <button class="btn btn-outline btn-sm" data-m="t7">টেস্ট</button></li>
            <li><span class="cov-id">T8</span> মাল্টি-এজেন্ট ট্রায়াজ <button class="btn btn-outline btn-sm" data-m="t8">টেস্ট</button></li>
            <li><span class="cov-id">T9</span> অফলাইন-ফার্স্ট সিঙ্ক <button class="btn btn-outline btn-sm" data-m="t9">টেস্ট</button></li>
            <li><span class="cov-id">T10</span> লো-ব্যান্ডউইথ PWA <a class="btn btn-outline btn-sm" href="/manifest.json" target="_blank">দেখুন</a></li>
            <li><span class="cov-id">T11</span> অ্যাসিনক্রোনাস ই-সিগনেচার <button class="btn btn-outline btn-sm" data-m="t11">টেস্ট</button></li>
          </ul>
        </div>
      </div>
    </div>
  </div>`;

  // ---- রুলবুক পার্সোনা লোডার (A1–A5) — কভারেজ সেকশনের বোতামসহ ----
  const loadPersona = async (key) => {
    hideErr();
    const s = await apiPost('demo_seed', {});
    if (s.error) return showErr(s.error);
    $('#csApp').value = s.personas[key] || '';
    $('#csLoad').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $$('[data-persona]').forEach((b) => { b.onclick = () => loadPersona(b.dataset.persona); });
  // হোম টাইল থেকে #/console?persona=AX দিয়ে এলে সরাসরি সিনারিও লোড
  if (presetPersona) setTimeout(() => loadPersona(presetPersona[1]), 60);
  // ---- কভারেজ: B-রোল বোতাম → রোল সুইচ + কিউ; T-বোতাম → মডিউল টেস্ট ----
  $$('[data-role]').forEach((b) => {
    b.onclick = async () => {
      hideErr();
      $('#csRole').value = b.dataset.role;
      $('#csApp').value = '';
      $('#csLoad').click();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });
  const covB7 = $('#covB7');
  if (covB7) covB7.onclick = () => { b7bar.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => $('#b7rep').click(), 500); };
  // কভারেজ T-বোতাম → #modGrid-এর একই মডিউল টেস্ট চালায়
  $$('.cov-list [data-m]').forEach((b) => {
    b.onclick = () => {
      const target = $(`#modGrid .module-card[data-m="${b.dataset.m}"]`);
      if (target) { target.click(); window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' }); }
    };
  });

  const $err = () => $('#csErr');
  const showErr = (m) => { const e = $err(); e.textContent = m; e.classList.remove('hidden'); };
  const hideErr = () => $err().classList.add('hidden');
  const currentRole = () => $('#csRole').value;
  const appId = () => $('#csApp').value.trim();

  // ---- ডেমো রেকর্ড তৈরি (সাম্পল ডেটা — রুলবুক অনুযায়ী ইলাস্ট্রেটিভ) ----
  $('#csLoad') && ($('#csLoad').onclick = async () => {
    hideErr();
    const role = currentRole();
    // রোল পরিবর্তন: লোকাল ওভাররাইড — সেশন রোল আপডেট করি
    await apiPost('role_switch', { role });
    const id = appId();
    if (!id) {
      const q = await apiGet('dlao_queue');
      if (q.error) return showErr(q.error);
      $('#csOut').innerHTML = `
        <div class="quick-ans"><strong>📋 অপারেশনাল কিউ (B1)</strong> — ${bnNum(q.queue.length)}টি রেকর্ড; ${esc(q.note)}</div>
        ${q.queue.map((x) => `
          <div class="app-card" data-app="${esc(x.appId)}">
            <span class="app-stage-icon">${x.emergency ? '🚨' : '📝'}</span>
            <span class="app-main">
              <span class="app-id">${esc(x.appId)} ${x.caseId ? '· ' + esc(x.caseId) : ''}</span>
              <span class="app-meta">${esc(x.name)} · ${esc(x.district)} · ${bnNum(x.ageDays)} দিন</span>
              <span class="app-meta">${x.flags.map((f) => '⚠️ ' + esc(f)).join(' · ') || 'কোনো ফ্ল্যাগ নেই'}</span>
            </span>
            <span class="app-right"><span class="badge">${bnNum(x.priorityHint)}</span><span class="app-chevron">›</span></span>
          </div>`).join('') || '<div class="empty-state">কিউ খালি</div>'}`;
      $$('#csOut .app-card').forEach((c) => c.onclick = () => { $('#csApp').value = c.dataset.app; $('#csLoad').click(); });
      return;
    }
    const rv = await apiGet('role_view', { appId: id });
    if (rv.error) return showErr(rv.error);
    const r = rv.record || {};
    $('#csOut').innerHTML = `
      <div class="quick-ans">
        <strong>${esc(rv.view)} ভিউ</strong> — ${esc(r.appId || id)} ${r.caseId ? '· কেস: ' + esc(r.caseId) : ''}
        ${r.stageLabel ? `<span class="badge">${esc(r.stageLabel)}</span>` : ''}
        ${r.safeContact ? '<div style="margin-top:.4rem">📵 সেফ-কন্টাক্ট সক্রিয় — যাচাই শুধু নিরাপদ নম্বরে</div>' : ''}
        ${r.representation ? `<div>🤝 প্রতিনিধি: ${esc(r.representation.repName)} (স্কোপ: ${esc(r.representation.scope)})</div>` : ''}
        ${rv.note ? `<p style="margin:.4rem 0 0;color:var(--muted)">${esc(rv.note)}</p>` : ''}
      </div>
      <h3 style="margin:1rem 0 .4rem">🧾 অডিট ট্রেইল (কে, কবে, কোন চ্যানেলে)</h3>
      <ul class="timeline">
        ${(r.audit || []).slice().reverse().map((a) => `<li class="done">
          <div class="tl-dot">•</div>
          <div class="tl-body"><strong>${esc(a.action)}</strong> — ${esc(a.actor || a.role || 'system')} <span class="badge">${esc(a.provenance || 'staff-entered')}</span>
          <span style="color:var(--muted);font-size:.8rem">${new Date(a.at).toLocaleString('bn-BD')}</span>
          ${a.detail ? `<div style="font-size:.85rem;color:var(--muted)">${esc(a.detail)}</div>` : ''}</div>
        </li>`).join('') || '<li>অডিট খালি</li>'}
      </ul>
      <div class="wizard-actions" style="margin-top:1rem">
        ${role === 'dlao' ? '<button class="btn btn-primary btn-sm" id="btnAccept">✅ গ্রহণ করুন (Case ID তৈরি)</button><button class="btn btn-outline btn-sm" id="btnSafe">📵 সেফ-কন্টাক্ট সেট</button><button class="btn btn-outline btn-sm" id="btnRef">📤 রেফারেল পাঠান</button>' : ''}
        ${role === 'mediator' ? '<button class="btn btn-primary btn-sm" id="btnMed">⚖️ মধ্যস্থতা শিডিউল</button><button class="btn btn-outline btn-sm" id="btnMedOut">🤝 ফলাফল রেকর্ড</button>' : ''}
        ${role === 'lawyer' ? `<button class="btn btn-primary btn-sm" id="btnLawUpd">📝 আপডেট জমা দিন</button>${r.lawyerStatus !== 'accepted' ? '<button class="btn btn-outline btn-sm" id="btnLawAcc">✅ নিয়োগ গ্রহণ (B5)</button>' : ''}<button class="btn btn-outline btn-sm" id="btnLawDec">❌ নিয়োগ বাতিল</button>` : ''}
        ${role === 'receiving' ? '<button class="btn btn-primary btn-sm" id="btnAck">✅ রেফারেল Acknowledge</button>' : ''}
      </div>
      ${role === 'staff' ? '<div class="quick-ans" style="margin-top:1rem"><strong>B7 টুল:</strong> নিচের সার্চ ও রিপোর্ট ব্যবহার করুন — ফিজিক্যাল ফাইল ছাড়াই কেস পুনঃনির্মাণ</div>' : ''}`;
    const bind = (id2, fn) => { const el = $(id2); if (el) el.onclick = fn; };
    bind('#btnAccept', async () => {
      const res = await apiPost('accept_application', { appId: appId(), decision: 'accept', note: 'যোগ্যতা যাচাইকৃত' });
      $('#modOut').innerHTML = `<div class="form-success">✅ ${esc(JSON.stringify(res))}</div>`;
      $('#csLoad').click();
    });
    bind('#btnSafe', async () => {
      const res = await apiPost('safe_contact', { appId: appId(), safeNumber: '01700-000000', unsafeNumbers: ['01800-999999'], window: 'সকাল ১১টা–দুপুর ১টা' });
      $('#modOut').innerHTML = `<div class="form-success">📵 ${esc(res.note || 'সেট হয়েছে')}</div>`;
      $('#csLoad').click();
    });
    bind('#btnRef', async () => {
      const res = await apiPost('referral', { appId: appId(), toDistrict: 'জয়পুরহাট', reason: 'এখতিয়ারভিত্তিক হস্তান্তর', sensitive: true });
      $('#modOut').innerHTML = `<div class="form-success">📤 রেফারেল পাঠানো হয়েছে — গ্রহণকারী ${esc(res.referral.toOffice)}, ${esc(res.referral.toDistrict)}; ডেডলাইন ৩ দিন</div>`;
    });
    bind('#btnAck', async () => {
      const res = await apiPost('referral_ack', { appId: appId(), decision: 'accepted', note: 'নথিপত্র সম্পূর্ণ — গ্রহণ করা হলো' });
      $('#modOut').innerHTML = `<div class="form-success">✅ ${esc(res.referral.status)} — দুই অফিসই এখন স্টেটাস দেখছে (B6)</div>`;
    });
    bind('#btnMed', async () => {
      const date = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      const res = await apiPost('mediation', { appId: appId(), action: 'schedule', date, mode: 'hybrid' });
      $('#modOut').innerHTML = `<div class="form-success">⚖️ মধ্যস্থতা শিডিউল: ${esc(res.mediation.date)} (${esc(res.mediation.mode)}) — রিমোট/হাইব্রিড অপশনসহ</div>`;
    });
    bind('#btnMedOut', async () => {
      const res = await apiPost('mediation', { appId: appId(), action: 'outcome', outcome: 'সমঝোতা হয়েছে — মাসিক ভরণপোষণ ৫,০০০৳' });
      $('#modOut').innerHTML = `<div class="form-success">🤝 ফলাফল রেকর্ড হয়েছে — ${esc(res.humanAuthority)}</div>`;
    });
    bind('#btnLawUpd', async () => {
      const res = await apiPost('lawyer', { appId: appId(), action: 'update', text: 'হিয়ারিং সম্পন্ন, পরবর্তী তারিখ ১৫/১০' });
      $('#modOut').innerHTML = `<div class="form-success">📝 আপডেট জমা হয়েছে — মোট ${bnNum(res.lawyer.updates)}টি</div>`;
    });
    bind('#btnLawAcc', async () => {
      const res = await apiPost('lawyer', { appId: appId(), action: 'respond', decision: 'accept' });
      $('#modOut').innerHTML = `<div class="form-success">✅ ${esc(res.note)} (B5)</div>`;
    });
    bind('#btnLawDec', async () => {
      const res = await apiPost('lawyer', { appId: appId(), action: 'respond', decision: 'decline', reason: 'সংঘার্থে ব্যস্ত — পুনঃনিয়োগ দরকার' });
      $('#modOut').innerHTML = `<div class="form-success">❌ ${esc(res.note)}</div>`;
    });
  });

  // ---- B7: কেস সার্চ + রুটিন রিপোর্ট (ডুপ্লিকেট ছাড়া) ----
  document.querySelectorAll('#b7bar').forEach((el) => el.remove());
  const b7bar = document.createElement('div');
  b7bar.id = 'b7bar';
  b7bar.className = 'form-card';
  b7bar.style.marginTop = '1.2rem';
  b7bar.innerHTML = `
    <h3 style="margin:0 0 .6rem">🗂️ B7 — কেস-সাপোর্ট স্টাফ: সার্চ + রিপোর্ট</h3>
    <div class="form-grid">
      <div class="field"><input id="b7q" placeholder="নাম / আইডি / জেলা / ফোন দিয়ে খুঁজুন"></div>
      <div style="display:flex;gap:.5rem;align-items:start">
        <button class="btn btn-primary btn-sm" id="b7go">🔍 সার্চ</button>
        <button class="btn btn-outline btn-sm" id="b7rep">📊 রুটিন রিপোর্ট</button>
      </div>
    </div>
    <div id="b7out" style="margin-top:.8rem"></div>`;
  $('#csErr').after(b7bar);
  $('#b7go').onclick = async () => {
    await apiPost('role_switch', { role: 'staff' });
    const r = await apiPost('case_search', { q: $('#b7q').value });
    $('#b7out').innerHTML = r.error ? `<div class="form-error">${esc(r.error)}</div>` : `
      <div class="quick-ans">${bnNum(r.total)}টি ফলাফল — ${esc(r.note)}</div>
      ${r.results.map((x) => `<div class="app-card" data-app="${esc(x.appId)}">
        <span class="app-main"><span class="app-id">${esc(x.appId)} ${x.caseId ? '· ' + esc(x.caseId) : ''}</span>
        <span class="app-meta">${esc(x.name)} · ${esc(x.district)} · ${esc(x.stageLabel)} · ${bnNum(x.tasks)}টি ওপেন টাস্ক</span></span>
        <span class="app-chevron">›</span></div>`).join('') || '<div class="empty-state">কিছু পাওয়া যায়নি</div>'}`;
    $$('#b7out .app-card').forEach((c) => c.onclick = () => { $('#csApp').value = c.dataset.app; $('#csRole').value = 'dlao'; $('#csLoad').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  };
  $('#b7rep').onclick = async () => {
    await apiPost('role_switch', { role: 'staff' });
    const r = await apiPost('case_report', {});
    $('#b7out').innerHTML = r.error ? `<div class="form-error">${esc(r.error)}</div>` : `
      <div class="quick-ans"><strong>📊 রুটিন রিপোর্ট</strong> — মোট ${bnNum(r.total)} আবেদন · কেস আইডিপ্রাপ্ত ${bnNum(r.withCaseId)} · জরুরি ${bnNum(r.emergency)} · ওপেন টাস্ক ${bnNum(r.openTasks)}</div>
      <div class="form-grid" style="margin-top:.6rem">
        <div class="quick-ans"><strong>ধাপ অনুযায়ী:</strong><ul style="margin:.3rem 0 0 1.2rem">${r.byStage.map((s) => `<li>${esc(s.stage)}: ${bnNum(s.count)}</li>`).join('')}</ul></div>
        <div class="quick-ans"><strong>ধরন অনুযায়ী:</strong><ul style="margin:.3rem 0 0 1.2rem">${Object.entries(r.byType).map(([k, v]) => `<li>${esc(k)}: ${bnNum(v)}</li>`).join('')}</ul></div>
      </div>
      <p style="color:var(--muted);font-size:.85rem">${esc(r.note)}</p>`;
  };

  // ---- মডিউল টেস্ট ----
  $$('#modGrid .module-card').forEach((card) => {
    card.onclick = async () => {
      hideErr();
      const m = card.dataset.m;
      const out = $('#modOut');
      const id = appId() || (BOOT.demoAppId || '');
      const run = async (label, p) => {
        const r = await p;
        out.innerHTML = `<div class="quick-ans"><strong>${label}</strong><pre class="mod-json">${esc(JSON.stringify(r, null, 1))}</pre></div>`;
      };
      if (m === 'miss') return run('T1 — আইনজীবী ২টি আপডেট মিস করলে', apiPost('lawyer', { appId: id, action: 'miss' }));
      if (m === 't2') return run('T2 — জুরিসডিকশন পিং-পং এস্কালেশন', apiPost('jurisdiction', { appId: id, action: 'return', from: 'শ্রম সেল', reason: 'এখতিয়ার নেই' }));
      if (m === 't3') return run('T3 — লিংক (মার্জ নয়)', apiPost('link_cases', { appIds: [id, id], sharedEvidence: 'অগ্নিকাণ্ডের সাধারণ রিপোর্ট' }).then((r) => r.error ? r : r));
      if (m === 't4') return run('T4 — ডুপ্লিকেট চেক (সাইড-বাই-সাইড)', apiPost('duplicate_check', { name: 'ময়ূরী আক্তার', phone: '01700000001', district: 'জয়পুরহাট', caseType: 'পারিবারিক' }));
      if (m === 't5') { location.hash = '#/'; setTimeout(() => window.__chatOpen && window.__chatOpen(), 500); return; }
      if (m === 't6') return run('T6 — ডকুমেন্ট ব্রিফিং + চেকলিস্ট (মিসিং/অস্পষ্ট ফ্ল্যাগ)', modFetch('/api/doc_brief', { caseType: 'ভূমি', documents: [{ name: 'দলিল-স্ক্যান.pdf', summary: '৭২ ডিমান্ড, খতিয়ান ৯১' }, { name: 'অস্পষ্ট-ছবি.jpg', unclear: true }] }));
      if (m === 't7') return run('T7 — সেটেলমেন্ট ড্রাফট (AI খসড়া + হিউম্যান রিভিউ)', modFetch('/api/settlement_draft', { kind: 'maintenance', notes: 'মাসিক ৫০০০ টাকা, ৫ তারিখের মধ্যে পরিশোধ' }));
      if (m === 't8') return run('T8 — মাল্টি-এজেন্ট ট্রায়াজ (৩ এজেন্ট + কনফ্লিক্ট)', modFetch('/api/triage', { caseType: 'পারিবারিক', emergency: true, nid: '', district: 'জয়পুরহাট' }));
      if (m === 't9') return run('T9 — অফলাইন সিঙ্ক (৩ রেকর্ড, ইউনিক clientId)', apiPost('sync_push', { items: [ { clientId: 'uuid-demo-1', name: 'নুচিং মারমা', phone: '01900000001', district: 'খাগড়াছড়ি', caseType: 'ভূমি', problem: 'অফলাইন টেস্ট ১' }, { clientId: 'uuid-demo-2', name: 'পরীক্ষা কর্মী', phone: '01900000002', district: 'খাগড়াছড়ি', caseType: 'শ্রম', problem: 'অফলাইন টেস্ট ২' }, { clientId: 'uuid-demo-3', name: 'তৃতীয় পরীক্ষা', phone: '01900000003', district: 'খাগড়াছড়ি', caseType: 'পারিবারিক', problem: 'অফলাইন টেস্ট ৩' } ] }));
      if (m === 't10') return run('T10 — PWA ম্যানিফেস্ট', fetch('/api/pwa_manifest').then((r) => r.json()));
      if (m === 't11') {
        const prep = await apiPost('esign', { appId: id, action: 'prepare', document: 'ভরণপোষণ সমঝোতা — খসড়া চূড়ান্ত' });
        const s1 = await apiPost('esign', { appId: id, action: 'sign', party: 'স্ত্রী', pin: '1234', offline: true });
        const s2 = await apiPost('esign', { appId: id, action: 'sign', party: 'স্বামী', pin: '5678' });
        const ver = await apiPost('esign', { appId: id, action: 'verify' });
        return run('T11 — ই-সিগনেচার: প্রস্তুত → ২ স্বাক্ষর (১টি অফলাইন) → ভেরিফাই', Promise.resolve(ver));
      }
    };
  });
}
