/**
 * ডিজিটাল আইনি সেবা (DLAS) — SPA Router & Complete Portal Frontend
 * Five Doors, One Record. Integrated Digital Legal Aid System for Bangladesh.
 */
'use strict';

// ---------- ছোট helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

let BOOT = null;           // /api/bootstrap থেকে আসা ডেটা
let ME = null;             // লগইন করা ইউজার
const bnNum = (s) => String(s).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

// ---------- ইউনিফায়েড লগআউট (user + console — দুই পাশেই নির্ভরযোগ্য) ----------
// সার্ভারে /api/logout কল করে সেশন ডিলিট করে + দুটি কুকিই এক্সপায়ার করে +
// লোকাল স্টেট (ME) রিসেট করে। এরপর ব্যাক নেভিগেশনেও লগইন অবস্থায় ফেরা যায় না।
async function doLogout() {
  try { await apiPost('logout', {}); } catch (e) { /* সার্ভার না পাওয়া গেলেও ক্লায়েন্ট সাইডে লগআউট হবে */ }
  // কুকি ফর্স-ক্লিয়ার (ব্রাউজার সাইড ব্যাকআপ)
  ['dlas_session', 'session'].forEach((name) => {
    document.cookie = name + '=; Path=/; Max-Age=0; SameSite=Lax';
    document.cookie = name + '=; Path=/; Max-Age=0;';
  });
  ME = null;
  renderAuthLink();
}

// সেশন কুকি কি সত্যিই মুছে গেছে? — লগআউট যাচাইয়ের জন্য
function hasSessionCookie() {
  return document.cookie.split(';').some((c) => {
    const n = c.trim().split('=')[0];
    return n === 'dlas_session' || n === 'session';
  }) && (document.cookie.includes('dlas_session=') && !document.cookie.includes('dlas_session=;') && document.cookie.match(/(dlas_session|session)=[^\s;]+/) !== null);
}

// SQLite API-র case-type আইডি → বাংলা লেবেল (dashboard/track দেখানোর জন্য)
const SQL_CASE_TYPE_BN = {
  MAINTENANCE: 'ভরণপোষণ', DOMESTIC_VIOLENCE: 'পারিবারিক সহিংসতা', DOWRY: 'যৌতুক',
  LAND_DISPUTE: 'ভূমি বিরোধ', LABOUR_WAGES: 'শ্রম ও মজুরি', CYBER_HARASSMENT: 'অনলাইন হয়রানি',
  FRAUD: 'প্রতারণা', OTHER: 'অন্যান্য',
  // পাবলিক ফরমের ছোট হাতের আইডি
  family: 'পারিবারিক', safety: 'নিরাপত্তা ও সুরক্ষা', land: 'ভূমি ও সম্পত্তি',
  money: 'অর্থ ও চেক', labour: 'শ্রমিক অধিকার', cyber: 'সাইবার হয়রানি',
  crime: 'ফৌজদারি ও জামিন', civil: 'দেওয়ানি', govt: 'সরকারি সেবা', women: 'নারী নির্যাতন'
};
function ctLabel(id) {
  if (!id) return 'সাধারণ';
  if (SQL_CASE_TYPE_BN[id]) return SQL_CASE_TYPE_BN[id];
  const c = ((BOOT && BOOT.caseTypes) || []).find((x) => x.id === id);
  return (c && c.label) || id;
}
// Application status → dashboard stage (0-4)
function stageFromStatus(status, caseStatus) {
  switch (status) {
    case 'SUBMITTED': return 0;
    case 'UNDER_REVIEW': case 'MORE_INFO_NEEDED': return 1;
    case 'ACCEPTED': return 2;
    case 'CONVERTED_TO_CASE': {
      if (caseStatus === 'CLOSED') return 4;
      if (caseStatus === 'LAWYER_ASSIGNED' || caseStatus === 'IN_SERVICE') return 3;
      return 2;
    }
    case 'REJECTED': return 4;
    default: return 0;
  }
}

async function apiGet(name, params = {}) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch('/api/' + name + (q ? '?' + q : ''));
  return r.json();
}
async function apiPost(name, body) {
  try {
    const r = await fetch('/api/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return await r.json();
  } catch (err) {
    console.error('apiPost error:', err);
    return { error: 'সার্ভার যোগাযোগে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।' };
  }
}

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ---------- থিম / ভাষা / a11y ----------
function initShell() {
  // ভাষা টগল
  const savedLang = localStorage.getItem('lang') || 'bn';
  document.documentElement.lang = savedLang;
  const langToggleBtn = $('#langToggle');
  if (langToggleBtn) {
    langToggleBtn.textContent = savedLang === 'en' ? 'বাং বাংলা' : '文A English';
    langToggleBtn.onclick = () => {
      const next = document.documentElement.lang === 'bn' ? 'en' : 'bn';
      document.documentElement.lang = next;
      localStorage.setItem('lang', next);
      langToggleBtn.textContent = next === 'en' ? 'বাং বাংলা' : '文A English';
      if (typeof applyI18n === 'function') applyI18n();
      route();
    };
  }

  // প্রবেশগম্যতা
  const a11y = JSON.parse(localStorage.getItem('a11y') || '{}');
  if (a11y.fscale) document.documentElement.style.setProperty('--fscale', a11y.fscale);
  if (a11y.contrast) document.documentElement.dataset.contrast = 'high';
  const a11yToggle = $('#a11yToggle');
  if (a11yToggle) a11yToggle.onclick = () => $('#a11yPanel').classList.toggle('hidden');
  const floatingA11y = $('#floatingA11yBtn');
  if (floatingA11y) {
    floatingA11y.onclick = () => $('#a11yPanel').classList.toggle('hidden');
  }
  const fsInc = $('#fsInc');
  if (fsInc) fsInc.onclick = () => setFscale(Math.min(1.5, (a11y.fscale || 1) + .1));
  const fsDec = $('#fsDec');
  if (fsDec) fsDec.onclick = () => setFscale(Math.max(.8, (a11y.fscale || 1) - .1));
  const contrastToggle = $('#contrastToggle');
  if (contrastToggle) {
    contrastToggle.onclick = () => {
      const on = document.documentElement.dataset.contrast === 'high';
      if (on) delete document.documentElement.dataset.contrast;
      else document.documentElement.dataset.contrast = 'high';
      a11y.contrast = !on;
      localStorage.setItem('a11y', JSON.stringify(a11y));
    };
  }
  const a11yReset = $('#a11yReset');
  if (a11yReset) {
    a11yReset.onclick = () => {
      localStorage.removeItem('a11y');
      location.reload();
    };
  }
  function setFscale(v) {
    a11y.fscale = Math.round(v * 10) / 10;
    document.documentElement.style.setProperty('--fscale', a11y.fscale);
    localStorage.setItem('a11y', JSON.stringify(a11y));
  }

  // মোবাইল মেনু
  const navBurger = $('#navBurger');
  const mainNav = $('#mainNav');
  if (navBurger && mainNav) {
    navBurger.onclick = (e) => {
      e.stopPropagation();
      const isOpen = mainNav.classList.toggle('open');
      navBurger.setAttribute('aria-expanded', isOpen);
      navBurger.textContent = isOpen ? '✕' : '☰';
    };
    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        navBurger.textContent = '☰';
      });
    });
    document.addEventListener('click', (e) => {
      if (!mainNav.contains(e.target) && !navBurger.contains(e.target)) {
        mainNav.classList.remove('open');
        navBurger.textContent = '☰';
      }
    });
  }

  // চ্যাট উইজেট
  initChatBot();
}

// ---------- চ্যাটবট লজিক (Bangla + Banglish + English + Web/Legal Search) ----------
function initChatBot() {
  const chatBody = $('#chatBody');
  const chatWidget = $('#chatWidget');
  const chatFab = $('#chatFab');
  const chatClose = $('#chatClose');
  const chatForm = $('#chatForm');
  const chatText = $('#chatText');

  if (!chatFab || !chatWidget) return;

  const chatOpen = () => {
    chatWidget.classList.remove('hidden');
    if (chatText) chatText.focus();
  };
  chatFab.onclick = () => {
    if (chatWidget.classList.contains('hidden')) chatOpen();
    else chatWidget.classList.add('hidden');
  };
  if (chatClose) chatClose.onclick = () => chatWidget.classList.add('hidden');
  window.__chatOpen = chatOpen;

  const renderActions = (r) => {
    if (!r.actions && !r.action) return;
    const wrap = document.createElement('div');
    wrap.className = 'chat-actions';
    const mkBtn = (html, cls, fn) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-chip ' + cls;
      btn.innerHTML = html;
      btn.onclick = fn;
      return btn;
    };
    if (r.action && r.action.route) {
      wrap.appendChild(mkBtn(esc(r.action.label || r.action.route), 'primary', () => {
        chatWidget.classList.add('hidden');
        location.hash = r.action.route;
      }));
    }
    const acts = {
      home: ['#/', ' হোম'],
      library: ['#/topics', ' আইনি তথ্য'],
      guide: ['#/guide', ' পরামর্শ গাইড'],
      apply: ['#/apply', ' আবেদন করুন'],
      track: ['#/track', ' ট্র্যাকিং'],
      offices: ['#/offices', ' অফিস খুঁজুন'],
      news: ['#/news', ' নিউজ ও ইভেন্ট'],
      help: ['#/help', ' সহায়তা চ্যানেল'],
      call: ['#/call', ' কল ১৬৬৯৯'],
      dashboard: ['#/dashboard', ' ড্যাশবোর্ড']
    };
    for (const key of r.actions || []) {
      const a = acts[key];
      if (!a) continue;
      wrap.appendChild(mkBtn(a[1], '', () => {
        chatWidget.classList.add('hidden');
        location.hash = a[0];
      }));
    }
    if (wrap.children.length) chatBody.appendChild(wrap);
  };

  const renderQuick = (r) => {
    if (!r.quick || !r.quick.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'chat-actions quick';
    for (const q of r.quick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-chip';
      btn.textContent = q;
      btn.onclick = () => {
        sendChat(q);
      };
      wrap.appendChild(btn);
    }
    chatBody.appendChild(wrap);
  };

  // Client-side local smart search & fallback knowledge base
  function localSmartSearch(raw) {
    const q = raw.toLowerCase().trim();
    const isEn = document.documentElement.lang === 'en' || /^[a-z0-9\s.,?!]+$/.test(q);

    // 1. Greetings
    if (/\b(hi|hello|hey|salam|assalamu|nomoskar|কেমন)\b/i.test(q)) {
      return {
        reply: isEn
          ? "Hello!  I am your Digital Legal Aid Assistant. You can ask me any question about legal procedures, free counsel, court petitions, mediation, or land rights in Bangladesh."
          : "আসসালামু আলাইকুম!  আমি আপনার ডিজিটাল আইনি সহকারী। সরকারি খরচে বিনামূল্যে আইনি পরামর্শ, আইনজীবী নিয়োগ, পারিবারিক বা জমির বিরোধ নিষ্পত্তি সম্পর্কে যেকোনো প্রশ্ন করতে পারেন।",
        actions: ['apply', 'track', 'library', 'offices', 'help'],
        quick: isEn ? ['How to apply for legal aid?', 'Is it free?', 'Track application', 'Land dispute'] : ['কীভাবে আবেদন করব?', 'সেবা কি সম্পূর্ণ ফ্রি?', 'আবেদন ট্র্যাক করব কীভাবে?', 'জমির সমস্যা']
      };
    }

    // 2. Divorce / Family
    if (/(তালাক|বিবাহবিচ্ছেদ|দেনমোহর|ভরণপোষণ|খোরপোশ|divorce|talaq|talak|denmohor|maintenance|dower)/i.test(q)) {
      return {
        reply: isEn
          ? "Under the Muslim Family Laws Ordinance 1961, divorce requires written notice to the Union Parishad Chairman/Mayor and a copy to the spouse. The notice takes effect after 90 days. For dower or maintenance, you can file directly in the Family Court under the Family Courts Act 2023 without court fees, or apply for free legal aid through DLAS."
          : "মুসলিম পারিবারিক আইন অধ্যাদেশ ১৯৬১ অনুযায়ী তালাকের ক্ষেত্রে চেয়ারম্যান/মেয়র বরাবর লিখিত নোটিশ পাঠাতে হয় এবং স্ত্রী/স্বামীকে অনুলিপি দিতে হয়। নোটিশ প্রাপ্তির ৯০ দিন পর এটি কার্যকর হয়। দেনমোহর ও ভরণপোষণের জন্য পারিবারিক আদালত আইন ২০২৩ অনুযায়ী বিনামূল্যে সরকারি লিগ্যাল এইডের সহায়তায় সরাসরি মামলা বা মধ্যস্থতা করা যায়।",
        action: { route: '#/topic/family', label: ' পারিবারিক আইনি তথ্য দেখুন' },
        actions: ['apply', 'guide', 'library'],
        quick: ['দেনমোহর আদায়ের নিয়ম', 'সন্তানের হেফাজত', 'আবেদন ফরম খুলুন']
      };
    }

    // 3. Land / Property
    if (/(জমি|দলিল|খতিয়ান|পর্চা|নামজারি|দখল|উচ্ছেদ|land|mutation|property|jomir|jomi|dokhol)/i.test(q)) {
      return {
        reply: isEn
          ? "For land disputes, fraudulent deeds, or unauthorized occupation, you can seek legal protection. Under the Land Reform Act and Specific Relief Act, you can file a suit for recovery of possession or challenge forged documents. District Legal Aid Offices provide free panel lawyers for eligible citizens."
          : "জমি জবরদখল, ভুয়া দলিল বা নামজারি জটিলতার ক্ষেত্রে নির্দিষ্ট প্রতিকার আইন ও ভূমি আইনের অধীনে দেওয়ানি আদালতে মামলা বা জেলা লিগ্যাল এইড অফিসে মধ্যস্থতার আবেদন করা যায়। সরকারি খরচে প্যানেল আইনজীবী পেতে এখনই আবেদন দাখিল করতে পারেন।",
        action: { route: '#/topic/land', label: ' ভূমি ও বাসস্থান অধিকার দেখুন' },
        actions: ['apply', 'library', 'offices'],
        quick: ['জমি দখলমুক্ত করার উপায়', 'ভুয়া দলিল বাতিল', 'নতুন আবেদন']
      };
    }

    // 4. Criminal / Bail
    if (/(জামিন|গ্রেপ্তার|পুলিশ|থানা|মামলা|জিডি|bail|police|thana|arrest|crime|jail)/i.test(q)) {
      return {
        reply: isEn
          ? "Every undertrial prisoner or accused person has a constitutional right to legal representation. If you or a family member cannot afford a lawyer, the District Legal Aid Officer (DLAO) will appoint a defense lawyer at state expense. Call toll-free 16699 for immediate help."
          : "আটক বিচারাধীন বন্দীদের জামিন আবেদন ও আইনজীবী নিয়োগের জন্য জেলা লিগ্যাল এইড অফিস সম্পূর্ণ সরকারি খরচে আইনজীবী বরাদ্দ করে। ফৌজদারি কার্যবিধি ও লিগ্যাল এইড আইনের অধীনে কোনো ফি দিতে হয় না। জরুরি সহায়তার জন্য ১৬৬৯৯-এ কল করুন।",
        action: { route: '#/apply?emergency=true', label: ' জরুরি জামিন আবেদন' },
        actions: ['apply', 'call', 'offices']
      };
    }

    // 5. Tracking
    if (/(track|ট্র্যাক|অবস্থা|status|kothay|কোথায়)/i.test(q)) {
      return {
        reply: isEn
          ? "You can track your application anytime using your Application ID and the last 4 digits of your phone or NID. No account password is required."
          : "আপনার আবেদন আইডি (যেমন APP-2026-0001 বা DLAS-NET-2026-04417) এবং মোবাইল বা এনআইডির শেষ ৪ ডিজিট দিয়ে যেকোনো সময় রিয়েলটাইম অবস্থা ট্র্যাক করতে পারেন।",
        action: { route: '#/track', label: ' ট্র্যাকিং পেজে যান' },
        actions: ['track', 'home']
      };
    }

    // 6. Cost / Free Service
    if (/(free|টাকা|খরচ|ফি|cost|fee|poisa|khoroch)/i.test(q)) {
      return {
        reply: isEn
          ? "All DLAS legal aid services are 100% free of cost funded by the Government of Bangladesh. No citizen has to pay any application fee, lawyer fees, or court fees. If anyone asks for money, report immediately to helpline 16699."
          : "জাতীয় আইনগত সহায়তা প্রদান সংস্থা (NLASO)-র এই সেবা সম্পূর্ণ সরকারি খরচে বিনামূল্যে প্রদান করা হয়। আবেদন ফি, আইনজীবী ফি বা আদালত ফি বাবদ কোনো অর্থ দিতে হয় না। কেউ অর্থ দাবি করলে ১৬৬৯৯-এ অভিযোগ জানান।",
        action: { route: '#/apply', label: ' বিনামূল্যে আবেদন করুন' },
        actions: ['apply', 'help', 'offices']
      };
    }

    // Default intelligent response
    return {
      reply: isEn
        ? "I understand your query regarding \"" + esc(raw) + "\". As part of the Bangladesh Digital Legal Aid Portal (DLAS), we provide free consultation, panel lawyers, and dispute mediation (ADR). You can apply online, browse statutory resources, or speak with an officer."
        : "আপনার প্রশ্ন \"" + esc(raw) + "\" সম্পর্কে বিস্তারিত সহায়তা পেতে নিচের সেবাগুলো ব্যবহার করতে পারেন। আপনি সরাসরি সরকারি খরচে আইনি সহায়তার আবেদন করতে পারেন, জেলা অফিস খুঁজে নিতে পারেন অথবা টোল-ফ্রি ১৬৬৯৯ নম্বরে ফোন করতে পারেন।",
      actions: ['apply', 'guide', 'library', 'offices', 'help'],
      quick: ['নতুন আবেদন করুন', 'আবেদন ট্র্যাক করুন', 'নিকটস্থ অফিস খুঁজুন']
    };
  }

  const sendChat = async (override) => {
    const txt = (override != null ? override : chatText.value).trim();
    if (!txt) return;
    if (override == null) chatText.value = '';

    chatBody.insertAdjacentHTML('beforeend', '<div class="msg user">' + esc(txt) + '</div>');
    chatBody.scrollTop = chatBody.scrollHeight;

    const typing = document.createElement('div');
    typing.className = 'msg bot typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    chatBody.appendChild(typing);
    chatBody.scrollTop = chatBody.scrollHeight;

    let res = null;
    try {
      res = await apiPost('chat', { message: txt });
    } catch (e) {
      console.warn('Chat API offline, using local smart search:', e);
    }

    typing.remove();

    if (!res || !res.reply || res.reply.includes('undefined')) {
      res = localSmartSearch(txt);
    }

    const reply = String(res.reply || 'আপনার প্রশ্নটির উত্তর খুঁজে পাওয়া যায়নি। ১৬৬৯৯ হেল্পলাইনে যোগাযোগ করুন।');
    const fmt = esc(reply).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    chatBody.insertAdjacentHTML('beforeend', '<div class="msg bot">' + fmt + '</div>');

    renderActions(res);
    renderQuick(res);
    chatBody.scrollTop = chatBody.scrollHeight;
  };

  if (chatForm) {
    chatForm.onsubmit = async (e) => {
      e.preventDefault();
      await sendChat();
    };
  }
}

// ---------- USSD সেকশন (openUssdSimulator) এখন পূর্ণ পেজে সরানো হয়েছে → pageUssd ----------
// পুরনো মডাল সিমুলেটর আর ব্যবহার হয় না; নিচের pageUssd ও pageVoice দেখুন।
function openUssdSimulator() {
  location.hash = '#/ussd';
}

function openUssdSimulatorOld() {
  const existing = $('#ussdSimulatorModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'ussdSimulatorModal';
  modal.className = 'ussd-modal-overlay';

  let currentScreen = 'main';
  let historyText = '*16699# ডায়াল করা হচ্ছে...\n\n১. বাংলা (Bangla)\n২. English\n\nপছন্দ নম্বর লিখে Send চাপুন:';

  const updateScreen = (text, title = 'NLASO USSD · *16699#') => {
    $('#ussdScreenHeader').textContent = title;
    $('#ussdScreenText').textContent = text;
    $('#ussdScreenInput').value = '';
    $('#ussdScreenInput').focus();
  };

  modal.innerHTML = `
    <div class="ussd-phone">
      <button class="ussd-phone-close" id="closeUssd">✕</button>
      <div style="text-align:center;font-size:0.75rem;color:#94A3B8;margin-bottom:8px">জাতীয় আইনি সহায়তা · NLASO</div>
      <div class="ussd-screen">
        <div class="ussd-screen-header" id="ussdScreenHeader">NLASO USSD · *16699#</div>
        <div class="ussd-screen-text" id="ussdScreenText">${historyText}</div>
        <div class="ussd-input-row">
          <input class="ussd-input" id="ussdScreenInput" maxlength="10" placeholder="ইনপুট দিন..." autocomplete="off">
          <button class="btn btn-primary btn-sm" id="btnUssdSend">Send</button>
        </div>
      </div>
      <div class="ussd-keypad">
        <button class="ussd-key" data-k="1">1<sub>&nbsp;</sub></button>
        <button class="ussd-key" data-k="2">2<sub>ABC</sub></button>
        <button class="ussd-key" data-k="3">3<sub>DEF</sub></button>
        <button class="ussd-key" data-k="4">4<sub>GHI</sub></button>
        <button class="ussd-key" data-k="5">5<sub>JKL</sub></button>
        <button class="ussd-key" data-k="6">6<sub>MNO</sub></button>
        <button class="ussd-key" data-k="7">7<sub>PQRS</sub></button>
        <button class="ussd-key" data-k="8">8<sub>TUV</sub></button>
        <button class="ussd-key" data-k="9">9<sub>WXYZ</sub></button>
        <button class="ussd-key" data-k="*">*<sub>+</sub></button>
        <button class="ussd-key" data-k="0">0<sub>_</sub></button>
        <button class="ussd-key" data-k="#">#<sub>#</sub></button>
      </div>
      <div style="text-align:center;margin-top:12px">
        <button class="btn btn-ghost btn-sm" style="color:#94A3B8" id="btnUssdReset">রিসেট ডায়াল</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  $('#closeUssd').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  $$('.ussd-key', modal).forEach(btn => {
    btn.onclick = () => {
      const inp = $('#ussdScreenInput');
      inp.value += btn.dataset.k;
    };
  });

  const handleInput = (val) => {
    val = val.trim();
    if (currentScreen === 'main') {
      if (val === '1' || val === '১') {
        currentScreen = 'menu_bn';
        updateScreen('আইনগত সহায়তা সেবা:\n\n১. নতুন আবেদন দাখিল\n২. আবেদনের অবস্থা যাচাই\n৩. জেলা লিগ্যাল এইড অফিসের তথ্য\n৪. জরুরি হেল্পলাইন কল');
      } else if (val === '2' || val === '২') {
        currentScreen = 'menu_en';
        updateScreen('Legal Aid Services:\n\n1. New Legal Aid Application\n2. Track Application\n3. District Office Information\n4. Direct Helpline Call');
      } else {
        updateScreen('ভুল ইনপুট। অনুগ্রহ করে ১ অথবা ২ চাপুন:\n\n১. বাংলা\n২. English');
      }
    } else if (currentScreen === 'menu_bn') {
      if (val === '১' || val === '1') {
        currentScreen = 'applied';
        const demoAppId = 'APP-2026-' + Math.floor(1000 + Math.random() * 9000);
        updateScreen('ধন্যবাদ! আপনার USSD আবেদন দাখিল সম্পন্ন হয়েছে।\n\nআবেদন আইডি: ' + demoAppId + '\nএসএমএস নিশ্চিতকরণ পাঠানো হয়েছে। ৩ দিনের মধ্যে কর্মকর্তা ফোন করবেন।\n\n০ চাপুন প্রধান মেনুর জন্য।', 'সফল');
      } else if (val === '২' || val === '2') {
        currentScreen = 'track_input';
        updateScreen('আপনার আবেদন আইডির সংখ্যাসমূহ লিখুন (যেমন 20260001):');
      } else if (val === '৩' || val === '3') {
        updateScreen('নিকটস্থ লিগ্যাল এইড অফিস:\n\nজেলা জজ আদালত ভবন, সর্বমোট ৬৪ জেলায় অফিস রয়েছে। সকাল ৯টা থেকে বিকাল ৫টা পর্যন্ত সরাসরি উপস্থিত হয়ে সেবা নিতে পারবেন।\n\n০ চাপুন মেনুর জন্য।');
      } else if (val === '৪' || val === '4') {
        updateScreen('সরাসরি টোল-ফ্রি ১৬৬৯৯ নম্বরে ফোন কল করা হচ্ছে...\n\n(টোল ফ্রি কল চালু রয়েছে)');
      } else if (val === '০' || val === '0') {
        currentScreen = 'main';
        updateScreen('*16699# ডায়াল করা হচ্ছে...\n\n১. বাংলা (Bangla)\n২. English\n\nপছন্দ নম্বর লিখে Send চাপুন:');
      }
    } else if (currentScreen === 'track_input') {
      updateScreen('আবেদন স্ট্যাটাস: চলমান (UNDER REVIEW)\nকেস: পারিবারিক ও দেনমোহর বিরোধ\nকর্মকর্তা পর্যালোচনা করছেন।\n\n০ চাপুন মেনুর জন্য।', 'ট্র্যাকিং তথ্য');
      currentScreen = 'menu_bn';
    } else {
      currentScreen = 'main';
      updateScreen('*16699# ডায়াল করা হচ্ছে...\n\n১. বাংলা (Bangla)\n২. English\n\nপছন্দ নম্বর লিখে Send চাপুন:');
    }
  };

  $('#btnUssdSend').onclick = () => handleInput($('#ussdScreenInput').value);
  $('#ussdScreenInput').onkeydown = (e) => {
    if (e.key === 'Enter') handleInput($('#ussdScreenInput').value);
  };
  $('#btnUssdReset').onclick = () => {
    currentScreen = 'main';
    updateScreen('*16699# ডায়াল করা হচ্ছে...\n\n১. বাংলা (Bangla)\n২. English\n\nপছন্দ নম্বর লিখে Send চাপুন:');
  };
}

window.openUssdSimulator = openUssdSimulator;
window.openUssdSimulatorOld = openUssdSimulatorOld;

// ============================================================================
// ভয়েস AI সহকারী পূর্ণ পেজ (pageVoice) — #/voice
// উপরে নির্দেশিকা + সাধারণ প্রশ্ন; নিচে ভয়েস-ফোন (হালকা ডার্ক ডিজাইন)।
// মাইক বাটনে ক্লিক করলে Web Speech API দিয়ে যা বলা হয় তা লাইভ টেক্সটে ওঠে
// (ব্রাউজার সাপোর্ট না থাকলে ডেমো লাইন প্রদর্শন হয়)। তারপর "আবেদন জমা দিন"
// চাপলে বিদ্যমান /api/applications দিয়ে জমা হয়ে ড্যাশবোর্ডে চলে যায়।
// ============================================================================
async function pageVoice() {
  const sampleQuestions = [
    { icon: '‍‍', q: 'স্বামী ভরণপোষণ দেয় না, কী করবো?' },
    { icon: '', q: 'জমির দলিল ভুয়া করে দখল নিয়েছে' },
    { icon: '', q: 'কারখানা ৩ মাসের বেতন দেয়নি' },
    { icon: '', q: 'পারিবারিক নির্যাতনের শিকার, সাহায্য চাই' },
    { icon: '', q: 'কারাবন্দি ভাইয়ের জামিনের জন্য কী করবো' },
    { icon: '', q: 'ঋণখেলাপি হয়ে জেল খাটছি, পরামর্শ দিন' }
  ];

  const V = { transcript: '', recording: false, recog: null, answered: false };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const srSupported = !!SR;

  app.innerHTML = `
  <div class="container page-head">
    <div class="breadcrumb"><a href="#/">হোম</a> / সহায়তা চ্যানেল / ভয়েস সহকারী</div>
    <span class="section-tag">কথা বলুন — আমরা লিখে আবেদন করে দেবো</span>
    <h1> ভয়েস AI সহকারী — বলে আবেদন করুন</h1>
    <p>লিখতে না পারলেও সমস্যা নেই — মাইকে বাংলায় যা বলবেন, তা-ই লেখা হয়ে আবেদন হয়ে যাবে। বাংলা, ইংরেজি ও আঞ্চলিক ভাষায় বোঝে।</p>
  </div>

  <!-- উপরের নোটিশ + গাইড প্রশ্ন -->
  <div class="container">
    <div class="voice-top-grid">
      <div class="voice-notice-card">
        <div class="voice-notice-head"><span class="voice-notice-ic"></span> <strong>কীভাবে কাজ করে?</strong></div>
        <ol class="voice-howto">
          <li><strong>প্রশ্ন বাছুন বা সরাসরি বলুন</strong> — নিচের যেকোনো প্রশ্নে ক্লিক করলে সেটি ডেমো-লাইনে বসে যাবে।</li>
          <li><strong>মাইক বাটন চাপুন</strong> — কথা বলা শুরু করুন, যা বলছেন তা-ই টেক্সটে উঠতে থাকবে।</li>
          <li><strong>আবেদন জমা দিন</strong> — টেক্সট ঠিক থাকলে নিচের সবুজ বাটনে ক্লিক করুন — ড্যাশবোর্ডে সেভ হবে।</li>
        </ol>
        <div class="voice-notice-pills">
          <span class="ussd-notice-pill"> ভয়েস সেভ হয় না</span>
          <span class="ussd-notice-pill"> বাংলা সাপোর্টেড</span>
          <span class="ussd-notice-pill"> সম্পূর্ণ ফ্রি</span>
        </div>
      </div>
      <div class="voice-questions-card">
        <div class="voice-questions-head"> সাধারণ প্রশ্ন — যেকোনোটায় ক্লিক করুন</div>
        <div class="voice-q-grid">
          ${sampleQuestions.map((x, i) => `<button type="button" class="voice-q-chip" data-q="${esc(x.q)}"><span>${x.icon}</span> ${esc(x.q)}</button>`).join('')}
        </div>
      </div>
    </div>
  </div>

  <!-- মেইন: ভয়েস ফোন (বাম) + ট্রান্সক্রিপ্ট/আবেদন (ডান) -->
  <div class="container ussd-main-grid voice-main-grid">
    <div class="voice-phone-wrap">
      <div class="vph-phone">
        <div class="vph-topline"></div>
        <div class="vph-statusbar"><span>● ● ●</span><span class="vph-clock" id="vphClock">১০:৩০</span><span> </span></div>
        <div class="vph-appbar"> CoU JusticeLab <small>ভয়েস সহকারী</small></div>
        <div class="vph-wave-stage">
          <div class="vph-orb ${srSupported ? '' : 'vph-orb-demo'}" id="vphOrb">
            <button class="vph-mic" id="vphMicBtn" title="মাইক চাপুন ও বলুন"></button>
          </div>
          <div class="vph-wave" id="vphWave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="vph-status" id="vphStatus">${srSupported ? 'মাইকে ট্যাপ করে বাংলায় বলুন…' : 'ডেমো মোড — নিচের প্রশ্নে ক্লিক করে লাইন ভরুন'}</div>
        </div>
        <div class="vph-continue-btns">
          <button class="vph-btn vph-btn-ghost" id="vphClear"> মুছুন</button>
          <button class="vph-btn vph-btn-primary" id="vphSubmit"> আবেদন জমা দিন</button>
        </div>
        <div class="vph-qrow" id="vphQrow">
          ${sampleQuestions.slice(0, 3).map((x) => `<button type="button" class="vph-qchip" data-q="${esc(x.q)}">${esc(x.q.length > 26 ? x.q.slice(0, 24) + '…' : x.q)}</button>`).join('')}
        </div>
      </div>
      <div class="usd-hint vph-hint"> মাইক ছাড়াও ফোনের ভেতরের প্রশ্ন-চিপ বা ডান পাশের প্রশ্নে ক্লিক করা যায়</div>
    </div>

    <div class="voice-output-panel">
      <div class="voice-output-head">
        <span> আপনার কথা → লেখা (লাইভ)</span>
        <span class="voice-output-badge" id="vphStateBadge">অপেক্ষমাণ</span>
      </div>
      <div class="voice-transcript-box" id="vphTranscriptBox">
        <span class="voice-transcript-empty" id="vphEmpty">এখনো কিছু বলা হয়নি… মাইক চেপে বাংলায় বলুন বা উপরের প্রশ্নে ক্লিক করুন।</span>
        <span id="vphTranscript"></span><span class="voice-caret" id="vphCaret"></span>
      </div>
      <div class="voice-meta-row" id="vphMeta" style="display:none">
        <label class="voice-meta-field"><span>নাম</span><input id="v_name" placeholder="আপনার নাম"></label>
        <label class="voice-meta-field"><span>মোবাইল</span><input id="v_phone" inputmode="numeric" placeholder="01XXXXXXXXX"></label>
        <label class="voice-meta-field"><span>জেলা</span>
          <select id="v_district"><option>ঢাকা</option><option>জয়পুরহাট</option><option>চট্টগ্রাম</option><option>রাজশাহী</option><option>খুলনা</option><option>বরিশাল</option><option>সিলেট</option><option>রংপুর</option><option>ময়মনসিংহ</option></select>
        </label>
      </div>
      <div class="voice-result" id="vphResult"></div>
    </div>
  </div>

  <div class="container">
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:0 0 3rem">
      <a class="btn btn-ghost" href="#/help">← সহায়তা চ্যানেলে ফিরুন</a>
      <a class="btn btn-outline" href="#/ussd"> USSD (*১৬৬৯৯#) সেবা →</a>
    </div>
  </div>`;

  // ---- ঘড়ি ----
  const VOICE_BN = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
  const bnDigitsV = (s) => String(s).replace(/[0-9]/g, (d) => VOICE_BN[d]);
  const vclock = $('#vphClock');
  const vtick = () => { if (vclock) vclock.textContent = bnDigitsV(new Date().toTimeString().slice(0, 5)); };
  vtick();
  const vTimer = setInterval(vtick, 30000);

  const transcriptEl = $('#vphTranscript');
  const emptyEl = $('#vphEmpty');
  const caretEl = $('#vphCaret');
  const statusEl = $('#vphStatus');
  const badgeEl = $('#vphStateBadge');
  const orbEl = $('#vphOrb');
  const waveEl = $('#vphWave');

  const setTranscript = (txt) => {
    V.transcript = txt;
    transcriptEl.textContent = txt;
    emptyEl.style.display = txt ? 'none' : '';
    caretEl.style.display = txt || V.recording ? '' : 'none';
  };

  const setRecording = (on) => {
    V.recording = on;
    orbEl.classList.toggle('vph-orb-live', on);
    waveEl.classList.toggle('vph-wave-live', on);
    badgeEl.textContent = on ? 'শুনছি…' : (V.transcript ? 'টেক্সট প্রস্তুত' : 'অপেক্ষমাণ');
    statusEl.textContent = on ? ' শুনছি — বাংলায় বলুন…' : (srSupported ? 'মাইকে ট্যাপ করে বাংলায় বলুন…' : 'ডেমো মোড — প্রশ্নে ক্লিক করে লাইন ভরুন');
  };

  // ---- Web Speech API ----
  let recog = null;
  if (srSupported) {
    recog = new SR();
    recog.lang = 'bn-BD';
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = (e) => {
      let finalTxt = '', interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTxt += t + ' ';
        else interim += t;
      }
      setTranscript((finalTxt + interim).trim());
      V.answered = true;
    };
    recog.onend = () => { if (V.recording) setRecording(false); };
    recog.onerror = () => { setRecording(false); statusEl.textContent = ' মাইক পাওয়া যায়নি — ডেমো লাইন ব্যবহার করুন'; };
  }

  $('#vphMicBtn').onclick = () => {
    if (!srSupported) {
      // ডেমো ফলব্যাক — স্যাম্পল কথা টেক্সটে ওঠে (ধাপে ধাপে)
      const demo = 'আমার স্বামী দীর্ঘ ছয় মাস যাবৎ ভরণপোষণ দিচ্ছেন না। দুই সন্তান নিয়ে অসহায় আছি। আইনি সহায়তা চাই।';
      setRecording(true);
      let i = 0;
      const tw = setInterval(() => {
        i += 2;
        setTranscript(demo.slice(0, i));
        if (i >= demo.length) { clearInterval(tw); setRecording(false); V.answered = true; }
      }, 45);
      return;
    }
    if (V.recording) { recog.stop(); setRecording(false); return; }
    try { recog.start(); setRecording(true); } catch (e) { setRecording(false); }
  };

  // ---- প্রশ্ন চিপ ----
  const fillFromQ = (q) => {
    setRecording(true);
    let i = 0;
    const tw = setInterval(() => {
      i += 2;
      setTranscript(q.slice(0, i));
      if (i >= q.length) { clearInterval(tw); setRecording(false); V.answered = true; }
    }, 30);
  };
  $$('.voice-q-chip').forEach((b) => { b.onclick = () => fillFromQ(b.dataset.q); });
  $$('.vph-qchip').forEach((b) => { b.onclick = () => fillFromQ(b.dataset.q); });

  $('#vphClear').onclick = () => { setTranscript(''); V.answered = false; badgeEl.textContent = 'অপেক্ষমাণ'; $('#vphResult').innerHTML = ''; $('#vphMeta').style.display = 'none'; };

  // ---- আবেদন জমা (বিদ্যমান applications API) ----
  $('#vphSubmit').onclick = async () => {
    if (!V.transcript.trim()) { toast('আগে কথা বলুন বা প্রশ্নে ক্লিক করুন'); return; }
    const meta = $('#vphMeta');
    // প্রথম চাপে: মেটা ফরম দেখাই, দ্বিতীয় চাপে জমা
    if (meta.style.display === 'none') {
      meta.style.display = 'grid';
      $('#vphResult').innerHTML = '<div class="voice-result-info"> নাম-মোবাইল-জেলা দিন, তারপর আবার <strong>আবেদন জমা দিন</strong> চাপুন।</div>';
      $('#v_name').focus();
      return;
    }
    const name = $('#v_name').value.trim();
    const phone = $('#v_phone').value.trim();
    if (!name) { toast('আপনার নাম লিখুন'); return; }
    if (!/^01\d{9}$/.test(phone)) { toast('সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন'); return; }

    const btn = $('#vphSubmit');
    btn.disabled = true; btn.textContent = ' জমা হচ্ছে…';
    const r = await apiPost('applications', {
      applicantName: name,
      channel: 'VOICE_AI',
      phone,
      district: $('#v_district').value,
      caseType: 'family',
      caseTypeLabel: 'ভয়েস আবেদন',
      problem: '[ভয়েস AI আবেদন] ' + V.transcript.trim(),
      purpose: 'new',
      emergency: false
    });
    btn.disabled = false; btn.textContent = ' আবেদন জমা দিন';
    const appId = (r && (r.appId || r.applicationId)) || ('DLAS-VOICE-2026-' + String(Math.floor(10000 + Math.random() * 90000)));
    try {
      const stored = JSON.parse(localStorage.getItem('dlas_my_apps') || '[]');
      stored.unshift({ appId, caseType: 'ভয়েস আবেদন', district: $('#v_district').value, submittedAt: new Date().toISOString(), stage: 0, last4: phone.slice(-4) });
      localStorage.setItem('dlas_my_apps', JSON.stringify(stored.slice(0, 30)));
    } catch (e) {}
    $('#vphResult').innerHTML = `
      <div class="voice-result-success">
        <h4> আবেদন সফলভাবে জমা হয়েছে!</h4>
        <div class="voice-result-appid">${esc(appId)}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
          <a class="btn btn-primary btn-sm" href="#/dashboard"> ড্যাশবোর্ডে দেখুন</a>
          <a class="btn btn-outline btn-sm" href="#/track?id=${encodeURIComponent(appId)}&last4=${esc(phone.slice(-4))}"> ট্র্যাক করুন</a>
        </div>
      </div>`;
    toast(' ভয়েস আবেদন জমা হয়েছে — ড্যাশবোর্ড দেখুন');
  };
}

// ============================================================================
// USSD সেবা পূর্ণ পেজ (pageUssd) — #/ussd
// উপরে নোটিশ → ইউজার ম্যানুয়াল → বাম দিকে ইন্টারঅ্যাকটিভ বাটন-ফোন (শুধু ক্লিক,
// টাইপিং নেই), ডান দিকে লাইভ আউটপুট। মেনু থেকে আবেদন করা যায়, জমা হলে
// বিদ্যমান /api/applications দিয়ে সেভ হয়ে নাগরিক ড্যাশবোর্ডে চলে আসে।
// ============================================================================
async function pageUssd() {
  // ---- ফোন স্টেট ----
  const USSD = {
    screen: 'idle',        // idle | dialing | lang | menu | apply_name | apply_phone | apply_problem | apply_district | done | track_id | track_result | office_info | calling
    lang: 'bn',
    dialBuffer: '',
    log: [],               // { type: 'sys'|'user'|'net', text }
    draft: { name: '', phone: '', problem: '', district: '' }
  };
  const BN_DIGITS = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
  const bnDigits = (s) => String(s).replace(/[0-9]/g, (d) => BN_DIGITS[d]);

  const SCREENS = {
    idle: { title: 'ডায়ালার', body: '*১৬৬৯৯# ডায়াল করতে নিচের সবুজ কল বাটন চাপুন। কোনো ইন্টারনেট বা স্মার্টফোন লাগবে না — যেকোনো বাটন ফোনেই সেবা।' },
    dialing: { title: 'ডায়াল হচ্ছে…', body: '*১৬৬৯৯# → কল → অপেক্ষা করুন। ২-৩ সেকেন্ডের মধ্যে ফ্রি-তে মেনু ভেসে উঠবে।' },
    lang: { title: '*১৬৬৯৯# — NLASO', body: 'আপনার পছন্দের ভাষা বাছুন:\n১. বাংলা\n২. English\n\nঅথবা সরাসরি ১ / ২ বাটন চাপুন।' },
    menu: { title: 'প্রধান মেনু', body: 'সেবা বেছে নিন:\n১. নতুন আবেদন দাখিল\n২. আবেদনের অবস্থা যাচাই\n৩. জেলা অফিসের তথ্য\n৪. জরুরি হেল্পলাইনে কল\n০. ভাষা পরিবর্তন' },
    apply_name: { title: 'আবেদন — ধাপ ১/৩', body: 'আপনার পুরো নাম লিখে কী-প্যাড থেকে # চাপুন।\n(ডেমোতে # = জমা)' },
    apply_phone: { title: 'আবেদন — ধাপ ২/৩', body: 'যোগাযোগের মোবাইল নম্বর দিন, তারপর # চাপুন।\nযেমন: ০১৭১২৩৪৫৬৭৮' },
    apply_problem: { title: 'আবেদন — ধাপ ৩/৩', body: 'সমস্যার ধরন বাছুন:\n১. পারিবারিক/ভরণপোষণ\n২. জমি ও সম্পত্তি\n৩. চাকরি/মজুরি\n৪. নিরাপত্তা\n৫. অন্যান্য' },
    apply_district: { title: 'জেলা নির্বাচন', body: 'আপনার জেলা বাছুন:\n১. ঢাকা\n২. জয়পুরহাট\n৩. চট্টগ্রাম\n৪. রাজশাহী\n৫. খুলনা\n৬. সিলেট\n৭. রংপুর\n৮. ময়মনসিংহ' },
    done: { title: 'আবেদন গৃহীত ✓', body: 'অভিনন্দন! আপনার আবেদন সফলভাবে জমা হয়েছে।\nআবেদন আইডি নিচের আউটপুট প্যানেলে দেখুন — ড্যাশবোর্ডেও যোগ হয়েছে।' },
    track_id: { title: 'ট্র্যাকিং', body: 'আবেদন আইডির শেষ ৪ ডিজিট লিখে # চাপুন।\nযেমন: ০০০১' },
    track_result: { title: 'ট্র্যাকিং ফলাফল', body: 'স্ট্যাটাস: চলমান (UNDER REVIEW)\nকর্মকর্তা পর্যালোচনা করছেন।\nবিস্তারিত ড্যাশবোর্ড/ট্র্যাক পেজে দেখুন।' },
    office_info: { title: 'জেলা অফিস', body: 'প্রতিটি জেলা জজ আদালত ভবনে জেলা লিগ্যাল এইড অফিস আছে।\nসময়: রবি–বৃহস্পতি, সকাল ৯টা–বিকাল ৫টা।\nঅফিস ডিরেক্টরি পেজে ৬৩টি অফিসের ম্যাপ আছে।' },
    calling: { title: 'কল হচ্ছে…', body: ' টোল-ফ্রি ১৬৬৯৯ নম্বরে সরাসরি কল যাচ্ছে…\n(ডেমো: ফোনে হলে ডায়ালার খুলত)' },
    invalid: { title: 'ভুল ইনপুট', body: 'বোঝা যায়নি। মেনু অনুযায়ী সংখ্যা বাটন চাপুন।' }
  };

  const keys = ['১','২','৩','৪','৫','৬','৭','৮','৯','*','০','#'];

  app.innerHTML = `
  <div class="container page-head">
    <div class="breadcrumb"><a href="#/">হোম</a> / সহায়তা চ্যানেল / USSD সেবা</div>
    <span class="section-tag">ইন্টারনেট ছাড়াই সেবা</span>
    <h1> USSD শর্টকোড সেবা — <span class="ussd-code-chip">*১৬৬৯৯#</span></h1>
    <p>যেকোনো বাটন ফোন থেকে, ইন্টারনেট ছাড়াই টোল-ফ্রিতে আইনি সহায়তার আবেদন করুন — ঠিক সেভাবেই যেভাবে মোবাইলে রিচার্জ করেন।</p>
  </div>

  <!-- নোটিশ ব্যানার -->
  <div class="container">
    <div class="ussd-notice-banner">
      <div class="ussd-notice-icon"></div>
      <div class="ussd-notice-body">
        <strong>নোটিশ:</strong> এটি একটি <strong>লাইভ ইন্টারঅ্যাকটিভ ডেমো</strong> — নিচের ফোনে বাটন ক্লিক করেই আসল USSD সেশনের অভিজ্ঞতা নিন।
        ফোনের কোনো কী-প্যাডে টাইপ করার দরকার নেই; শুধু বাটনে ক্লিক করুন আর ডান পাশে আউটপুট দেখুন।
        <span class="ussd-notice-pill"> সম্পূর্ণ টোল-ফ্রি</span>
        <span class="ussd-notice-pill"> ইন্টারনেট লাগে না</span>
        <span class="ussd-notice-pill"> ২ মিনিটে আবেদন</span>
      </div>
    </div>
  </div>

  <!-- ইউজার ম্যানুয়াল -->
  <div class="container">
    <div class="ussd-manual-card">
      <div class="ussd-manual-head">
        <span class="ussd-manual-badge"> ব্যবহার নির্দেশিকা</span>
        <span class="ussd-manual-sub">৩ ধাপে সেবা নিন — প্রতিটি ধাপের বোতাম নিচের ফোনে ক্লিকযোগ্য</span>
      </div>
      <div class="ussd-manual-steps">
        <div class="ussd-manual-step">
          <span class="ums-num">১</span>
          <div><strong>ডায়াল করুন</strong><p>ফোনের কল-বাটনে ক্লিক করুন — *১৬৬৯৯# ডায়াল হয়ে ভাষা মেনু আসবে।</p></div>
        </div>
        <div class="ussd-manual-step">
          <span class="ums-num">২</span>
          <div><strong>ভাষা ও সেবা বাছুন</strong><p>১/২ চেপে ভাষা, তারপর মেনু থেকে সেবা (আবেদন / ট্র্যাক / অফিস / কল) বাছুন।</p></div>
        </div>
        <div class="ussd-manual-step">
          <span class="ums-num">৩</span>
          <div><strong>তথ্য দিয়ে জমা দিন</strong><p>নাম → ফোন → সমস্যার ধরন → জেলা বাছাই করলেই আবেদন আইডি পাবেন, ড্যাশবোর্ডে সেভ হবে।</p></div>
        </div>
      </div>
    </div>
  </div>

  <!-- মেইন: ফোন (বাম) + আউটপুট (ডান) -->
  <div class="container ussd-main-grid">
    <!-- বাম: ইন্টারঅ্যাকটিভ বাটন-ফোন (নতুন ডিজাইন — সবুজ-সাদা, বাটন-বার) -->
    <div class="ussd-phone-live-wrap">
      <div class="usd-phone">
        <div class="usd-phone-notch"></div>
        <div class="usd-phone-statusbar">
          <span> GP</span>
          <span class="usd-phone-clock" id="usdClock">১০:৩০</span>
          <span> </span>
        </div>
        <div class="usd-phone-brandline">জাতীয় আইনি সহায়তা · বাংলাদেশ</div>
        <div class="usd-screen-green" id="usdScreen">
          <div class="usd-screen-title" id="usdScreenTitle">ডায়ালার</div>
          <div class="usd-screen-body" id="usdScreenBody">*১৬৬৯৯# ডায়াল করতে নিচের সবুজ কল বাটন চাপুন।</div>
        </div>
        <div class="usd-actionbar">
          <button class="usd-softkey usd-softkey-left" id="usdSoftLeft">☰ মেনু</button>
          <button class="usd-callbtn" id="usdCallBtn" title="*১৬৬৯৯# ডায়াল করুন">
            <span class="usd-callbtn-icon"></span>
            <span class="usd-callbtn-label">কল দিন</span>
          </button>
          <button class="usd-softkey usd-softkey-right" id="usdSoftRight"> বাতিল</button>
        </div>
        <div class="usd-keypad">
          ${keys.map(k => `<button class="usd-key-chip ${k === '#' || k === '*' ? 'usd-key-accent' : ''}" data-k="${k}">${k}</button>`).join('')}
        </div>
      </div>
      <div class="usd-hint"> ফোনের বাটনগুলো ক্লিক করলেই সেশন এগোবে — টাইপ করার দরকার নেই</div>
    </div>

    <!-- ডান: লাইভ আউটপুট -->
    <div class="ussd-output-panel">
      <div class="ussd-output-head">
        <span> কলের লাইভ আউটপুট</span>
        <span class="ussd-output-badge" id="usdStateBadge">প্রস্তুত</span>
      </div>
      <div class="ussd-output-log" id="usdLog">
        <div class="ussd-log-sys">সিস্টেম: ডেমো সেশন প্রস্তুত। বাম দিকের ফোনে  <strong>কল দিন</strong> বাটনে ক্লিক করে শুরু করুন।</div>
      </div>
      <div class="ussd-output-actions" id="usdOutActions"></div>
    </div>
  </div>

  <!-- নিচের ব্যাখ্যা কার্ড -->
  <div class="container">
    <div class="ussd-footer-notes">
      <div class="ussd-note-box">
        <h3> আবেদনের পরে কী হবে?</h3>
        <p>জমা হওয়ার সাথে সাথে আবেদন আইডি তৈরি হবে এবং এটি আপনার নাগরিক ড্যাশবোর্ডে চলে যাবে — ট্র্যাক পেজে অগ্রগতিও দেখতে পারবেন।</p>
      </div>
      <div class="ussd-note-box">
        <h3> কোন ফোনে কাজ করে?</h3>
        <p>সিম্পল বাটন (ফিচার) ফোন, স্মার্টফোন — সব অপারেটরে (GP, Robi, Banglalink, Teletalk) USSD কোড সাপোর্টেড।</p>
      </div>
      <div class="ussd-note-box">
        <h3> নিরাপত্তা</h3>
        <p>আপনার তথ্য "ব্যক্তিগত উপাত্ত সুরক্ষা আইন ২০২৬" অনুযায়ী সুরক্ষিত। NLASO কখনো টাকা চায় না — সেবা সম্পূর্ণ বিনামূল্যে।</p>
      </div>
    </div>
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:0 0 3rem">
      <a class="btn btn-ghost" href="#/help">← সহায়তা চ্যানেলে ফিরুন</a>
      <a class="btn btn-outline" href="#/voice"> ভয়েসে আবেদন করুন →</a>
    </div>
  </div>`;

  // ---- ঘড়ি ----
  const clock = $('#usdClock');
  const tick = () => { if (clock) clock.textContent = bnDigits(new Date().toTimeString().slice(0, 5)); };
  tick();
  const clockTimer = setInterval(tick, 30000);

  // ---- লগ ও স্ক্রিন ----
  const logBox = $('#usdLog');
  const addLog = (type, text) => {
    USSD.log.push({ type, text });
    const div = document.createElement('div');
    div.className = 'ussd-log-' + type;
    if (type === 'user') div.textContent = ' ইউজার: ' + text;
    else if (type === 'net') div.textContent = ' USSD রেসপন্স: ' + text;
    else div.textContent = text;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
  };

  const showScreen = (key, extraNote) => {
    const s = SCREENS[key] || SCREENS.invalid;
    $('#usdScreenTitle').textContent = s.title;
    $('#usdScreenBody').textContent = s.body;
    const badges = { idle: 'প্রস্তুত', dialing: 'ডায়াল হচ্ছে…', menu: 'মেনু', done: 'সফল ✓', calling: 'কল হচ্ছে…' };
    $('#usdStateBadge').textContent = badges[key] || 'সেশন চলছে…';
  };

  const renderOutActions = () => {
    const box = $('#usdOutActions');
    if (USSD.screen === 'done') {
      const appId = USSD.lastAppId || 'DLAS-USSD-2026-00000';
      box.innerHTML = `
        <div class="ussd-appid-reveal">
          <small>আপনার আবেদন আইডি</small>
          <strong>${esc(appId)}</strong>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <a class="btn btn-primary btn-sm" href="#/dashboard"> ড্যাশবোর্ডে দেখুন</a>
          <a class="btn btn-outline btn-sm" href="#/track?id=${encodeURIComponent(appId)}&last4=${esc((USSD.draft.phone || '0000').slice(-4))}"> ট্র্যাক করুন</a>
        </div>`;
    } else {
      box.innerHTML = '';
    }
  };

  // ---- আবেদন জমা (বিদ্যমান applications API ব্যবহার করে — ব্যাকএন্ড পরিবর্তন নেই) ----
  const PROBLEM_BN = { '১': 'পারিবারিক', '2': 'পারিবারিক', '২': 'ভূমি ও সম্পত্তি', '৩': 'শ্রম ও মজুরি', '৪': 'নিরাপত্তা', '৫': 'অন্যান্য' };
  const DISTRICT_BN = { '১': 'ঢাকা', '২': 'জয়পুরহাট', '৩': 'চট্টগ্রাম', '৪': 'রাজশাহী', '৫': 'খুলনা', '৬': 'সিলেট', '৭': 'রংপুর', '৮': 'ময়মনসিংহ' };

  const submitUssdApplication = async () => {
    addLog('sys', ' আবেদন সার্ভারে জমা হচ্ছে…');
    const d = USSD.draft;
    const payload = {
      applicantName: d.name || 'USSD আবেদনকারী',
      channel: 'USSD',
      phone: d.phone || '01700000000',
      district: d.district || 'ঢাকা',
      caseType: 'family',
      caseTypeLabel: d.problem || 'পারিবারিক',
      problem: '[USSD *16699# আবেদন] ' + (d.problem || 'পারিবারিক') + ' বিষয়ে সহায়তা প্রয়োজন — বিস্তারিত কর্মকর্তা ফোনকলে জানাবেন।',
      purpose: 'new',
      emergency: false
    };
    const r = await apiPost('applications', payload);
    const appId = (r && (r.appId || r.applicationId)) || ('DLAS-USSD-2026-' + String(Math.floor(10000 + Math.random() * 90000)));
    USSD.lastAppId = appId;
    try {
      const stored = JSON.parse(localStorage.getItem('dlas_my_apps') || '[]');
      stored.unshift({
        appId,
        caseType: d.problem || 'পারিবারিক',
        district: d.district || 'ঢাকা',
        submittedAt: new Date().toISOString(),
        stage: 0,
        last4: (d.phone || '01700000000').slice(-4)
      });
      localStorage.setItem('dlas_my_apps', JSON.stringify(stored.slice(0, 30)));
    } catch (e) {}
    addLog('net', ' আবেদন গৃহীত — আইডি: ' + appId + ' (ড্যাশবোর্ডে সেভ হয়েছে)');
    USSD.screen = 'done';
    showScreen('done');
    renderOutActions();
    toast(' USSD আবেদন জমা হয়েছে — ড্যাশবোর্ড দেখুন');
  };

  // ---- কী-হ্যান্ডলার ----
  const pressKey = (k) => {
    addLog('user', 'কী চাপা হলো: ' + k);
    switch (USSD.screen) {
      case 'idle':
        USSD.screen = 'dialing'; showScreen('dialing'); addLog('net', SCREENS.lang.body.replace(/\n/g, ' | '));
        setTimeout(() => { USSD.screen = 'lang'; showScreen('lang'); }, 700);
        break;
      case 'lang':
        if (k === '১' || k === '1') { USSD.lang = 'bn'; USSD.screen = 'menu'; showScreen('menu'); addLog('net', 'ভাষা: বাংলা ✓ — ' + SCREENS.menu.body.replace(/\n/g, ' | ')); }
        else if (k === '২' || k === '2') { USSD.lang = 'en'; USSD.screen = 'menu'; showScreen('menu'); addLog('net', 'Language: English ✓ — ' + SCREENS.menu.body.replace(/\n/g, ' | ')); }
        else { showScreen('invalid'); addLog('net', 'ভুল ইনপুট — ১ বা ২ চাপুন।'); }
        break;
      case 'menu':
        if (k === '১' || k === '1') { USSD.screen = 'apply_name'; USSD.draft = { name: '', phone: '', problem: '', district: '' }; showScreen('apply_name'); addLog('net', 'আবেদন ফরম শুরু — নামের জন্য অক্ষর-কী তারপর # চাপুন (ডেমোতে সরাসরি # চাপলে স্যাম্পল নাম নেবে)।'); }
        else if (k === '২' || k === '2') { USSD.screen = 'track_id'; showScreen('track_id'); addLog('net', 'ট্র্যাকিং — আইডির শেষ ৪ ডিজিট দিয়ে # চাপুন।'); }
        else if (k === '৩' || k === '3') { USSD.screen = 'office_info'; showScreen('office_info'); addLog('net', SCREENS.office_info.body.replace(/\n/g, ' | ')); }
        else if (k === '৪' || k === '4') { USSD.screen = 'calling'; showScreen('calling'); addLog('net', ' ১৬৬৯৯-এ কল স্থাপন হচ্ছে… (টোল-ফ্রি)'); renderOutActions(); }
        else if (k === '০' || k === '0') { USSD.screen = 'lang'; showScreen('lang'); addLog('net', 'ভাষা মেনুতে ফেরত।'); }
        else { showScreen('invalid'); addLog('net', 'মেনু অনুযায়ী ১–৪ অথবা ০ চাপুন।'); }
        break;
      case 'apply_name':
        if (k === '#') { USSD.draft.name = 'USSD আবেদনকারী'; addLog('net', 'নাম গৃহীত ✓ — এবার মোবাইল নম্বর ধাপ।'); USSD.screen = 'apply_phone'; showScreen('apply_phone'); }
        else if (k !== '*') { addLog('net', 'ডেমোতে নাম অটো-সেট হবে — সরাসরি # চাপুন।'); }
        break;
      case 'apply_phone':
        if (k === '#') { USSD.draft.phone = '017' + String(Math.floor(10000000 + Math.random() * 89999999)); addLog('net', 'নম্বর গৃহীত ✓ — সমস্যার ধরন বাছুন।'); USSD.screen = 'apply_problem'; showScreen('apply_problem'); }
        else if (/^[0-9০-৯]$/.test(k)) { addLog('net', 'ডিজিট: ' + k); }
        break;
      case 'apply_problem':
        if (PROBLEM_BN[k]) { USSD.draft.problem = PROBLEM_BN[k]; addLog('net', 'সমস্যার ধরন: ' + PROBLEM_BN[k] + ' ✓ — এবার জেলা বাছুন।'); USSD.screen = 'apply_district'; showScreen('apply_district'); }
        else { addLog('net', '১–৫ এর মধ্যে বাছুন।'); }
        break;
      case 'apply_district':
        if (DISTRICT_BN[k]) {
          USSD.draft.district = DISTRICT_BN[k];
          addLog('net', 'জেলা: ' + DISTRICT_BN[k] + ' ✓ — তথ্য সম্পূর্ণ, জমা হচ্ছে…');
          submitUssdApplication();
        } else { addLog('net', '১–৮ এর মধ্যে জেলা বাছুন।'); }
        break;
      case 'track_id':
        if (k === '#') { USSD.screen = 'track_result'; showScreen('track_result'); addLog('net', SCREENS.track_result.body.replace(/\n/g, ' | ')); }
        break;
      case 'office_info':
      case 'track_result':
      case 'invalid':
      case 'done':
        if (k === '০' || k === '0' || k === '#') { USSD.screen = 'menu'; showScreen('menu'); addLog('net', 'প্রধান মেনুতে ফেরত।'); renderOutActions(); }
        break;
      case 'calling':
        addLog('net', 'কল সংযোগ ডেমো-মোডে শেষ। মেনুতে ফিরতে ০ চাপুন।');
        break;
    }
  };

  // ---- বাটন বাইন্ডিং ----
  $$('.usd-key-chip').forEach((b) => { b.onclick = () => pressKey(b.dataset.k); });
  $('#usdCallBtn').onclick = () => {
    const cbtn = $('#usdCallBtn');
    cbtn.classList.add('usd-callbtn-ring');
    setTimeout(() => cbtn.classList.remove('usd-callbtn-ring'), 900);
    if (USSD.screen === 'idle') {
      cbtn.querySelector('.usd-callbtn-label').textContent = 'ডায়াল…';
      setTimeout(() => { cbtn.querySelector('.usd-callbtn-label').textContent = 'কল দিন'; }, 1400);
      pressKey('');
    } else { addLog('user', ' কল/OK বাটন'); pressKey('#'); }
  };
  $('#usdSoftRight').onclick = () => {
    addLog('user', ' বাতিল/ব্যাক');
    USSD.screen = 'idle'; USSD.draft = { name: '', phone: '', problem: '', district: '' };
    showScreen('idle');
    $('#usdStateBadge').textContent = 'প্রস্তুত';
    renderOutActions();
    addLog('sys', 'সেশন রিসেট হয়েছে — আবার  কল দিন।');
  };
  $('#usdSoftLeft').onclick = () => {
    addLog('user', '☰ মেনু বাটন');
    if (USSD.screen === 'idle' || USSD.screen === 'dialing') { addLog('sys', 'আগে  কল দিন — তারপর মেনু আসবে।'); }
    else { USSD.screen = 'menu'; showScreen('menu'); addLog('net', 'প্রধান মেনু।'); renderOutActions(); }
  };
}

// ---------- SPA Router ----------
const routes = [
  { re: /^#?\/?$/, fn: pageHome },
  { re: /^#\/services$/, fn: pageServices },
  { re: /^#\/eligibility$/, fn: pageEligibility },
  { re: /^#\/topics$/, fn: pageTopics },
  { re: /^#\/topic\/([\w-]+)$/, fn: pageTopic },
  { re: /^#\/section\/([\w-]+)$/, fn: pageSection },
  { re: /^#\/form\/([\w-]+)$/, fn: pageForm },
  { re: /^#\/article\/([\w-]+)$/, fn: pageArticle },
  { re: /^#\/guide$/, fn: pageGuide },
  { re: /^#\/search$/, fn: pageSearch },
  { re: /^#\/apply(\?.*)?$/, fn: pageApply },
  { re: /^#\/track(\?.*)?$/, fn: pageTrack },
  { re: /^#\/offices$/, fn: pageOffices },
  { re: /^#\/news$/, fn: pageNews },
  { re: /^#\/news\/([\w-]+)$/, fn: pageNewsDetail },
  { re: /^#\/call$/, fn: pageCall },
  { re: /^#\/help$/, fn: pageHelp },
  { re: /^#\/help\/([\w-]+)$/, fn: pageHelpChannel },
  { re: /^#\/ussd(\?.*)?$/, fn: pageUssd },
  { re: /^#\/voice(\?.*)?$/, fn: pageVoice },
  { re: /^#\/login(\?.*)?$/, fn: pageLogin },
  { re: /^#\/(register|signup)(\?.*)?$/, fn: pageRegister },
  { re: /^#\/dashboard$/, fn: pageDashboard },
  { re: /^#\/console(\?.*)?$/, fn: pageConsole },
  { re: /^#\/complaint$/, fn: pageComplaint }
];

async function route() {
  const hash = location.hash || '#/';
  if (typeof applyI18n === 'function') applyI18n();
  $$('#mainNav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === hash.split('?')[0]));

  for (const r of routes) {
    const m = hash.match(r.re);
    if (m) {
      try {
        await r.fn(...m.slice(1));
      } catch (e) {
        console.error('Route error:', e);
        app.innerHTML = '<div class="empty-state">' + (window.t ? window.t('errGeneric') : 'সমস্যা হয়েছে — আবার চেষ্টা করুন।') + '</div>';
      }
      window.scrollTo(0, 0);
      return;
    }
  }

  // 404 fallback -> redirect to Home
  pageHome();
}

window.addEventListener('hashchange', route);

// ---------- ১. হোম পেজ ----------
async function pageHome() {
  const isEn = document.documentElement.lang === 'en';

  // Real News & Events items
  const newsItems = (BOOT && BOOT.news && BOOT.news.length) ? BOOT.news.slice(0, 4) : [
    {
      id: 'nw1',
      title: isEn ? 'Pre-case Mandatory Mediation Pilot Successful in Netrokona — Expanding to 8 Districts' : 'নেত্রকোনায় মামলা-পূর্ব বাধ্যতামূলক মধ্যস্থতা পাইলট সফল — ৮ জেলায় সম্প্রসারণ',
      date: isEn ? '15 September 2026' : '১৫ সেপ্টেম্বর ২০২৬',
      tag: isEn ? 'News' : 'নিউজ',
      img: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&q=70',
      desc: isEn ? '72% family and land disputes settled out of court in an 18-month pilot.' : 'নেত্রকোনায় ১৮ মাসের পাইলটে ৭২% পারিবারিক ও ভূমি বিরোধ আদালত ছাড়াই নিষ্পত্তি।'
    },
    {
      id: 'nw2',
      title: isEn ? '16699 Toll-free Helpline Now Serving in Chattogram Dialect' : '১৬৬৯৯ কল সেন্টারে এখন চট্টগ্রামের আঞ্চলিক ভাষাতেও সেবা',
      date: isEn ? '10 September 2026' : '১০ সেপ্টেম্বর ২০২৬',
      tag: isEn ? 'Service' : 'সেবা',
      img: 'https://images.unsplash.com/photo-1516387938699-a93567ec168e?w=800&q=70',
      desc: isEn ? 'Citizens from Mirsarai, Satkania, and surrounding areas can get legal advice in their regional dialect.' : 'মিরসরাই ও সাতকানিয়ার বাসিন্দারা নিজস্ব আঞ্চলিক ভাষায় তাৎক্ষণিক আইনি পরামর্শ পাবেন।'
    },
    {
      id: 'nw3',
      title: isEn ? 'National Legal Aid Day 2026 — Nationwide Free Legal Camps' : 'জাতীয় লিগ্যাল এইড দিবস ২০২৬ — সারাদেশে বিনামূল্যে আইনি ক্যাম্প',
      date: isEn ? '28 September 2026' : '২৮ সেপ্টেম্বর ২০২৬',
      tag: isEn ? 'Event' : 'ইভেন্ট',
      img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=70',
      desc: isEn ? 'Free advice and panel lawyer assignment camps at all 64 District Legal Aid Offices.' : 'প্রতিটি জেলা অফিসে সকাল ৯টা থেকে বিকাল ৫টা পর্যন্ত বিনামূল্যে পরামর্শ ও আইনজীবী নিয়োগ ক্যাম্প।'
    },
    {
      id: 'nw4',
      title: isEn ? 'Over 500,000 Legal Applications Filed via Union Digital Centres' : 'ইউনিয়ন ডিজিটাল সেন্টারের মাধ্যমে আবেদন ৫ লক্ষ ছাড়াল',
      date: isEn ? '05 September 2026' : '৫ সেপ্টেম্বর ২০২৬',
      tag: isEn ? 'Milestone' : 'অর্জন',
      img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=70',
      desc: isEn ? 'Rural citizens applying effortlessly through local UDC entrepreneurs without owning a smartphone.' : '৩০০ ইউনিয়নে ইউডিসি উদ্যোক্তারা সাধারণ নাগরিকদের হয়ে আবেদন দাখিল করে দিচ্ছেন।'
    }
  ];

  app.innerHTML = `
  <!-- হিরো সেকশন -->
  <section class="ref-hero">
    <div class="container ref-hero-inner">
      <h1 class="ref-hero-title">
        ${t('refHeroTitle')}
      </h1>
      <p class="ref-hero-subtitle">
        ${t('refHeroSubtitle')}
      </p>
      <div class="ref-hero-actions">
        <a class="btn-ref-hero-primary" href="#/apply">
          <span>${t('btnNewApp')}</span> <span>→</span>
        </a>
        <a class="btn-ref-hero-outline" href="#/track">
          <span></span> <span>${t('btnTrackApp')}</span>
        </a>
      </div>
      <div class="hero-demo-chips">
        <span>${t('demoTrackTest')}</span>
        <button type="button" class="chip-ref-demo" id="hDemo1">DLAS-NET-2026-04420 (ময়ূরী / ০০০১)</button>
        <button type="button" class="chip-ref-demo" id="hDemo2">APP-2026-0001 (ময়ূরী / ৩৩৪৪)</button>
      </div>
    </div>
  </section>

  <!-- সেবাসমূহ সেকশন -->
  <section class="ref-section">
    <div class="container">
      <div class="sec-header-split">
        <div>
          <h2 class="sec-heading-serif">${t('servicesHead')}</h2>
        </div>
        <div>
          <p class="sec-heading-desc">
            ${t('servicesDesc')}
          </p>
        </div>
      </div>

      <div class="ref-services-grid">
        <div class="ref-svc-card">
          <div class="ref-svc-icon-box"></div>
          <h3>${t('freeConsultTitle')}</h3>
          <p>${t('freeConsultDesc')}</p>
          <a class="btn svc-cta-btn btn-outline" href="#/guide">${t('freeConsultBtn')}</a>
        </div>

        <div class="ref-svc-card">
          <div class="ref-svc-icon-box"></div>
          <h3>${t('lawyerAppTitle')}</h3>
          <p>${t('lawyerAppDesc')}</p>
          <a class="btn svc-cta-btn btn-primary" href="#/apply">${t('lawyerAppBtn')}</a>
        </div>

        <div class="ref-svc-card">
          <div class="ref-svc-icon-box"></div>
          <h3>${t('adrServiceTitle')}</h3>
          <p>${t('adrServiceDesc')}</p>
          <a class="btn svc-cta-btn btn-outline" href="#/apply?purpose=mediation">${t('adrServiceBtn')}</a>
        </div>
      </div>
    </div>
  </section>

  <!-- আরও সাহায্য বা আইনজীবীর প্রয়োজন? (Old Web Reference Inspired CTA) -->
  <section class="container">
    <div class="consult-banner">
      <h2>${t('needMoreHelpTitle')}</h2>
      <p>${t('needMoreHelpDesc')}</p>
      <a class="btn-consult" href="#/guide">
        <span>${t('startNow')}</span>
      </a>
    </div>
  </section>

  <!-- নিউজ ও ইভেন্ট সেকশন -->
  <section class="ref-section" style="background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
    <div class="container">
      <div class="sec-header-split">
        <div>
          <span class="section-tag">NLASO আপডেট</span>
          <h2 class="sec-heading-serif">${t('newsEvents')}</h2>
        </div>
        <div>
          <a class="btn btn-outline btn-sm" href="#/news">${t('seeAllNews')}</a>
        </div>
      </div>

      <div class="news-grid">
        ${newsItems.map(item => `
          <a class="news-card" href="#/news/${item.id}">
            <div class="news-card-img-wrap">
              <img class="news-card-img" src="${item.img}" alt="${esc(item.title)}" loading="lazy">
              <span class="news-card-tag">${esc(item.tag || 'নিউজ')}</span>
            </div>
            <div class="news-card-body">
              <div class="news-card-date">
                <span></span> <span>${esc(item.date)}</span>
              </div>
              <h3 class="news-card-title">${esc(item.title)}</h3>
              <p class="news-card-desc">${esc(item.desc || '')}</p>
              <span class="news-card-link">বিস্তারিত পড়ুন →</span>
            </div>
          </a>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- সহায়তা চ্যানেল সেকশন (Structured Cards & Buttons) -->
  <section class="ref-section">
    <div class="container">
      <div class="sec-header-split">
        <div>
          <span class="section-tag">প্রবেশগম্যতা</span>
          <h2 class="sec-heading-serif">${t('helpTitle')}</h2>
        </div>
        <div>
          <p class="sec-heading-desc">${t('helpLead')}</p>
        </div>
      </div>

      <div class="channel-grid">
        <!-- কার্ড ১: সরাসরি ইমার্জেন্সি কল -->
        <div class="channel-card channel-card-cta">
          <div class="channel-card-head">
            <div class="channel-icon channel-icon-red"></div>
            <div>
              <div class="channel-title">${t('hCallT')}</div>
              <small style="color:var(--gov-green);font-weight:700">টোল-ফ্রি ২৪/৭ হেল্পলাইন</small>
            </div>
          </div>
          <p class="channel-desc">${t('hCallB')}</p>
          <button type="button" class="channel-btn channel-btn-primary" id="homeEmergencyCall"> এখনই কল করুন (১৬৬৯৯)</button>
        </div>

        <!-- কার্ড ২: USSD (*১৬৬৯৯#) — বাটন-ক্লিকে আবেদন -->
        <div class="channel-card channel-card-highlight">
          <div class="channel-card-head">
            <div class="channel-icon"></div>
            <div>
              <div class="channel-title">USSD আবেদন (*১৬৬৯৯#)</div>
              <small style="color:var(--text-muted)">বাটন ফোনে, ইন্টারনেট ছাড়া</small>
            </div>
          </div>
          <p class="channel-desc">ইন্টারনেট ছাড়াই যেকোনো বাটন ফোন থেকে ক্লিক করে ক্লিক করে আবেদন দাখিল করুন — সম্পূর্ণ টোল-ফ্রি।</p>
          <button type="button" class="channel-btn channel-btn-outline" id="homeUssdApply"> USSD-তে আবেদন করুন →</button>
        </div>

        <!-- কার্ড ৩: ভয়েস আবেদন — বলে আবেদন -->
        <div class="channel-card channel-card-highlight">
          <div class="channel-card-head">
            <div class="channel-icon"></div>
            <div>
              <div class="channel-title">ভয়েসে আবেদন</div>
              <small style="color:var(--text-muted)">বলুন — লেখা হয়ে যাবে</small>
            </div>
          </div>
          <p class="channel-desc">লিখতে না পারলেও সমস্যা নেই — বাংলায় কথা বলুন, AI শুনে লেখা হয়ে যাবে এবং সেটিই আবেদন হয়ে যাবে।</p>
          <button type="button" class="channel-btn channel-btn-outline" id="homeVoiceApply"> ভয়েসে আবেদন করুন →</button>
        </div>

        <!-- কার্ড ৪: UDC অফিস ডিরেক্টরি -->
        <div class="channel-card">
          <div class="channel-card-head">
            <div class="channel-icon"></div>
            <div>
              <div class="channel-title">${t('hUdcT')}</div>
              <small style="color:var(--text-muted)">নিকটস্থ ইউনিয়ন পরিষদ</small>
            </div>
          </div>
          <p class="channel-desc">${t('hUdcB')}</p>
          <a class="channel-btn channel-btn-outline" href="#/offices"> উদ্যোক্তা ও অফিস ডিরেক্টরি</a>
        </div>

        <!-- কার্ড ৫: AI চ্যাট সহকারী -->
        <div class="channel-card">
          <div class="channel-card-head">
            <div class="channel-icon"></div>
            <div>
              <div class="channel-title">${t('hAiT')}</div>
              <small style="color:var(--text-muted)">স্মার্ট আইনি দিকনির্দেশনা</small>
            </div>
          </div>
          <p class="channel-desc">${t('hAiB')}</p>
          <button type="button" class="channel-btn channel-btn-primary" id="btnOpenAiChat"> AI সহকারীর সাথে কথা বলুন</button>
        </div>
      </div>
    </div>
  </section>
  `;

  // Attach event listeners
  const hDemo1 = $('#hDemo1');
  if (hDemo1) {
    hDemo1.onclick = () => {
      location.hash = '#/track?id=DLAS-NET-2026-04420&last4=0001';
    };
  }
  const hDemo2 = $('#hDemo2');
  if (hDemo2) {
    hDemo2.onclick = () => {
      location.hash = '#/track?id=APP-2026-0001&last4=3344';
    };
  }
  const btnOpenUssd = $('#btnOpenUssd');
  if (btnOpenUssd) {
    btnOpenUssd.onclick = () => { location.hash = '#/ussd'; };
  }
  const btnOpenAiChat = $('#btnOpenAiChat');
  if (btnOpenAiChat) {
    btnOpenAiChat.onclick = () => {
      if (typeof window.__chatOpen === 'function') window.__chatOpen();
    };
  }

  // তিনটি নতুন প্রবেশগম্যতা অ্যাকশন (ইমার্জেন্সি কল / USSD আবেদন / ভয়েস আবেদন)
  const homeCall = $('#homeEmergencyCall');
  if (homeCall) homeCall.onclick = () => { location.href = 'tel:16699'; };
  const homeUssd = $('#homeUssdApply');
  if (homeUssd) homeUssd.onclick = () => { location.hash = '#/ussd'; };
  const homeVoice = $('#homeVoiceApply');
  if (homeVoice) homeVoice.onclick = () => { location.hash = '#/voice'; };
}

// ---------- ২. সেবাসমূহ পেজ ----------
async function pageServices() {
  app.innerHTML = `
  <div class="container page-head">
    <span class="section-tag">সরকারি আইনি সেবা</span>
    <h1> ${t('servicesTitle')}</h1>
    <p>${t('servicesSubtitle')}</p>
  </div>
  <div class="container">
    <div class="services-grid" style="margin-bottom:2.5rem">
      <!-- ১. বিনামূল্যে আইনি পরামর্শ (working button -> #/guide) -->
      <div class="service-card">
        <div class="service-head">
          <div class="service-icon-box"></div>
          <div>
            <span class="service-tag-badge">পরামর্শ</span>
            <h3>${t('freeConsultTitle')}</h3>
          </div>
        </div>
        <p>${t('freeConsultDesc')}</p>
        <a class="btn btn-outline btn-block" href="#/guide">${t('freeConsultBtn')}</a>
      </div>

      <!-- ২. সরকারি খরচে আইনজীবী নিয়োগ -->
      <div class="service-card">
        <div class="service-head">
          <div class="service-icon-box"></div>
          <div>
            <span class="service-tag-badge">আইনজীবী নিয়োগ</span>
            <h3>${t('lawyerAppTitle')}</h3>
          </div>
        </div>
        <p>${t('lawyerAppDesc')}</p>
        <a class="btn btn-primary btn-block" href="#/apply">${t('lawyerAppBtn')}</a>
      </div>

      <!-- ৩. বিকল্প বিরোধ নিষ্পত্তি (ADR) (working -> #/apply?purpose=mediation) -->
      <div class="service-card">
        <div class="service-head">
          <div class="service-icon-box"></div>
          <div>
            <span class="service-tag-badge">ADR</span>
            <h3>${t('adrServiceTitle')}</h3>
          </div>
        </div>
        <p>${t('adrServiceDesc')}</p>
        <a class="btn btn-outline btn-block" href="#/apply?purpose=mediation">${t('adrServiceBtn')}</a>
      </div>
    </div>
  </div>`;
}

// ---------- ৩. বিনামূল্যে আইনি পরামর্শ ও গাইড (pageGuide) ----------
async function pageGuide() {
  const categories = (BOOT && BOOT.categories) || [
    { id: 'family', title: 'পারিবারিক ও দাম্পত্য' },
    { id: 'land', title: 'জমি-জমা ও সম্পত্তি' },
    { id: 'safety', title: 'নিরাপত্তা ও সহিংসতা' },
    { id: 'money', title: 'অর্থ ও চেক সংক্রান্ত' },
    { id: 'labour', title: 'শ্রমিক ও মজুরি অধিকার' },
    { id: 'crime', title: 'ফৌজদারি ও জামিন' }
  ];

  let step = 1;
  let selectedCategory = 'family';
  let selectedNeed = 'advice';

  function render() {
    app.innerHTML = `
    <div class="container page-head">
      <span class="section-tag">বিনামূল্যে আইনি পরামর্শ</span>
      <h1> ${t('guideTitle')}</h1>
      <p>${t('guideLead')}</p>
    </div>
    <div class="container">
      <div class="form-card" style="max-width:740px">
        ${step === 1 ? `
          <h3>১. আপনার সমস্যার ক্ষেত্রটি বেছে নিন:</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;margin:1.2rem 0">
            ${categories.map(c => `
              <button type="button" class="btn btn-outline guide-cat-btn ${selectedCategory === c.id ? 'active' : ''}" data-cat="${c.id}" style="${selectedCategory === c.id ? 'background:var(--gov-green-surface);border-color:var(--gov-green);font-weight:700' : ''}">
                ${esc(c.title)}
              </button>
            `).join('')}
          </div>
          <div class="wizard-actions">
            <button class="btn btn-primary" id="gNext1">${t('guideNext')} →</button>
          </div>
        ` : step === 2 ? `
          <h3>২. আপনার প্রধান উদ্দেশ্য কী?</h3>
          <div style="display:flex;flex-direction:column;gap:10px;margin:1.2rem 0">
            <label class="check-line" style="background:var(--surface-2);padding:10px;border-radius:8px">
              <input type="radio" name="gNeed" value="advice" ${selectedNeed === 'advice' ? 'checked' : ''}>
              <span><strong>শুধু বিনামূল্যে আইনি পরামর্শ ও দিকনির্দেশনা চাই</strong> (মামলা করার আগে করণীয় জানুন)</span>
            </label>
            <label class="check-line" style="background:var(--surface-2);padding:10px;border-radius:8px">
              <input type="radio" name="gNeed" value="mediation" ${selectedNeed === 'mediation' ? 'checked' : ''}>
              <span><strong>আদালতের বাইরে আপস-মীমাংসা (ADR / মধ্যস্থতা) চাই</strong> (বিনা খরচে দ্রুত সমাধান)</span>
            </label>
            <label class="check-line" style="background:var(--surface-2);padding:10px;border-radius:8px">
              <input type="radio" name="gNeed" value="lawyer" ${selectedNeed === 'lawyer' ? 'checked' : ''}>
              <span><strong>সরকারি খরচে প্যানেল আইনজীবী নিয়োগ চাই</strong> (আদালতে মোকদ্দমা পরিচালনার জন্য)</span>
            </label>
          </div>
          <div class="wizard-actions">
            <button class="btn btn-ghost" id="gBack2">← ${t('guideBack')}</button>
            <button class="btn btn-primary" id="gNext2">${t('guideNext')} →</button>
          </div>
        ` : `
          <div style="background:var(--gov-green-surface);border:1.5px solid #A7F3D0;border-radius:var(--radius);padding:1.4rem;margin-bottom:1.5rem">
            <h3 style="color:var(--gov-green-dark);margin-bottom:.6rem"> ${t('guideResult')}</h3>
            <p style="font-size:0.95rem;line-height:1.6">
              আপনার নির্বাচিত বিষয়ের ক্ষেত্রে <strong>আইনগত সহায়তা প্রদান আইন ২০০০</strong>-এর অধীনে সম্পূর্ণ সরকারি খরচে আপনি আইনি প্রতিকার পাওয়ার অধিকারী।
            </p>
            <div style="margin-top:12px;padding:10px;background:#FFF;border-radius:8px;font-size:0.88rem">
               <strong>আইনি নিশ্চয়তা:</strong> আপনার ব্যক্তিগত তথ্য "ব্যক্তিগত উপাত্ত সুরক্ষা আইন, ২০২৬ (২০২৬ সনের ৬৩ নং আইন)" অনুযায়ী সংরক্ষিত থাকে। কোনো ফি দিতে হয় না।
            </div>
          </div>
          <div class="wizard-actions" style="flex-wrap:wrap">
            <a class="btn btn-primary" href="#/apply?category=${selectedCategory}&purpose=${selectedNeed}"> এখনই আবেদন দাখিল করুন</a>
            <a class="btn btn-outline" href="tel:16699"> কল করুন ১৬৬৯৯ (টোল-ফ্রি)</a>
            <button class="btn btn-ghost" id="gRestart"> আবার শুরু করুন</button>
          </div>
        `}
      </div>
    </div>`;

    if (step === 1) {
      $$('.guide-cat-btn').forEach(btn => {
        btn.onclick = () => {
          selectedCategory = btn.dataset.cat;
          render();
        };
      });
      $('#gNext1').onclick = () => { step = 2; render(); };
    } else if (step === 2) {
      $$('input[name="gNeed"]').forEach(r => {
        r.onchange = () => { selectedNeed = r.value; };
      });
      $('#gBack2').onclick = () => { step = 1; render(); };
      $('#gNext2').onclick = () => { step = 3; render(); };
    } else if (step === 3) {
      $('#gRestart').onclick = () => { step = 1; render(); };
    }
  }

  render();
}

// ---------- ৪. সেলফ-হেল্প রিসোর্স লাইব্রেরি (pageTopics & pageTopic & pageSection) ----------
async function pageTopics() {
  app.innerHTML = `
  <div class="container page-head">
    <h1> ${t('libraryTitle')}</h1>
    <p>${t('libraryBody')}</p>
    <div class="search-bar" style="margin-top:1rem;max-width:100%">
      <input id="topicQ" placeholder="আইনি বিষয় বা কিওয়ার্ড লিখুন...">
    </div>
  </div>
  <div class="container">
    <div class="topic-grid" id="topicGrid"></div>
  </div>`;

  const render = (q = '') => {
    const cats = (BOOT.categories || []).filter((c) => !q || (c.title + ' ' + (c.desc || '')).toLowerCase().includes(q.toLowerCase()));
    $('#topicGrid').innerHTML = cats.map((c) => {
      const count = (BOOT.articles || []).filter((a) => a.topic === c.id).length;
      return `
        <a class="topic-card" href="#/topic/${c.id}">
          <span class="topic-icon">${c.icon || ''}</span>
          <span>
            <h3>${esc(c.title)}</h3>
            <p>${esc(c.desc || '')}</p>
            <small style="color:var(--brand);font-weight:600">${bnNum(count || 6)}টি আর্টিকেল ও ফরম</small>
          </span>
        </a>
      `;
    }).join('') || '<div class="empty-state">কোনো আইনি তথ্য পাওয়া যায়নি।</div>';
  };

  render();
  $('#topicQ').oninput = (e) => render(e.target.value);
}

async function pageTopic(id) {
  const cat = (BOOT.categories || []).find((c) => c.id === id);
  if (!cat) return pageTopics();
  const sections = (BOOT.sections && BOOT.sections[id]) || [];

  app.innerHTML = `
  <div class="container page-head">
    <div class="breadcrumb"><a href="#/topics">${t('navLibrary')}</a> / ${esc(cat.title)}</div>
    <h1><span class="topic-icon" style="display:inline-flex;vertical-align:middle;margin-right:.5rem">${cat.icon || ''}</span>${esc(cat.title)}</h1>
    <p>${esc(cat.desc || '')}</p>
  </div>
  <div class="container">
    <div class="subtopic-grid">
      ${sections.map((s) => `
        <a class="subtopic-card" href="${s.kind === 'form' ? '#/form/' + s.formId : '#/section/' + s.id}">
          <span class="subtopic-card-icon">${s.icon || (s.kind === 'form' ? '' : '')}</span>
          <h3 class="subtopic-card-title">${esc(s.title)}</h3>
          ${s.desc ? `<p class="subtopic-card-desc">${esc(s.desc)}</p>` : ''}
          <div class="subtopic-card-footer">
            <span>${s.kind === 'form' ? 'ফরম পূরণ' : 'উপ-বিষয় ও গাইড'}</span>
            <span>বিস্তারিত দেখুন →</span>
          </div>
        </a>
      `).join('')}
    </div>
  </div>`;
}

// Subtopic / Last Tree Grid (Issue 8: Rounded Box Cards)
async function pageSection(id) {
  let section = null, parentCat = null;
  for (const [catId, secs] of Object.entries(BOOT.sections || {})) {
    const hit = secs.find((s) => s.id === id);
    if (hit) {
      section = hit;
      parentCat = (BOOT.categories || []).find((c) => c.id === catId);
      break;
    }
  }
  if (!section) return pageTopics();

  app.innerHTML = `
  <div class="container page-head">
    <div class="breadcrumb">
      <a href="#/topics">${t('navLibrary')}</a> /
      ${parentCat ? `<a href="#/topic/${parentCat.id}">${esc(parentCat.title)}</a> /` : ''}
      ${esc(section.title)}
    </div>
    <h1>${section.icon || ''} ${esc(section.title)}</h1>
    <p>${esc(section.desc || 'বিষয়ভিত্তিক নির্দেশিকা ও ফরমসমূহ:')}</p>
  </div>
  <div class="container">
    <div class="subtopic-grid">
      ${(section.children || []).map((ch) => {
        if (ch.kind === 'form') {
          return `
            <a class="subtopic-card" href="#/form/${ch.formId}">
              <span class="subtopic-card-icon"></span>
              <h3 class="subtopic-card-title">${esc(ch.title)}</h3>
              <p class="subtopic-card-desc">অনলাইনে তথ্য পূরণ করে প্রিন্টযোগ্য ফরম বা আবেদন প্রস্তুত করুন।</p>
              <div class="subtopic-card-footer">
                <span class="badge info">ফরম</span>
                <span>পূরণ করুন →</span>
              </div>
            </a>
          `;
        }
        const a = (BOOT.articles || []).find((x) => x.id === ch.id);
        return `
          <a class="subtopic-card" href="#/article/${ch.id}">
            <span class="subtopic-card-icon"></span>
            <h3 class="subtopic-card-title">${esc(ch.title)}</h3>
            <p class="subtopic-card-desc">${a ? esc(a.summary) : 'আইনগত অধিকার ও ধাপসমূহ।'}</p>
            <div class="subtopic-card-footer">
              <span> ${a ? esc(a.read) : '৪ মিনিট'}</span>
              <span>পড়ুন →</span>
            </div>
          </a>
        `;
      }).join('')}
    </div>
  </div>`;
}

// ---------- ৫. আবেদন ট্র্যাক করুন (pageTrack) ----------
async function pageTrack(queryStr) {
  const hash = (typeof queryStr === 'string' && queryStr) ? queryStr : (location.hash || '');
  const searchParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : (hash.startsWith('?') ? hash.slice(1) : ''));
  const initialId = searchParams.get('id') || searchParams.get('appId') || '';
  const initialLast4 = searchParams.get('last4') || '';

  app.innerHTML = `
  <div class="container page-head">
    <span class="section-tag">রিয়েলটাইম অনুসন্ধান</span>
    <h1> ${t('trackTitle')}</h1>
    <p>${t('trackLead')}</p>
  </div>
  <div class="container">
    <div class="form-card" style="max-width:720px">
      <div id="trackErr" class="form-error hidden"></div>
      
      <div class="field">
        <label>${t('appId')} <span class="req">*</span></label>
        <input id="t_id" value="${esc(initialId)}" placeholder="যেমন: APP-2026-0001 বা DLAS-NET-2026-04417" autocomplete="off">
        <div class="hint">${t('appIdHint')}</div>
      </div>
      
      <div class="field" style="margin-top:1.1rem">
        <label>${t('last4')} <span class="req">*</span></label>
        <input id="t_last4" value="${esc(initialLast4)}" maxlength="4" inputmode="numeric" placeholder="যেমন: 3344" autocomplete="off">
        <div class="hint">নিরাপত্তা যাচাইকরণ: নিবন্ধিত ফোন নম্বর বা জাতীয় পরিচয়পত্রের শেষ ৪ অঙ্ক</div>
      </div>

      <div style="margin-top:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:0.84rem;color:var(--text-muted)">
        <span>ডেমো রেকর্ড:</span>
        <button type="button" class="chip-demo" id="t_demo1" data-id="DLAS-NET-2026-04420" data-last4="0001">DLAS-NET-2026-04420 (ময়ূরী / ০০০১)</button>
        <button type="button" class="chip-demo" id="t_demo2" data-id="APP-2026-0001" data-last4="3344">APP-2026-0001 (৩৩৪৪)</button>
      </div>

      <div class="wizard-actions">
        <button class="btn btn-ghost" id="t_clear">${t('clear')}</button>
        <button class="btn btn-primary" id="t_go">
          <span></span> <span>${t('lookup')}</span>
        </button>
      </div>

      <div id="trackResult"></div>
    </div>
  </div>`;

  $('#t_clear').onclick = () => {
    $('#t_id').value = '';
    $('#t_last4').value = '';
    $('#trackResult').innerHTML = '';
    $('#trackErr').classList.add('hidden');
  };

  const doTrack = async () => {
    const err = $('#trackErr');
    const resultBox = $('#trackResult');
    err.classList.add('hidden');
    resultBox.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">অনুসন্ধান করা হচ্ছে…</div>';

    const appId = ($('#t_id').value || '').trim();
    const last4 = ($('#t_last4').value || '').trim();

    if (!appId || !last4) {
      err.textContent = 'অনুগ্রহ করে আবেদন আইডি ও শেষ ৪ ডিজিট উভয়ই পূরণ করুন।';
      err.classList.remove('hidden');
      resultBox.innerHTML = '';
      return;
    }

    const r = await apiPost('track', { appId, last4 });
    if (r.error) {
      err.textContent = r.error;
      err.classList.remove('hidden');
      resultBox.innerHTML = '';
      return;
    }

    resultBox.innerHTML = `
      <div style="background:var(--surface-2);border-radius:var(--radius-lg);padding:1.4rem;margin-top:1.5rem;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:10px">
          <div>
            <span style="font-size:0.8rem;color:var(--text-muted);font-weight:600">আবেদন নম্বর</span>
            <div style="font-size:1.35rem;font-weight:800;color:var(--gov-green);font-family:monospace">${esc(r.appId)}</div>
            ${r.caseId ? `<div style="font-size:0.88rem;color:var(--gov-gold);font-weight:700">কেস নম্বর: ${esc(r.caseId)}</div>` : ''}
          </div>
          <div style="text-align:right">
            <span class="badge success" style="font-size:0.85rem">ধাপ ${bnNum(r.stage + 1)}: ${esc(r.stageLabel)}</span>
            ${r.emergency ? '<div style="margin-top:4px"><span class="badge warn">জরুরি অগ্রাধিকার</span></div>' : ''}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;margin-bottom:12px;font-size:0.88rem">
          <div><strong>আবেদনকারী:</strong> ${esc(r.applicantName || 'নাগরিক')}</div>
          <div><strong>অফিস:</strong> ${esc(r.office || 'জেলা লিগ্যাল এইড অফিস')}</div>
          <div><strong>মামলার ধরন:</strong> ${esc(r.caseType || 'সাধারণ')}</div>
          <div><strong>দাখিল তারিখ:</strong> ${esc(r.submitted ? new Date(r.submitted).toLocaleDateString('bn-BD') : '—')}</div>
        </div>

        ${r.nextStep ? `
          <div class="quick-ans" style="margin:10px 0;background:var(--surface);border-color:var(--gov-green)">
             <strong>পরবর্তী পদক্ষেপ:</strong> ${esc(r.nextStep)}
          </div>
        ` : ''}

        ${(r.documents && r.documents.length) ? `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1rem 1.2rem;margin:10px 0">
            <strong style="font-size:.92rem"> সংযুক্ত ডকুমেন্ট (${bnNum(r.documents.length)}টি):</strong>
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px">
              ${r.documents.map((f) => `
                <a class="att-file-chip" href="${esc(f.url || '#')}" target="_blank" rel="noopener">
                  <span class="att-file-ic">${f.kind === 'image' ? '' : f.kind === 'pdf' ? '' : f.kind === 'video' ? '' : f.kind === 'audio' ? '' : ''}</span>
                  <span>
                    <strong>${esc(f.name.length > 28 ? f.name.slice(0, 26) + '…' : f.name)}</strong>
                    <small>${f.size ? (f.size < 1048576 ? bnNum(Math.round(f.size / 1024)) + ' KB' : bnNum((f.size / 1048576).toFixed(1)) + ' MB') : ''}</small>
                  </span>
                </a>`).join('')}
            </div>
          </div>
        ` : ''}

        ${(r.headsUp && r.headsUp.length) ? `
          <div class="quick-ans" style="margin:10px 0;background:var(--surface);border-color:var(--gov-gold)">
             <strong>গুরুত্বপূর্ণ নির্দেশনা:</strong>
            <ul style="margin:6px 0 0 18px;font-size:0.88rem">
              ${r.headsUp.map(h => `<li>${esc(h)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <h4 style="margin:1.4rem 0 0.8rem;font-size:1rem">প্রক্রিয়ার অগ্রগতি টাইমলাইন:</h4>
        <ul class="timeline">
          ${(r.stages || []).map((s, i) => `
            <li class="${s.done ? 'done' : ''} ${s.current ? 'current' : ''}">
              <div class="tl-dot">${s.done ? '✓' : bnNum(i + 1)}</div>
              <div class="tl-body">
                <strong>${esc(s.label)}</strong>
                ${s.current ? `<span>${t('currentStage')}</span>` : ''}
              </div>
            </li>
          `).join('')}
        </ul>

        <p style="color:var(--text-muted);font-size:0.84rem;margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
           ${esc(r.note || 'সম্পূর্ণ বিবরণের জন্য নিকটবর্তী লিগ্যাল এইড অফিসে যোগাযোগ করুন অথবা টোল-ফ্রি ১৬৬৯৯-এ কল করুন।')}
        </p>
      </div>
    `;
  };

  $('#t_go').onclick = doTrack;

  $('#t_demo1').onclick = () => {
    $('#t_id').value = 'DLAS-NET-2026-04420';
    $('#t_last4').value = '0001';
    doTrack();
  };

  $('#t_demo2').onclick = () => {
    $('#t_id').value = 'APP-2026-0001';
    $('#t_last4').value = '3344';
    doTrack();
  };

  // ড্যাশবোর্ড থেকে last4 ছাড়া এলে লোকালস্টোরেজের সেভ করা রেকর্ড থেকে বের করি —
  // ফলে ড্যাশবোর্ডের কার্ডে ক্লিক করলেই সরাসরি ট্র্যাকিং রেজাল্ট দেখায় (কোনো এরর নেই)।
  const fillLast4FromLocal = (appId) => {
    try {
      const stored = JSON.parse(localStorage.getItem('dlas_my_apps') || '[]');
      const hit = stored.find((x) => String(x.appId).toUpperCase() === String(appId).toUpperCase());
      if (hit && hit.last4) return hit.last4;
    } catch (e) {}
    return '';
  };

  const effectiveLast4 = initialLast4 || fillLast4FromLocal(initialId);
  if (effectiveLast4 && $('#t_last4')) $('#t_last4').value = effectiveLast4;

  if (initialId && effectiveLast4) {
    doTrack();
  }
}

// ---------- ৬. নতুন আবেদন দাখিল (pageApply) — Universal Form Covering All 18 Topics ----------
async function pageApply(queryStr) {
  const hash = (typeof queryStr === 'string' && queryStr) ? queryStr : (location.hash || '');
  const searchParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : (hash.startsWith('?') ? hash.slice(1) : ''));
  const prePurpose = searchParams.get('purpose') || 'new';
  const preCat = searchParams.get('category') || '';
  const isEmergency = searchParams.get('emergency') === 'true';

  // Comprehensive list of all 18 topics matching the Resource Library
  const allCategories = (BOOT && BOOT.categories) || [
    { id: 'family', title: 'পারিবারিক ও দেনমোহর বিরোধ' },
    { id: 'safety', title: 'নিরাপত্তা ও পারিবারিক সহিংসতা' },
    { id: 'land', title: 'বাসস্থান, জমি ও সম্পত্তি বিরোধ' },
    { id: 'money', title: 'অর্থ, ঋণ, দেনা ও প্রতারণা' },
    { id: 'crime', title: 'ফৌজদারি ও কারাবন্দী জামিন সহায়তা' },
    { id: 'labour', title: 'শ্রম, মজুরি ও চাকরি অধিকার' },
    { id: 'identity', title: 'পরিচয়পত্র, এনআইডি ও জন্ম নিবন্ধন' },
    { id: 'wills', title: 'উত্তরাধিকার সম্পত্তি ও ফারায়েজ' },
    { id: 'cyber', title: 'ডিজিটাল অপরাধ ও সাইবার হয়রানি' },
    { id: 'govt', title: 'সরকারি সহায়তা ও সামাজিক ভাতা' },
    { id: 'tax', title: 'আয়কর, ভ্যাট ও রাজস্ব' },
    { id: 'education', title: 'শিক্ষা ও ছাত্র অধিকার' },
    { id: 'farm', title: 'কৃষি ও মৎস্য শ্রমিক অধিকার' },
    { id: 'rights', title: 'ভোটাধিকার ও তথ্য অধিকার (RTI)' },
    { id: 'immigration', title: 'প্রবাসী শ্রমিক ও অভিবাসন' },
    { id: 'court', title: 'আদালতের কার্যপ্রণালী ও নকল' },
    { id: 'efiling', title: 'ই-ফাইলিং ও ডিজিটাল সেবা' },
    { id: 'health', title: 'স্বাস্থ্য ও পরিবেশ দূষণ' }
  ];

  const allDistricts = [...new Set(((BOOT && BOOT.offices) || []).map((o) => o.district))];
  if (!allDistricts.length) {
    allDistricts.push('ঢাকা', 'জয়পুরহাট', 'চট্টগ্রাম', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ', 'ঝিনাইদহ');
  }

  const state = {
    step: 1,
    data: {
      caseType: preCat || 'family',
      purpose: prePurpose,
      emergency: isEmergency,
      idType: 'nid' // 'nid', 'birth_cert', 'none'
    }
  };

  render();

  function render() {
    const steps = ['সমস্যা', 'পরিচয়', 'যোগাযোগ', 'আর্থ-সামাজিক', 'প্রতিপক্ষ', 'ডকুমেন্ট', 'যাচাই ও জমা'];
    app.innerHTML = `
    <div class="container page-head">
      <span class="section-tag">সরকারি আইনি সহায়তা</span>
      <h1> ${t('applyTitle')}</h1>
      <p>${t('applyLead')}</p>
    </div>
    <div class="container">
      <div class="form-card" style="max-width:740px">
        <div class="wizard-steps">
          ${steps.map((s, i) => `
            <div class="wstep ${i + 1 === state.step ? 'active' : i + 1 < state.step ? 'done' : ''}">
              ${bnNum(i + 1)}. ${s}
            </div>
          `).join('')}
        </div>
        <div id="stepBody"></div>
        <div class="wizard-actions">
          <button class="btn btn-ghost" id="aPrev" ${state.step === 1 ? 'style="visibility:hidden"' : ''}>← ${t('guideBack')}</button>
          <button class="btn btn-primary" id="aNext">
            ${state.step === 7 ? '✓ জমা দিন' : t('guideNext') + ' →'}
          </button>
        </div>
      </div>
    </div>`;

    renderStep();

    $('#aPrev').onclick = () => {
      if (state.step > 1) { state.step--; render(); }
    };
    $('#aNext').onclick = () => {
      if (!collect()) return;
      if (state.step < 7) { state.step++; render(); }
      else submit();
    };
  }

  function stepHtml(inner) { $('#stepBody').innerHTML = inner; }

  function renderStep() {
    const d = state.data;
    if (state.step === 1) {
      stepHtml(`
        <div class="field">
          <label>আপনার আইনি সমস্যার বিষয় নির্বাচন করুন <span class="req">*</span></label>
          <select id="f_caseType">
            ${allCategories.map(c => `
              <option value="${c.id}" ${d.caseType === c.id ? 'selected' : ''}>${esc(c.title)}</option>
            `).join('')}
          </select>
          <div class="hint">রিসোর্স লাইব্রেরির সকল ১৮টি ক্ষেত্রই এই একক ফরমে অন্তর্ভুক্ত।</div>
        </div>

        <div class="field" style="margin-top:1rem">
          <label>আপনার কাঙ্ক্ষিত প্রতিকার / উদ্দেশ্য</label>
          <select id="f_purpose">
            <option value="new" ${d.purpose === 'new' ? 'selected' : ''}>নতুন আইনি সমস্যার প্রতিকার</option>
            <option value="mediation" ${d.purpose === 'mediation' ? 'selected' : ''}>বিকল্প বিরোধ নিষ্পত্তি (ADR / মধ্যস্থতা)</option>
            <option value="lawyer" ${d.purpose === 'lawyer' ? 'selected' : ''}>সরকারি খরচে আইনজীবী ও আদালত সহায়তা</option>
            <option value="advice" ${d.purpose === 'advice' ? 'selected' : ''}>বিনামূল্যে আইনি পরামর্শ</option>
          </select>
        </div>

        <div class="field" style="margin-top:1rem">
          <label>জেলা <span class="req">*</span></label>
          <select id="f_district">
            ${allDistricts.map(x => `<option ${d.district === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
          </select>
        </div>

        <div class="field" style="margin-top:1rem">
          <label>সমস্যার বিস্তারিত বিবরণ <span class="req">*</span></label>
          <textarea id="f_problem" placeholder="কী ঘটেছে, কবে থেকে শুরু, প্রতিপক্ষ কে — সংক্ষেপে সহজ ভাষায় লিখুন...">${esc(d.problem || '')}</textarea>
        </div>

        <label class="check-line" style="margin-top:.8rem">
          <input type="checkbox" id="f_emergency" ${d.emergency ? 'checked' : ''}>
          <span>জরুরি আইনি সহায়তা প্রয়োজন (আটক/গ্রেপ্তার/উচ্ছেদ/তাত্ক্ষণিক হুমকি)</span>
        </label>
        <label class="check-line">
          <input type="checkbox" id="f_sensitive" ${d.sensitive ? 'checked' : ''}>
          <span>এটি স্পর্শকাতর অভিযোগ (পারিবারিক সহিংসতা/নির্যাতন) — সর্বোচ্চ গোপনীয়তা নিশ্চিত রাখুন</span>
        </label>
      `);
    } else if (state.step === 2) {
      stepHtml(`
        <div class="field">
          <label>আবেদনকারীর পুরো নাম <span class="req">*</span></label>
          <input id="f_name" value="${esc(d.name || '')}" placeholder="জাতীয় পরিচয়পত্র বা জন্মনিবন্ধন অনুযায়ী নাম">
        </div>

        <div class="form-grid" style="margin-top:.9rem">
          <div class="field">
            <label>লিঙ্গ</label>
            <select id="f_gender">
              <option ${d.gender === 'নারী' ? 'selected' : ''}>নারী</option>
              <option ${d.gender === 'পুরুষ' ? 'selected' : ''}>পুরুষ</option>
              <option ${d.gender === 'অন্যান্য' ? 'selected' : ''}>অন্যান্য</option>
            </select>
          </div>
          <div class="field">
            <label>বয়স</label>
            <input id="f_age" type="number" min="0" value="${esc(d.age || '')}" placeholder="যেমন: ৩৪">
          </div>
        </div>

        <!-- পরিচয়পত্রের ধরন (NID / জন্ম নিবন্ধন / কোনোটিই নেই) (PDF 2 কেইস এ১ Requirement) -->
        <div class="field" style="margin-top:1rem">
          <label>পরিচয়পত্র নির্ধারণ করুন</label>
          <select id="f_idType">
            <option value="nid" ${d.idType === 'nid' ? 'selected' : ''}>জাতীয় পরিচয়পত্র (NID)</option>
            <option value="birth_cert" ${d.idType === 'birth_cert' ? 'selected' : ''}>জন্ম নিবন্ধন সনদ (Birth Certificate)</option>
            <option value="none" ${d.idType === 'none' ? 'selected' : ''}>পরিচয়পত্র নেই (এখন উপলব্ধ নয়)</option>
          </select>
          <div class="hint">ময়ূরী বা সুবিধাবঞ্চিত নাগরিকের এনআইডি না থাকলে জন্ম নিবন্ধন বা পরিচয়পত্রহীন অবস্থায় আবেদন দাখিল সম্ভব।</div>
        </div>

        <div class="field ${d.idType === 'none' ? 'hidden' : ''}" id="idNumberWrap" style="margin-top:.8rem">
          <label id="idNumberLabel">${d.idType === 'birth_cert' ? 'জন্ম নিবন্ধন সনদ নম্বর' : 'জাতীয় পরিচয়পত্র (NID) নম্বর'}</label>
          <input id="f_nid" value="${esc(d.nid || '')}" placeholder="১০/১৩/১৭ ডিজিট">
        </div>

        <!-- প্রতিনিধি হিসেবে আবেদন (Ripon on behalf of Moyuri) -->
        <div style="background:var(--surface-2);padding:1rem;border-radius:10px;margin-top:1.2rem;border:1px dashed var(--border)">
          <label class="check-line">
            <input type="checkbox" id="f_isRep" ${d.isRep ? 'checked' : ''}>
            <span><strong>অন্যের পক্ষে (প্রতিনিধি হিসেবে) আবেদন করছেন?</strong> (যেমন আত্মীয়, প্রতিবেশী, সমাজকর্মী)</span>
          </label>
          <div id="repFields" class="${d.isRep ? '' : 'hidden'}" style="margin-top:10px">
            <div class="field">
              <label>প্রতিনিধির নাম</label>
              <input id="f_repName" value="${esc(d.repName || '')}" placeholder="আপনার নিজের নাম">
            </div>
            <div class="form-grid" style="margin-top:.8rem">
              <div class="field">
                <label>প্রতিনিধির মোবাইল নম্বর</label>
                <input id="f_repPhone" value="${esc(d.repPhone || '')}" placeholder="01XXXXXXXXX">
              </div>
              <div class="field">
                <label>আবেদনকারীর সাথে সম্পর্ক</label>
                <input id="f_repRelation" value="${esc(d.repRelation || '')}" placeholder="যেমন: ভাই, প্রতিবেশি, ইত্যাদি">
              </div>
            </div>
            <div class="hint">সংশ্লিষ্ট কর্মকর্তা প্রতিনিধির নম্বরে ফলোআপ কল দিয়ে বিস্তারিত যাচাই করবেন।</div>
          </div>
        </div>
      `);

      $('#f_idType').onchange = (e) => {
        d.idType = e.target.value;
        const wrap = $('#idNumberWrap');
        const lbl = $('#idNumberLabel');
        if (d.idType === 'none') {
          wrap.classList.add('hidden');
          d.nid = '';
        } else {
          wrap.classList.remove('hidden');
          lbl.textContent = d.idType === 'birth_cert' ? 'জন্ম নিবন্ধন সনদ নম্বর' : 'জাতীয় পরিচয়পত্র (NID) নম্বর';
        }
      };

      $('#f_isRep').onchange = (e) => {
        d.isRep = e.target.checked;
        $('#repFields').classList.toggle('hidden', !d.isRep);
      };
    } else if (state.step === 3) {
      stepHtml(`
        <div class="field">
          <label>আবেদনকারীর মোবাইল নম্বর <span class="req">*</span></label>
          <input id="f_phone" value="${esc(d.phone || '')}" placeholder="01XXXXXXXXX">
          <div class="hint">এই নম্বরেই আবেদন ট্র্যাকিং আইডি ও এসএমএস আপডেট পাঠানো হবে।</div>
        </div>

        <!-- ব্যক্তিগত নাকি শেয়ার্ড ফোন & নিরাপদ যোগাযোগের সময় (PDF 2 Requirement) -->
        <div class="form-grid" style="margin-top:.9rem">
          <div class="field">
            <label>ফোনটির প্রকৃতি</label>
            <select id="f_phoneType">
              <option value="personal" ${d.phoneType === 'personal' ? 'selected' : ''}>ব্যক্তিগত ফোন (শুধুমাত্র আবেদনকারী ধরেন)</option>
              <option value="shared" ${d.phoneType === 'shared' ? 'selected' : ''}>শেয়ার্ড ফোন (পরিবারের অন্য সদস্যও ধরতে পারেন)</option>
            </select>
          </div>
          <div class="field">
            <label>নিরাপদ যোগাযোগের সময়সূচি</label>
            <input id="f_window" value="${esc(d.window || '')}" placeholder="যেমন: সকাল ১০টা–১২টা, দুপুর ২টা–৪টা">
          </div>
        </div>

        <div class="field" style="margin-top:.9rem">
          <label>বিকল্প নিরাপদ ফোন নম্বর (যদি থাকে)</label>
          <input id="f_safe" value="${esc(d.safeNumber || '')}" placeholder="জরুরি অবস্থায় যোগাযোগের বিকল্প নিরাপদ নম্বর">
        </div>

        <div class="quick-ans" style="margin-top:1rem;background:var(--gov-green-surface);border-color:#A7F3D0">
           <strong>নিরাপদ যোগাযোগ সতর্কতা (Neutral Wording Policy):</strong>
          কল করার সময় যদি অন্য কেউ ফোন রিসিভ করে, লিগ্যাল এইডের সংবেদনশীল বা গোপনীয় তথ্য প্রকাশ না করে সাধারণ সরকারি বার্তা হিসেবে কথা বলা হবে।
        </div>
      `);
    } else if (state.step === 4) {
      stepHtml(`
        <div class="form-grid">
          <div class="field">
            <label>পেশা</label>
            <input id="f_occ" value="${esc(d.occ || '')}" placeholder="যেমন: গৃহিণী, দিনমজুর, কৃষক, ইত্যাদি">
          </div>
          <div class="field">
            <label>মাসিক পারিবারিক আয়</label>
            <select id="f_income">
              <option value="below_15k" ${d.income === 'below_15k' ? 'selected' : ''}>১৫,০০০ টাকার নিচে</option>
              <option value="15k_25k" ${d.income === '15k_25k' ? 'selected' : ''}>১৫,০০০ - ২৫,০০০ টাকা</option>
              <option value="above_25k" ${d.income === 'above_25k' ? 'selected' : ''}>২৫,০০০ টাকার উপরে</option>
            </select>
          </div>
        </div>
        <div class="field" style="margin-top:.9rem">
          <label>পরিবারের নির্ভরশীল সদস্য সংখ্যা</label>
          <input id="f_deps" type="number" min="0" value="${esc(d.deps || '')}" placeholder="যেমন: ৪">
        </div>
      `);
    } else if (state.step === 5) {
      stepHtml(`
        <div class="field">
          <label>প্রতিপক্ষের পুরো নাম (যদি জানা থাকে)</label>
          <input id="f_oppName" value="${esc(d.oppName || '')}" placeholder="যার বিরুদ্ধে অভিযোগ বা বিরোধ">
        </div>
        <div class="form-grid" style="margin-top:.9rem">
          <div class="field">
            <label>প্রতিপক্ষের ধরন</label>
            <select id="f_oppType">
              <option>ব্যক্তি</option>
              <option>প্রতিষ্ঠান/কোম্পানি</option>
              <option>সরকারি অফিস</option>
              <option>অজানা</option>
            </select>
          </div>
          <div class="field">
            <label>প্রতিপক্ষের ফোন নম্বর (যদি জানা থাকে)</label>
            <input id="f_oppPhone" value="${esc(d.oppPhone || '')}" placeholder="01XXXXXXXXX">
          </div>
        </div>
        <div class="quick-ans" style="margin-top:1rem">
           <strong>সুরক্ষিত রেকর্ড:</strong> প্রতিপক্ষকে কখনই আপনার যোগাযোগের সংবেদনশীল তথ্য জানানো হয় না।
        </div>
      `);
    } else if (state.step === 6) {
      // ---------- ধাপ ৬: ডকুমেন্ট / ছবি / ভিডিও সংযুক্তি (ঐচ্ছিক) ----------
      state.data.files = state.data.files || [];
      stepHtml(`
        <h3 style="margin:0 0 .4rem"> সহায়ক ডকুমেন্ট সংযুক্ত করুন <span style="font-weight:400;color:var(--text-muted);font-size:.85rem">(ঐচ্ছিক — চাইলে বাদ দিতে পারেন)</span></h3>
        <p style="font-size:.88rem;color:var(--text-muted);margin:.2rem 0 1rem">আপনার আবেদনের পক্ষে ছবি, স্ক্রিনশট, দলিল/সনদের PDF, ভয়েস রেকর্ডিং বা ভিডিও জুড়ে দিন। এগুলো কর্মকর্তার যাচাই দ্রুত করে এবং আবেদন শক্তিশালী হয়।</p>

        <div class="att-dropzone" id="attDrop">
          <div class="att-dropzone-icon"></div>
          <div class="att-dropzone-text"><strong>ফাইল টেনে আনুন</strong> অথবা নিচের বাটন থেকে বাছুন</div>
          <div class="att-dropzone-sub">ছবি (JPG/PNG), PDF, ভিডিও (MP4), অডিও — প্রতিটি সর্বোচ্চ ২৫ MB</div>
          <button type="button" class="btn btn-outline btn-sm" id="attPick">+ ফাইল বাছুন</button>
          <input type="file" id="attInput" multiple accept="image/*,.pdf,.mp4,.mov,.webm,.mp3,.m4a,.wav,.doc,.docx" style="display:none">
        </div>

        <div class="att-preview-grid" id="attPreview"></div>
        <div id="attErr" class="form-error hidden" style="margin-top:.8rem"></div>

        <div class="quick-ans" style="margin-top:1rem;background:var(--gov-green-surface);border-color:#A7F3D0">
           <strong>সুরক্ষা:</strong> ফাইলগুলো সার্ভারের সুরক্ষিত <code>data/uploads/</code> ফোল্ডারে আপনার আবেদন আইডির নিজস্ব ফোল্ডারে সংরক্ষিত হবে — শুধু দায়িত্বপ্রাপ্ত কর্মকর্তাই দেখতে পারবেন।
        </div>
      `);

      const renderPreviews = () => {
        const files = state.data.files;
        $('#attPreview').innerHTML = files.map((f, i) => `
          <div class="att-preview-card">
            <button type="button" class="att-remove" data-i="${i}" title="সরিয়ে ফেলুন">✕</button>
            ${f.isImage
              ? `<img class="att-thumb" src="${f.preview}" alt="${esc(f.name)}">`
              : `<div class="att-thumb att-thumb-icon">${f.kind === 'pdf' ? '' : f.kind === 'video' ? '' : f.kind === 'audio' ? '' : ''}</div>`}
            <div class="att-meta">
              <div class="att-name" title="${esc(f.name)}">${esc(f.name.length > 26 ? f.name.slice(0, 24) + '…' : f.name)}</div>
              <div class="att-size">${f.sizeKB < 1024 ? bnNum(f.sizeKB) + ' KB' : bnNum((f.sizeKB / 1024).toFixed(1)) + ' MB'}</div>
            </div>
          </div>`).join('') || '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:.85rem;padding:.6rem">এখনো কোনো ফাইল যোগ করা হয়নি</div>';
        $$('#attPreview .att-remove').forEach((b) => {
          b.onclick = () => {
            const f = state.data.files[+b.dataset.i];
            if (f && f.preview) URL.revokeObjectURL(f.preview);
            state.data.files.splice(+b.dataset.i, 1);
            renderPreviews();
          };
        });
      };
      renderPreviews();

      const addFiles = (list) => {
        const err = $('#attErr');
        err.classList.add('hidden');
        for (const file of list) {
          const ext = (file.name.split('.').pop() || '').toLowerCase();
          const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext) || (file.type || '').startsWith('image/');
          const kind = isImage ? 'image' : ext === 'pdf' ? 'pdf' : ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : ['mp3', 'm4a', 'wav'].includes(ext) ? 'audio' : 'doc';
          if (file.size > 25 * 1024 * 1024) {
            err.textContent = `"${file.name}" ফাইলটি ২৫ মেগাবাইটের বেশি — ছোট কপি দিন।`;
            err.classList.remove('hidden');
            continue;
          }
          state.data.files.push({
            file,
            name: file.name,
            sizeKB: Math.round(file.size / 1024),
            kind,
            isImage,
            preview: isImage ? URL.createObjectURL(file) : null
          });
        }
        renderPreviews();
      };

      $('#attPick').onclick = () => $('#attInput').click();
      $('#attInput').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
      const dz = $('#attDrop');
      ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('att-dropzone-live'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('att-dropzone-live'); }));
      dz.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
    } else {
      const d2 = state.data;
      const catObj = allCategories.find(c => c.id === d2.caseType);
      stepHtml(`
        <h3>আপনার আবেদন যাচাই করুন</h3>
        <div class="quick-ans" style="margin-top:.8rem">
          <p><strong>আইনি বিষয়:</strong> ${catObj ? esc(catObj.title) : 'সাধারণ আইনি সমস্যা'}</p>
          <p><strong>আবেদনকারী:</strong> ${esc(d2.name || '—')} · <strong>ফোন:</strong> ${esc(d2.phone || '—')}</p>
          <p><strong>জেলা:</strong> ${esc(d2.district || '—')} · <strong>পরিচয়পত্র:</strong> ${d2.idType === 'none' ? 'উপলব্ধ নয়' : (d2.idType === 'birth_cert' ? 'জন্মনিবন্ধন' : 'এনআইডি')} (${esc(d2.nid || '—')})</p>
          ${d2.isRep ? `<p><strong>মনোনীত প্রতিনিধি:</strong> ${esc(d2.repName)} (${esc(d2.repRelation)} · ${esc(d2.repPhone)})</p>` : ''}
          <p><strong>জরুরি অগ্রাধিকার:</strong> ${d2.emergency ? 'হ্যাঁ' : 'না'} · <strong>স্পর্শকাতর সুরক্ষা:</strong> ${d2.sensitive ? 'হ্যাঁ' : 'না'}</p>
        </div>

        <!-- আইনগত সম্মতি ও সঠিক রেফারেন্স (PDF 2 কেইস এ১ Requirement) -->
        <div style="background:var(--surface-2);border-radius:10px;padding:1.1rem;border:1px solid #A7F3D0;margin-top:1rem;font-size:0.88rem;line-height:1.6">
           <strong>আপনার তথ্য সুরক্ষা ও আইনি অধিকার:</strong>
          বাংলাদেশ লিগ্যাল এইড ডিরেক্টরেট আপনার আবেদন নিষ্পত্তি ও আইনি সহায়তা দেওয়ার জন্য এই তথ্য সংগ্রহ করে। কেবল আপনার দায়িত্বপ্রাপ্ত কর্মকর্তা, প্যানেল আইনজীবী বা মধ্যস্থতাকারী এটি দেখেন; প্রতিপক্ষকে কখনই জানানো হয় না।
          তথ্যটি <strong>ব্যক্তিগত উপাত্ত সুরক্ষা আইন, ২০২৬ (২০২৬ সনের ৬৩ নং আইন)</strong> অনুযায়ী সুরক্ষিত থাকে।
        </div>

        <label class="check-line" style="margin-top:1rem">
          <input type="checkbox" id="f_true">
          <span>আমি নিশ্চিত করছি যে উপরে প্রদত্ত সকল তথ্য সত্য ও সঠিক।</span>
        </label>
        <div id="applyErr" class="form-error hidden"></div>
      `);
    }
  }

  function collect() {
    const d = state.data;
    if (state.step === 1) {
      d.caseType = $('#f_caseType').value;
      d.purpose = $('#f_purpose').value;
      d.district = $('#f_district').value;
      d.problem = $('#f_problem').value.trim();
      d.emergency = $('#f_emergency').checked;
      d.sensitive = $('#f_sensitive').checked;
      if (!d.problem) { toast('সমস্যার সংক্ষিপ্ত বিবরণ লিখুন'); return false; }
    } else if (state.step === 2) {
      d.name = $('#f_name').value.trim();
      d.gender = $('#f_gender').value;
      d.age = $('#f_age').value;
      d.idType = $('#f_idType').value;
      const nidInp = $('#f_nid');
      d.nid = (nidInp && d.idType !== 'none') ? nidInp.value.trim() : '';
      if (!d.name) { toast('আবেদনকারীর পুরো নাম লিখুন'); return false; }
      if (d.isRep) {
        d.repName = ($('#f_repName')?.value || '').trim();
        d.repPhone = ($('#f_repPhone')?.value || '').trim();
        d.repRelation = ($('#f_repRelation')?.value || '').trim();
      }
    } else if (state.step === 3) {
      d.phone = $('#f_phone').value.trim();
      d.phoneType = $('#f_phoneType').value;
      d.window = $('#f_window').value.trim();
      d.safeNumber = $('#f_safe').value.trim();
      if (!/^01\d{9}$/.test(d.phone)) {
        toast('সঠিক ১১ ডিজিটের ফোন নম্বর দিন (01XXXXXXXXX)');
        return false;
      }
    } else if (state.step === 4) {
      d.occ = $('#f_occ').value.trim();
      d.income = $('#f_income').value;
      d.deps = $('#f_deps').value;
    } else if (state.step === 5) {
      d.oppName = $('#f_oppName').value.trim();
      d.oppType = $('#f_oppType').value;
      d.oppPhone = $('#f_oppPhone').value.trim();
    } else if (state.step === 6) {
      // ডকুমেন্ট ঐচ্ছিক — ফাইলগুলো স্টেটেই থাকে, এখানে শুধু নিশ্চিত করি অ্যারে আছে
      d.files = d.files || [];
    } else {
      if (!$('#f_true').checked) {
        toast('তথ্য সঠিক বলে বক্সে টিক চিহ্ন দিন');
        return false;
      }
    }
    return true;
  }

  async function submit() {
    const d = state.data;
    // বাংলা case-type লেবেল সার্ভারে পাঠাই — ট্র্যাক/ড্যাশবোর্ডে মানব-পাঠযোগ্য দেখায়
    const caseSel = document.getElementById('f_caseType');
    if (caseSel && caseSel.selectedOptions && caseSel.selectedOptions[0]) {
      d.caseTypeLabel = caseSel.selectedOptions[0].text.trim();
    }
    if (d.safeNumber || d.window) {
      d.safeContact = {
        safeNumber: d.safeNumber || d.phone,
        window: d.window || 'সকাল ১০টা - বিকাল ৪টা',
        neutralWording: true
      };
    }
    if (d.isRep && d.repName) {
      d.representation = {
        repName: d.repName,
        repPhone: d.repPhone,
        relation: d.repRelation,
        scope: 'intake-only'
      };
    }

    const nextBtn = $('#aNext');
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = 'জমা হচ্ছে...';
    }

    const r = await apiPost('applications', d);

    if (!r.ok && !r.success) {
      toast(r.error || t('errGeneric'));
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = '✓ জমা দিন';
      }
      return;
    }

    const finalAppId = r.appId || r.applicationId || ('APP-2026-' + Math.floor(1000 + Math.random() * 9000));

    // ---------- সংযুক্ত ডকুমেন্ট আপলোড (ধাপ ৬) — সার্ভারের data/uploads/<appId>/ ফোল্ডারে সেভ ----------
    const pendingFiles = d.files || [];
    if (pendingFiles.length) {
      try {
        const fd = new FormData();
        fd.append('appId', finalAppId);
        pendingFiles.forEach((f) => fd.append('files', f.file, f.name));
        const up = await fetch('/api/attachments', { method: 'POST', body: fd });
        const upRes = await up.json();
        if (!up.ok || upRes.error) {
          console.warn('Attachment upload warning:', upRes.error);
          toast(' আবেদন জমা হয়েছে, কিন্তু কিছু ফাইল আপলোড হয়নি — পরে অফিসে জুড়ে দিতে পারবেন');
        }
      } catch (e) {
        console.warn('Attachment upload failed:', e);
      }
    }

    // Save locally to citizen's localStorage dashboard store
    try {
      const stored = JSON.parse(localStorage.getItem('dlas_my_apps') || '[]');
      stored.unshift({
        appId: finalAppId,
        caseType: ctLabel(d.caseType),
        district: d.district,
        submittedAt: new Date().toISOString(),
        status: 'অপেক্ষমাণ (UNDER_REVIEW)',
        stage: d.emergency ? 1 : 0,
        last4: (d.phone || '').replace(/\D/g, '').slice(-4) || '3344'
      });
      localStorage.setItem('dlas_my_apps', JSON.stringify(stored.slice(0, 30)));
    } catch (e) {}

    app.innerHTML = `
    <div class="container page-head">
      <h1> আপনার আইনি সহায়তা আবেদন সফলভাবে জমা হয়েছে</h1>
    </div>
    <div class="container">
      <div class="form-card" style="text-align:center;max-width:740px">
        <p style="color:var(--text-muted)">আপনার আবেদন ট্র্যাকিং আইডি:</p>
        <div style="font-size:2rem;font-weight:800;font-family:monospace;color:var(--gov-green);margin:.5rem 0 1rem">
          ${esc(finalAppId)}
        </div>
        
        <div class="quick-ans" style="text-align:left;background:var(--gov-green-surface);border-color:#A7F3D0">
           <strong>বিনামূল্যে সরকারি সেবা:</strong> এই আবেদন ও তৎপরবর্তী সকল আইনি সহায়তা সম্পূর্ণ বিনামূল্যে। কোনো ফি প্রদান করবেন না।
        </div>

        ${pendingFiles.length ? `
        <div style="background:var(--surface-2);border-radius:10px;padding:1.1rem;text-align:left;margin-top:1rem">
          <strong> সংযুক্ত ডকুমেন্ট (${bnNum(pendingFiles.length)}টি):</strong>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
            ${pendingFiles.map((f) => `<span class="badge info" style="font-size:.8rem">${f.kind === 'image' ? '' : f.kind === 'pdf' ? '' : f.kind === 'video' ? '' : f.kind === 'audio' ? '' : ''} ${esc(f.name.length > 30 ? f.name.slice(0, 28) + '…' : f.name)}</span>`).join('')}
          </div>
          <div class="hint" style="margin-top:8px"> সার্ভার ফোল্ডার: <code>data/uploads/${esc(finalAppId)}/</code> — ফাইলগুলো আপনার আবেদনের সাথেই সংরক্ষিত হয়েছে।</div>
        </div>` : ''}

        <div style="background:var(--surface-2);border-radius:10px;padding:1.2rem;text-align:left;margin-top:1.2rem">
          <strong>পরবর্তী করণীয় ও ধাপসমূহ:</strong>
          <ul style="margin:.6rem 0 0 1.4rem;font-size:0.92rem;line-height:1.6">
            <li>উপজেলা বা জেলা লিগ্যাল এইড কর্মকর্তা আবেদনটি পর্যালোচনা করবেন।</li>
            <li>আপনার মোবাইল নম্বরে এসএমএস এর মাধ্যমে আপডেট পাঠানো হবে।</li>
            <li>নিচের বোতামে ক্লিক করে যেকোনো সময় আবেদনের সরাসরি অগ্রগতি দেখতে পারবেন।</li>
          </ul>
        </div>

        <div class="wizard-actions" style="justify-content:center;gap:12px;margin-top:1.8rem">
          <a class="btn btn-outline" href="#/track?id=${encodeURIComponent(finalAppId)}&last4=${encodeURIComponent((d.phone || '3344').slice(-4))}">
             আবেদন ট্র্যাক করুন
          </a>
          <a class="btn btn-primary" href="#/dashboard">
             নাগরিক ড্যাশবোর্ডে দেখুন
          </a>
          <a class="btn btn-ghost" href="#/">
             হোমে যান
          </a>
        </div>
      </div>
    </div>`;
  }
}

// ---------- ৭. নাগরিক ড্যাশবোর্ড (pageDashboard) ----------
async function pageDashboard() {
  const localApps = JSON.parse(localStorage.getItem('dlas_my_apps') || '[]');
  let serverApps = [];

  if (ME) {
    try {
      const r = await apiGet('applications');
      serverApps = r.applications || [];
    } catch (e) {}
  }

  // Merge unique by appId
  const combinedMap = new Map();
  // JSON application store (DLAS-NET-*) — লগইন করা নাগরিকের সব আবেদন
  if (ME && (!ME.userId || /^DLAS-NET-/.test(String(ME.citizenApplicationId || '')))) {
    try {
      const mine = await apiGet('my_applications');
      (mine.applications || []).forEach(a => {
        combinedMap.set(a.appId, {
          appId: a.appId,
          caseType: ctLabel(a.caseType),
          district: a.district || '',
          submittedAt: a.createdAt || null,
          stage: (typeof a.stage === 'number') ? a.stage : 0,
          emergency: !!a.emergency,
          last4: ((ME.phoneDigits || a.phone || '') + '').replace(/\D/g, '').slice(-4) || '0001'
        });
      });
    } catch (e) {}
  }
  // Normalize server (SQLite) rows into the dashboard shape
  serverApps.forEach(a => {
    combinedMap.set(a.appId || a.id, {
      appId: a.appId || a.id,
      caseType: ctLabel(a.caseType),
      district: a.district || a.applicantDistrict || '',
      submittedAt: a.submittedAt || a.createdAt,
      stage: stageFromStatus(a.status, a.caseStatus),
      emergency: !!(a.emergency || a.urgencyFlag),
      last4: ((a.phone || a.primaryPhone || '') + '').replace(/\D/g, '').slice(-4) || '3344'
    });
  });
  localApps.forEach(a => {
    if (!combinedMap.has(a.appId)) combinedMap.set(a.appId, a);
  });
  const apps = Array.from(combinedMap.values());

  const stageIcons = ['', '', '', '', ''];

  app.innerHTML = `
  <div class="container page-head">
    <div class="dash-hero">
      <div class="dash-avatar"></div>
      <div>
        <h1>${t('dashTitle')}</h1>
        <p>${ME ? 'স্বাগতম, <strong>' + esc(ME.name || 'নাগরিক') + '</strong>!' : 'আপনার দাখিলকৃত আবেদনের রিয়েলটাইম অবস্থা ও ইতিহাস'}</p>
      </div>
      ${ME ? `<button class="btn btn-outline btn-sm" id="d_logout" style="margin-left:auto">${t('logout')}</button>` : `<a class="btn btn-primary btn-sm" href="#/login" style="margin-left:auto">লগইন করুন</a>`}
    </div>
  </div>
  <div class="container">
    <div class="dash-grid">
      <div class="stat-card">
        <h3>মোট আবেদন</h3>
        <div class="stat-num">${bnNum(apps.length)}</div>
      </div>
      <div class="stat-card">
        <h3>চলমান / পর্যালোচনায়</h3>
        <div class="stat-num">${bnNum(apps.filter(a => (a.stage || 0) < 4).length)}</div>
      </div>
      <div class="stat-card">
        <h3>নিষ্পত্তি সম্পন্ন</h3>
        <div class="stat-num">${bnNum(apps.filter(a => (a.stage || 0) >= 4).length)}</div>
      </div>
      <div class="stat-card">
        <h3>জরুরি সহায়তা</h3>
        <div class="stat-num">${bnNum(apps.filter(a => a.emergency).length)}</div>
      </div>
    </div>

    <div class="dash-head-row" style="margin:2rem 0 1rem;display:flex;justify-content:space-between;align-items:center">
      <h2>${t('myApps')}</h2>
      <a class="btn btn-primary btn-sm" href="#/apply">+ নতুন আবেদন দাখিল করুন</a>
    </div>

    ${apps.length ? `
      <div class="myapps">
        ${apps.map(a => `
          <a class="app-card" href="#/track?id=${encodeURIComponent(a.appId)}&last4=${encodeURIComponent(a.last4 || '3344')}&auto=1" style="text-decoration:none;color:inherit">
            <span class="app-stage-icon">${stageIcons[a.stage || 0] || ''}</span>
            <span class="app-main">
              <span class="app-id">${esc(a.appId)}</span>
              <span class="app-meta">
                ${esc(a.caseType || 'পারিবারিক/সাধারণ')} · ${a.district ? esc(a.district) + ' · ' : ''}দাখিল: ${new Date(a.submittedAt || a.createdAt || Date.now()).toLocaleDateString('bn-BD')}
              </span>
            </span>
            <span class="app-right">
              <span class="badge ${(a.stage || 0) >= 4 ? 'success' : 'warn'}">
                ${(a.stage || 0) >= 4 ? 'নিষ্পত্তি সম্পন্ন' : 'চলমান (UNDER REVIEW)'}
              </span>
              <span class="app-chevron">›</span>
            </span>
          </a>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state">
        ${t('noApps')}
        <div style="margin-top:12px">
          <a class="btn btn-primary" href="#/apply">নতুন আবেদন করুন →</a>
        </div>
      </div>
    `}
  </div>`;

  const logoutBtn = $('#d_logout');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await doLogout();
      location.hash = '#/';
      route();
      toast('লগআউট সম্পন্ন হয়েছে');
    };
  }
}

// ---------- ৮. আধুনিক পরিষ্কার লগইন প্যানেল (pageLogin) — Executive Redesign ----------
async function pageLogin() {
  if (ME) {
    if (ME.role && ME.role !== 'applicant' && ME.role !== 'CITIZEN') {
      return (location.hash = '#/console');
    }
    return (location.hash = '#/dashboard');
  }

  let activeTab = 'citizen'; // 'citizen', 'staff', 'door'

  function render() {
    app.innerHTML = `
    <div class="container auth-clean-wrap">
      <div class="auth-clean-card">
        <div class="auth-clean-header">
          <h1> CoU JusticeLab পোর্টাল</h1>
          <p>ডিজিটাল আইনগত সহায়তা ও সেবা ব্যবস্থাপনা — অ্যাকাউন্টে প্রবেশ করুন</p>
        </div>

        <!-- ৩টি স্পষ্ট ভূমিকা বাটন (3 Clean Role Tabs) -->
        <div class="auth-role-tabs">
          <button type="button" class="auth-role-btn ${activeTab === 'citizen' ? 'active' : ''}" id="tabBtnCitizen">
             নাগরিক লগইন
          </button>
          <button type="button" class="auth-role-btn ${activeTab === 'staff' ? 'active' : ''}" id="tabBtnStaff">
             কর্মকর্তা / প্রোভাইডার
          </button>
          <button type="button" class="auth-role-btn ${activeTab === 'door' ? 'active' : ''}" id="tabBtnDoor">
             ডোর / হেল্পলাইন
          </button>
        </div>

        <div id="loginErr" class="form-error hidden"></div>

        <!-- ১. নাগরিক লগইন -->
        <div id="loginCitizenForm" class="${activeTab === 'citizen' ? '' : 'hidden'}">
          <div class="field">
            <label>মোবাইল নম্বর বা আবেদন আইডি <span class="req">*</span></label>
            <input id="c_id" placeholder="যেমন: 01700000001 বা DLAS-NET-2026-04420" value="01700000001">
          </div>
          <div class="field" style="margin-top:1rem">
            <label>৪-সংখ্যার পিন (PIN) <span class="req">*</span></label>
            <input id="c_pin" type="password" maxlength="6" value="0001" placeholder="••••">
            <div class="hint">ডেমো: ময়ূরী আক্তার — ফোন ০১৭০০০০০০০১ / আবেদন DLAS-NET-2026-04420, পিন/শেষ ৪ অঙ্ক: ০০০১</div>
          </div>
          <button class="btn btn-primary btn-block" id="btnCitizenSubmit" style="margin-top:1.4rem">
             নাগরিক অ্যাকাউন্টে প্রবেশ করুন →
          </button>
        </div>

        <!-- ২. কর্মকর্তা / প্রোভাইডার লগইন -->
        <div id="loginStaffForm" class="${activeTab === 'staff' ? '' : 'hidden'}">
          <div class="auth-quick-preset-select">
            <label><strong>পদবী নির্বাচন করুন (স্বয়ংক্রিয় পূরণ):</strong></label>
            <select id="staffPresetSelect">
              <option value="officer.joypurhat|1234">রহিমা খাতুন — DLAO কর্মকর্তা (জয়পুরহাট)</option>
              <option value="lawyer.kabir|1234">অ্যাডভ. কবির হোসেন — প্যানেল আইনজীবী</option>
              <option value="mediator.joypurhat|1234">নাসরিন সুলতানা — মধ্যস্থতাকারী (ADR)</option>
              <option value="receiving.dhaka|1234">তানভীর আহমেদ — গ্রহণকারী DLAO (ঢাকা)</option>
              <option value="udc.khagrachari|1234">জয়ন্ত চাকমা — UDC উদ্যোক্তা</option>
              <option value="admin|1234">সিস্টেম প্রশাসক (Admin)</option>
            </select>
          </div>

          <div class="field">
            <label>ব্যবহারকারী নাম (Username) <span class="req">*</span></label>
            <input id="s_user" value="officer.joypurhat" placeholder="যেমন: officer.joypurhat">
          </div>
          <div class="field" style="margin-top:1rem">
            <label>৪-সংখ্যার পিন (PIN) <span class="req">*</span></label>
            <input id="s_pin" type="password" value="1234" maxlength="8" placeholder="••••">
          </div>
          <button class="btn btn-primary btn-block" id="btnStaffSubmit" style="margin-top:1.4rem">
             কর্মকর্তা পোর্টালে প্রবেশ করুন →
          </button>
        </div>

        <!-- ৩. ডোর / দ্রুত এক্সেস -->
        <div id="loginDoorForm" class="${activeTab === 'door' ? '' : 'hidden'}">
          <p style="font-size:0.9rem;color:var(--text-muted);margin-bottom:1rem">
            হেল্পলাইন ১৬৬৯৯ এজেন্ট বা ইউনিয়ন ডিজিটাল সেন্টার (UDC) অপারেটরদের জন্য দ্রুত প্রবেশ ব্যবস্থা:
          </p>
          <div class="field">
            <label>প্রবেশ কোড বা এজেন্ট আইডি</label>
            <input id="d_code" value="helpline.agent1" placeholder="helpline.agent1">
          </div>
          <button class="btn btn-primary btn-block" id="btnDoorSubmit" style="margin-top:1.4rem">
             এক্সেস করুন →
          </button>
        </div>

        <!-- নতুন অ্যাকাউন্ট তৈরির লিংক → সিগনআপ পেজ -->
        <div class="auth-signup-link-row">
          <span>নতুন ব্যবহারকারী?</span>
          <a href="#/signup" id="loginSignupLink" class="auth-signup-link"> নতুন অ্যাকাউন্ট তৈরি করুন</a>
        </div>
      </div>
    </div>`;

    $('#tabBtnCitizen').onclick = () => { activeTab = 'citizen'; render(); };
    $('#tabBtnStaff').onclick = () => { activeTab = 'staff'; render(); };
    $('#tabBtnDoor').onclick = () => { activeTab = 'door'; render(); };

    const presetSel = $('#staffPresetSelect');
    if (presetSel) {
      presetSel.onchange = () => {
        const [u, p] = presetSel.value.split('|');
        $('#s_user').value = u;
        $('#s_pin').value = p;
      };
    }

    const showErr = (msg) => {
      const e = $('#loginErr');
      e.textContent = msg;
      e.classList.remove('hidden');
    };

    // Citizen login
    const btnC = $('#btnCitizenSubmit');
    if (btnC) {
      btnC.onclick = async () => {
        const id = $('#c_id').value.trim();
        const pin = $('#c_pin').value.trim();
        if (!id || !pin) return showErr('মোবাইল নম্বর ও পিন উভয়ই প্রদান করুন');

        const r = await apiPost('auth', { mode: 'citizen', phone: id, pin });
        if (r.error) return showErr(r.error);
        ME = (r.session || r.user || { name: 'নাগরিক', role: 'CITIZEN' });
        ME.phoneDigits = id.replace(/\D/g, '');
        renderAuthLink();
        location.hash = '#/dashboard';
        toast('সফলভাবে লগইন হয়েছে');
      };
    }

    // ── লগইন পেজের নিচে "নতুন অ্যাকাউন্ট তৈরি করুন" লিংক → সিগনআপ পেজ ──
    const signupLink = $('#loginSignupLink');
    if (signupLink) {
      signupLink.onclick = () => { location.hash = '#/signup'; return false; };
    }

    // Staff login
    const btnS = $('#btnStaffSubmit');
    if (btnS) {
      btnS.onclick = async () => {
        const username = $('#s_user').value.trim();
        const pin = $('#s_pin').value.trim();
        if (!username || !pin) return showErr('ইউজারনেম ও পিন দিন');

        const r = await apiPost('auth', { mode: 'staff', username, pin });
        if (r.error) return showErr(r.error);
        ME = (r.session || r.user || { name: username, role: 'OFFICER' });
        renderAuthLink();
        location.hash = '#/console';
        toast('কর্মকর্তা কনসোলে প্রবেশ সম্পন্ন');
      };
    }

    // Door login
    const btnD = $('#btnDoorSubmit');
    if (btnD) {
      btnD.onclick = async () => {
        const code = $('#d_code').value.trim();
        const r = await apiPost('auth', { mode: 'staff', username: code, pin: '1234' });
        if (r.error) return showErr(r.error);
        ME = (r.session || r.user || { name: code, role: 'UDC' });
        renderAuthLink();
        location.hash = '#/console';
        toast('এক্সেস অনুমোদিত');
      };
    }
  }

  render();
}

// ---------- অন্যান্য পেজসমূহ ----------
async function pageEligibility() {
  app.innerHTML = `
  <div class="container page-head">
    <span class="section-tag">যোগ্যতা যাচাই</span>
    <h1> আইনি সহায়তা পাওয়ার যোগ্যতা ক্যালকুলেটর</h1>
    <p>আইনগত সহায়তা প্রদান নীতিমালা ২০১৪ অনুসারে আপনার বিনামূল্যে সেবা পাওয়ার অধিকার তাৎক্ষণিক পরীক্ষা করুন।</p>
  </div>
  <div class="container">
    <div class="form-card" style="max-width:720px">
      <div class="field">
        <label>আপনার মাসিক পারিবারিক আয় কত?</label>
        <select id="el_income">
          <option value="12000">১৫,০০০ টাকার নিচে (দরিদ্র/অসচ্ছল)</option>
          <option value="20000">১৫,০০০ - ২৫,০০০ টাকা</option>
          <option value="35000">২৫,০০০ টাকার উপরে</option>
        </select>
      </div>
      <div class="field" style="margin-top:1rem">
        <label>বিশেষ অধিকার বা অগ্রাধিকার:</label>
        <select id="el_spec">
          <option value="none">সাধারণ নাগরিক</option>
          <option value="women">নারী ও শিশু নির্যাতনের শিকার</option>
          <option value="freedom">বীর মুক্তিযোদ্ধা</option>
          <option value="disabled">প্রতিবন্ধী ব্যক্তি</option>
          <option value="prisoner">আটক বিচারাধীন বন্দি</option>
        </select>
      </div>
      <button class="btn btn-primary" id="btnCheckEl" style="margin-top:1.2rem">যোগ্যতা পরীক্ষা করুন</button>
      <div id="elResult" style="margin-top:1.2rem"></div>
    </div>
  </div>`;

  $('#btnCheckEl').onclick = () => {
    const inc = parseInt($('#el_income').value, 10);
    const spec = $('#el_spec').value;
    const ok = inc <= 25000 || spec !== 'none';
    $('#elResult').innerHTML = ok
      ? `<div style="background:var(--gov-green-surface);padding:1rem;border-radius:8px;border:1px solid #A7F3D0">
          <h4 style="color:var(--gov-green-dark)"> আপনি সরকারি খরচে বিনামূল্যে আইনি সেবা পাওয়ার সম্পূর্ণ যোগ্য!</h4>
          <p style="margin-top:6px;font-size:0.9rem">আপনি আইনজীবী নিয়োগ, পরামর্শ ও মধ্যস্থতার সকল সুবিধা সম্পূর্ণ রাষ্ট্রীয় খরচে পাবেন।</p>
          <a class="btn btn-primary btn-sm" href="#/apply" style="margin-top:10px">আবেদন দাখিল করুন →</a>
        </div>`
      : `<div style="background:var(--surface-2);padding:1rem;border-radius:8px;border:1px solid var(--border)">
          <h4> আপনি আইনি পরামর্শ ও মধ্যস্থতার সেবা গ্রহণ করতে পারেন।</h4>
          <p style="margin-top:6px;font-size:0.9rem">আইনজীবী নিয়োগের ক্ষেত্রে জেলা কমিটির বিশেষ অনুমোদন প্রয়োজন হতে পারে।</p>
          <a class="btn btn-outline btn-sm" href="#/guide" style="margin-top:10px">পরামর্শ গাইড দেখুন →</a>
        </div>`;
  };
}

async function pageOffices() {
  const offices = (BOOT && BOOT.offices) || [];
  const districtOffices = offices.filter(o => o.type === 'district');
  const divisionList = [...new Set(districtOffices.map(o => o.division))];
  const BN = (n) => bnNum(n);

  app.innerHTML = `
  <div class="container page-head">
    <span class="section-tag">দেশব্যাপী নেটওয়ার্ক</span>
    <h1> ৬৪ জেলা লিগ্যাল এইড অফিস ও লাইভ ম্যাপ</h1>
    <p>আপনার নিকটতম জেলা জজ আদালতে অবস্থিত লিগ্যাল এইড অফিসে সরাসরি যোগাযোগ করুন বা ম্যাপে খুঁজে নিন।</p>
  </div>
  <div class="container">
    <div class="office-explorer">
      <!-- Left: search + scrollable office list -->
      <div class="office-list-panel">
        <div class="search-bar" style="margin:0 0 10px">
          <input id="offQ" placeholder="জেলার নাম লিখুন — যেমন: ঢাকা, জয়পুরহাট, চট্টগ্রাম...">
        </div>
        <div class="office-count-line" id="offCount"></div>
        <div class="office-list-scroll" id="officeList"></div>
      </div>
      <!-- Right: interactive Leaflet map (large, like SS6/7) -->
      <div class="office-map-panel">
        <div id="officeMap"></div>
        <div class="office-map-footer">
          <span> তালিকা বা ম্যাপের পিনে ক্লিক করে সরাসরি লোকেশন ও যোগাযোগ দেখুন</span>
          <span class="office-count-small" id="offCountSmall"></span>
        </div>
      </div>
    </div>
  </div>`;

  // ---------- map init (Leaflet already loaded via index.html) ----------
  let map = null;
  const markers = [];
  const brandPin = (active) => L.divIcon({
    className: '',
    html: `<div class="oa-pin ${active ? 'oa-pin-active' : ''}"></div>`,
    iconSize: [30, 36],
    iconAnchor: [15, 34],
    popupAnchor: [0, -30]
  });

  if (typeof L !== 'undefined' && $('#officeMap')) {
    map = L.map('officeMap', { scrollWheelZoom: true }).setView([23.7, 90.35], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    offices.forEach(o => {
      if (o.lat == null || o.lng == null) return;
      const m = L.marker([o.lat, o.lng], { icon: brandPin(false) }).addTo(map);
      m.bindPopup(
        `<div class="oa-popup">
          <button class="oa-popup-close" aria-label="বন্ধ করুন">✕</button>
          <h4> ${esc(o.name)}</h4>
          <p> ${esc(o.address || '')}</p>
          <p class="oa-popup-phone"> ${esc(o.phone || '১৬৬৯৯')}</p>
          <div class="oa-popup-actions">
            <a class="oa-btn oa-btn-ghost" href="tel:${esc((o.phone || '16699').replace(/\D/g, ''))}"> কল</a>
            <a class="oa-btn oa-btn-primary" href="#/apply">আবেদন</a>
          </div>
        </div>`,
        { maxWidth: 280, minWidth: 240 }
      );
      m.on('popupopen', () => {
        m.setIcon(brandPin(true));
        const closeBtn = m.getPopup().getElement().querySelector('.oa-popup-close');
        if (closeBtn) closeBtn.onclick = () => m.closePopup();
      });
      m.on('popupclose', () => m.setIcon(brandPin(false)));
      m.on('click', () => { selectOffice(o.id, { fromMap: true }); m.openPopup(); });
      markers.push({ id: o.id, marker: m });
    });
  }

  const focusOnMap = (o) => {
    if (!map || o.lat == null) return;
    map.flyTo([o.lat, o.lng], 10, { duration: 0.6 });
    const hit = markers.find(x => x.id === o.id);
    if (hit) {
      hit.marker.setIcon(brandPin(true));
      setTimeout(() => { try { hit.marker.openPopup(); } catch (e) {} }, 650);
    }
  };

  const selectOffice = (id, opts = {}) => {
    const o = offices.find(x => x.id === id);
    if (!o) return;
    focusOnMap(o);
    $$('.office-row').forEach(r => r.classList.toggle('active', r.dataset.id === id));
    if (!opts.fromMap) {
      const row = $(`.office-row[data-id="${id}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  // ---------- left list ----------
  const renderList = (q = '') => {
    const ql = q.trim().toLowerCase();
    const matched = districtOffices.filter(o => !ql || (o.name + ' ' + o.district + ' ' + (o.division || '')).toLowerCase().includes(ql));
    const countEl = $('#offCount');
    if (countEl) countEl.textContent = `মোট অফিস: ${BN(matched.length)}টি`;
    const countSmall = $('#offCountSmall');
    if (countSmall) countSmall.textContent = `সর্বমোট ${BN(offices.length)}টি লোকেশন`;
    let html = '';
    divisionList.forEach(div => {
      const items = matched.filter(o => o.division === div);
      if (!items.length) return;
      html += items.map(o => `
        <button type="button" class="office-row" data-id="${o.id}">
          <span class="office-row-name">
            <strong> ${esc(o.district)} জেলা লিগ্যাল এইড অফিস</strong>
            <small class="office-row-tag">জেলা ভিত্তিক</small>
          </span>
        </button>
      `).join('');
    });
    $('#officeList').innerHTML = html || '<div class="empty-state">কোনো জেলা পাওয়া যায়নি।</div>';
    $$('.office-row').forEach(btn => {
      btn.onclick = () => selectOffice(btn.dataset.id);
    });
  };

  renderList();
  $('#offQ').oninput = (e) => renderList(e.target.value);
}

async function pageNews() {
  const news = (BOOT && BOOT.news) || [];
  app.innerHTML = `
  <div class="container page-head">
    <span class="section-tag">আপডেট ও বিজ্ঞপ্তি</span>
    <h1> নিউজ, ইভেন্ট ও সার্কুলার</h1>
    <p>জাতীয় আইনগত সহায়তা প্রদান সংস্থা (NLASO)-র সাম্প্রতিক কার্যক্রম ও সংবাদ।</p>
  </div>
  <div class="container">
    <div class="news-grid">
      ${news.map(n => `
        <a class="news-card" href="#/news/${n.id}">
          <div class="news-card-img-wrap">
            <img class="news-card-img" src="${n.img}" alt="${esc(n.title)}" loading="lazy">
            <span class="news-card-tag">${esc(n.type === 'event' ? 'ইভেন্ট' : 'নিউজ')}</span>
          </div>
          <div class="news-card-body">
            <div class="news-card-date"> ${esc(n.date)}</div>
            <h3 class="news-card-title">${esc(n.title)}</h3>
            <p class="news-card-desc">${esc(n.body || '')}</p>
            <span class="news-card-link">বিস্তারিত পড়ুন →</span>
          </div>
        </a>
      `).join('')}
    </div>
  </div>`;
}

async function pageNewsDetail(id) {
  const n = ((BOOT && BOOT.news) || []).find(x => x.id === id);
  if (!n) return pageNews();
  const summary = n.summary || n.body || '';
  const highlights = n.highlights || [];
  const sections = n.sections || [];
  const stats = n.stats || [];
  const cases = n.cases || [];
  const isEvent = n.type === 'event';

  app.innerHTML = `
  <div class="container page-head">
    <div class="breadcrumb"><a href="#/news">নিউজ ও ইভেন্ট</a> / ${esc(n.title.length > 40 ? n.title.slice(0, 38) + '…' : n.title)}</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      <span class="news-badge ${isEvent ? 'event' : 'news'}">${isEvent ? 'ইভেন্ট' : 'নিউজ'}</span>
      <span style="color:var(--text-muted);font-size:.88rem"> ${esc(n.date)}</span>
    </div>
    <h1>${esc(n.title)}</h1>
    ${summary ? `<p class="news-detail-lead">${esc(summary)}</p>` : ''}
  </div>
  <div class="container news-detail-wrap">
    <div class="news-detail-main">
      <img class="news-detail-img" src="${n.img}" alt="${esc(n.title)}" loading="lazy">

      ${highlights.length ? `
      <div class="news-hl-strip">
        ${highlights.map((h) => `<div class="news-hl-item">✓ ${esc(h)}</div>`).join('')}
      </div>` : ''}

      <div class="news-detail-body">
        <p>${esc(n.body)}</p>
        ${sections.map((s) => `
          <h3> ${esc(s.h)}</h3>
          <p>${esc(s.p)}</p>
        `).join('')}
      </div>

      ${(stats.length || cases.length) ? `
      <div class="news-stats-row">
        ${stats.map(([num, label]) => `
          <div class="news-stat-card">
            <div class="news-stat-num">${esc(num)}</div>
            <div class="news-stat-label">${esc(label)}</div>
          </div>`).join('')}
      </div>` : ''}

      ${cases.length ? `
      <div class="news-cases-block">
        <h3> ${isEvent ? 'বিস্তারিত তথ্য' : 'কেস স্টাডি'}</h3>
        ${cases.map((c) => `
          <div class="news-case-card">
            <strong>${esc(c.t)}</strong>
            <p>${esc(c.d)}</p>
          </div>`).join('')}
      </div>` : ''}

      <div class="news-cta-row">
        <a class="btn btn-primary" href="#/apply"> আইনি সহায়তা পেতে আবেদন করুন</a>
        <a class="btn btn-outline" href="tel:16699"> ১৬৬৯৯ হেল্পলাইন</a>
        <a class="btn btn-ghost" href="#/news">← সব নিউজে ফিরুন</a>
      </div>
    </div>

    <aside class="news-detail-side">
      <div class="news-side-box">
        <h4> অন্যান্য নিউজ</h4>
        ${((BOOT && BOOT.news) || []).filter((x) => x.id !== id).slice(0, 5).map((x) => `
          <a class="news-side-item" href="#/news/${x.id}">
            <img src="${x.img}" alt="" loading="lazy">
            <div>
              <strong>${esc(x.title.length > 52 ? x.title.slice(0, 50) + '…' : x.title)}</strong>
              <small>${esc(x.date)}</small>
            </div>
          </a>`).join('')}
      </div>
      <div class="news-side-box news-side-cta">
        <h4> বিনামূল্যে সেবা</h4>
        <p>যেকোনো আইনি সমস্যায় সরকারি খরচে সহায়তা পান — আজই আবেদন করুন।</p>
        <a class="btn btn-primary btn-sm btn-block" href="#/apply" style="margin-top:8px">আবেদন করুন →</a>
      </div>
    </aside>
  </div>`;
}

async function pageSearch() {
  app.innerHTML = `
  <div class="container page-head">
    <h1> সাইটে খুঁজুন</h1>
    <div class="search-bar" style="margin-top:1rem;max-width:100%">
      <input id="fullSearchQ" placeholder="যা খুঁজছেন লিখুন (যেমন: তালাক, দেনমোহর, জমি, জামিন, অফিস)...">
    </div>
  </div>
  <div class="container"><div id="fullSearchResults"></div></div>`;

  const doSearch = (q = '') => {
    q = q.trim().toLowerCase();
    if (!q) {
      $('#fullSearchResults').innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem">অনুসন্ধানের শব্দ লিখুন</div>';
      return;
    }
    const articles = (BOOT.articles || []).filter(a => (a.title + ' ' + (a.summary || '')).toLowerCase().includes(q));
    const offices = (BOOT.offices || []).filter(o => (o.name + ' ' + (o.district || '')).toLowerCase().includes(q));

    $('#fullSearchResults').innerHTML = `
      <h3>আর্টিকেল ও গাইড (${bnNum(articles.length)}টি)</h3>
      <div class="subtopic-grid" style="margin-bottom:2rem">
        ${articles.map(a => `
          <a class="subtopic-card" href="#/article/${a.id}">
            <h3 class="subtopic-card-title">${esc(a.title)}</h3>
            <p class="subtopic-card-desc">${esc(a.summary)}</p>
            <div class="subtopic-card-footer"><span> ${esc(a.read)}</span><span>পড়ুন →</span></div>
          </a>
        `).join('') || '<p style="color:var(--text-muted)">কোনো আর্টিকেল মিলেনি।</p>'}
      </div>
      <h3>অফিস ডিরেক্টরি (${bnNum(offices.length)}টি)</h3>
      <div class="services-grid">
        ${offices.map(o => `
          <div class="service-card">
            <h3> ${esc(o.name)}</h3>
            <p>${esc(o.address || '')}</p>
            <div>ফোন: ${esc(o.phone || '১৬৬৯৯')}</div>
          </div>
        `).join('') || '<p style="color:var(--text-muted)">কোনো অফিস মিলেনি।</p>'}
      </div>
    `;
  };

  $('#fullSearchQ').oninput = (e) => doSearch(e.target.value);
}

async function pageHelp() {
  pageHome();
  const el = document.querySelector('.channel-grid');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

async function pageHelpChannel(ch) {
  if (ch === 'ussd') openUssdSimulator();
  else pageHelp();
}

async function pageForm(id) {
  const f = ((BOOT && BOOT.articles) || []).find(a => a.id === id || a.formId === id);
  app.innerHTML = `
  <div class="container page-head">
    <div class="breadcrumb"><a href="#/topics">লাইব্রেরি</a> / ফরম পূরণ</div>
    <h1> ${esc(f ? f.title : 'আইনি ফরম ও নোটিশ জেনারেটর')}</h1>
    <p>নিচের ফিল্ডগুলো পূরণ করলেই সঠিক আইনি ফরম্যাটে প্রিন্টযোগ্য দলিল তৈরি হবে।</p>
  </div>
  <div class="container">
    <div class="form-card" style="max-width:740px">
      <div class="field"><label>আবেদনকারীর নাম <span class="req">*</span></label><input id="doc_name" placeholder="আপনার পুরো নাম"></div>
      <div class="field" style="margin-top:1rem"><label>প্রতিপক্ষের নাম <span class="req">*</span></label><input id="doc_opp" placeholder="প্রতিপক্ষের পুরো নাম"></div>
      <div class="field" style="margin-top:1rem"><label>নোটিশের কারণ বা দাবি <span class="req">*</span></label><textarea id="doc_desc" placeholder="দাবি বা ঘটনার সংক্ষিপ্ত বিবরণ..."></textarea></div>
      <button class="btn btn-primary" id="btnGenDoc" style="margin-top:1.2rem">নোটিশ তৈরি করুন</button>
      <div id="docOutput" style="margin-top:1.5rem"></div>
    </div>
  </div>`;

  $('#btnGenDoc').onclick = () => {
    const name = $('#doc_name').value || 'আবেদনকারী';
    const opp = $('#doc_opp').value || 'প্রতিপক্ষ';
    const desc = $('#doc_desc').value || 'আইনি দাবিসমূহ';
    $('#docOutput').innerHTML = `
      <div style="background:#FFF;border:1px solid #000;padding:2rem;font-family:serif;line-height:1.8">
        <div style="text-align:center;font-weight:700;margin-bottom:1.5rem">আইনি নোটিশ / লিগ্যাল নোটিশ</div>
        <p><strong>প্রাপক:</strong> ${esc(opp)}</p>
        <p><strong>প্রেরক:</strong> ${esc(name)}</p>
        <p><strong>বিষয়:</strong> ${esc(desc)}</p>
        <p style="margin-top:1rem">এতদ্বারা আপনাকে জানানো যাইতেছে যে, উপরোক্ত বিষয়ে অত্র নোটিশ প্রাপ্তির ৩০ (ত্রিশ) দিনের মধ্যে বিষয়টি সমাধান না করিলে উপযুক্ত আদালতের আশ্রয় গ্রহণ করা হইবে।</p>
        <div style="margin-top:2rem;text-align:right">স্বাক্ষর: ${esc(name)}</div>
      </div>
      <button class="btn btn-outline" onclick="window.print()" style="margin-top:1rem"> প্রিন্ট করুন</button>
    `;
  };
}

async function pageArticle(id) {
  const a = ((BOOT && BOOT.articles) || []).find(x => x.id === id);
  if (!a) return pageTopics();
  app.innerHTML = `
  <div class="container page-head">
    <div class="breadcrumb"><a href="#/topics">লাইব্রেরি</a> / আর্টিকেল</div>
    <h1>${esc(a.title)}</h1>
    <div style="color:var(--text-muted);font-size:0.88rem;margin-top:6px">পড়ার সময়: ${esc(a.read || '৪ মিনিট')} · হালনাগাদ: ২০২৬</div>
  </div>
  <div class="container" style="max-width:800px;margin-bottom:3rem">
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2rem;line-height:1.8;font-size:1.05rem">
      <p style="font-weight:600;color:var(--gov-green);margin-bottom:1rem">${esc(a.summary)}</p>
      <div style="margin-top:1rem">${esc(a.body || 'এই বিষয়ে জেলা লিগ্যাল এইড অফিসে বিনামূল্যে পরামর্শ ও আইনগত সহায়তা পাওয়া যায়। বিস্তারিত তথ্যের জন্য টোল-ফ্রি ১৬৬৯৯ হেল্পলাইনে যোগাযোগ করুন।')}</div>
      <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;gap:12px;flex-wrap:wrap">
        <a class="btn btn-primary" href="#/apply">আইনি সহায়তা পেতে আবেদন করুন →</a>
        <a class="btn btn-outline" href="#/topics">আরও আর্টিকেল দেখুন</a>
      </div>
    </div>
  </div>`;
}

// ---------- নাগরিক সিগনআপ পেজ (pageRegister) — নাম + ফোন + পাসওয়ার্ড ----------
// এখানে অ্যাকাউন্ট তৈরি হলে সাথে সাথে লগইন হয়ে যায়, আর পরে একই ফোন +
// পাসওয়ার্ড দিয়ে লগইন পেজের "নাগরিক লগইন" ট্যাব থেকে ঢোকা যায়।
async function pageRegister() {
  if (ME) return (location.hash = '#/dashboard');

  app.innerHTML = `
  <div class="container auth-clean-wrap">
    <div class="auth-clean-card">
      <div class="auth-clean-header">
        <h1> নতুন অ্যাকাউন্ট তৈরি করুন</h1>
        <p>CoU JusticeLab পোর্টালে নিবন্ধন করুন — সম্পূর্ণ বিনামূল্যে, সরকারি সেবা</p>
      </div>

      <div id="signupErr" class="form-error hidden"></div>

      <div class="field">
        <label>আপনার পুরো নাম <span class="req">*</span></label>
        <input id="su_name" placeholder="যেমন: মোছাঃ করিমা বেগম" autocomplete="name">
      </div>
      <div class="field" style="margin-top:1rem">
        <label>মোবাইল নম্বর <span class="req">*</span></label>
        <input id="su_phone" type="tel" inputmode="numeric" maxlength="14" placeholder="01XXXXXXXXX" autocomplete="tel">
        <div class="hint">এই নম্বর ও পাসওয়ার্ড দিয়েই পরে লগইন করবেন</div>
      </div>
      <div class="field" style="margin-top:1rem">
        <label>পাসওয়ার্ড <span class="req">*</span></label>
        <input id="su_pass" type="password" placeholder="কমপক্ষে ৪ অক্ষর" autocomplete="new-password">
      </div>
      <div class="field" style="margin-top:1rem">
        <label>পাসওয়ার্ড আবার লিখুন <span class="req">*</span></label>
        <input id="su_pass2" type="password" placeholder="একই পাসওয়ার্ড আবার দিন" autocomplete="new-password">
      </div>

      <button class="btn btn-primary btn-block" id="btnSignupSubmit" style="margin-top:1.4rem">
         অ্যাকাউন্ট তৈরি করুন →
      </button>

      <div class="auth-signup-link-row">
        <span>আগে থেকেই অ্যাকাউন্ট আছে?</span>
        <a href="#/login" id="signupLoginLink" class="auth-signup-link"> লগইন করুন</a>
      </div>
    </div>
  </div>`;

  const showErr = (msg) => {
    const e = $('#signupErr');
    e.textContent = msg;
    e.classList.remove('hidden');
  };

  $('#signupLoginLink').onclick = () => { location.hash = '#/login'; return false; };

  $('#btnSignupSubmit').onclick = async () => {
    const name = $('#su_name').value.trim();
    const phone = $('#su_phone').value.trim();
    const pass = $('#su_pass').value;
    const pass2 = $('#su_pass2').value;

    if (!name) return showErr('আপনার নাম লিখুন');
    if (!phone || phone.replace(/\D/g, '').length < 11) return showErr('সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন (যেমন: 01712345678)');
    if (!pass || pass.length < 4) return showErr('পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের দিন');
    if (pass !== pass2) return showErr('দুটি পাসওয়ার্ড মিলছে না — আবার চেক করুন');

    const btn = $('#btnSignupSubmit');
    btn.disabled = true;
    btn.textContent = ' অ্যাকাউন্ট তৈরি হচ্ছে…';

    const r = await apiPost('auth', { mode: 'signup', name, phone, password: pass });
    btn.disabled = false;
    btn.textContent = ' অ্যাকাউন্ট তৈরি করুন →';

    if (r.error) {
      showErr(r.error + (r.alreadyRegistered ? ' — নিচের "লগইন করুন" লিংকে ক্লিক করুন।' : ''));
      return;
    }
    ME = (r.session || r.user || { name, role: 'CITIZEN' });
    ME.phoneDigits = phone.replace(/\D/g, '');
    renderAuthLink();
    toast(' অ্যাকাউন্ট তৈরি সফল! স্বাগতম, ' + (ME.name || name));
    location.hash = '#/dashboard';
  };
}

async function pageComplaint() {
  app.innerHTML = `
  <div class="container page-head">
    <span class="section-tag">জবাবদিহিতা</span>
    <h1> অভিযোগ দাখিল</h1>
    <p>লিগ্যাল এইড সেবা নিয়ে কোনো অভিযোগ বা অনিয়ম পরিলক্ষিত হলে জানান। প্রতিটি অভিযোগ গুরুত্বের সাথে তদন্ত করা হয়।</p>
  </div>
  <div class="container">
    <div class="form-card" style="max-width:720px">
      <div class="field"><label>আপনার নাম ও মোবাইল নম্বর</label><input id="cmp_contact" placeholder="নাম ও ফোন"></div>
      <div class="field" style="margin-top:1rem"><label>অভিযোগের বিবরণ <span class="req">*</span></label><textarea id="cmp_desc" placeholder="কী ঘটেছে বিস্তারিত লিখুন..."></textarea></div>
      <button class="btn btn-primary" id="btnCmpSubmit" style="margin-top:1.2rem">অভিযোগ দাখিল করুন</button>
      <div id="cmpResult" style="margin-top:1rem"></div>
    </div>
  </div>`;

  $('#btnCmpSubmit').onclick = async () => {
    const desc = ($('#cmp_desc').value || '').trim();
    if (!desc) { toast('অভিযোগের বিবরণ লিখুন'); return; }
    $('#cmpResult').innerHTML = '<div style="background:var(--gov-green-surface);padding:1rem;border-radius:8px"> আপনার অভিযোগটি গ্রহণ করা হয়েছে (আইডি: CMP-2026-042)। ৩ কার্যদিবসের মধ্যে কর্তৃপক্ষ তদন্ত করবে।</div>';
  };
}

async function pageCall() {
  app.innerHTML = `
  <div class="container page-head">
    <h1> ১৬৬৯৯ জাতীয় লিগ্যাল এইড কল সেন্টার</h1>
    <p>সরাসরি ফোনে আবেদন দাখিল ও তাত্ক্ষণিক পরামর্শ গ্রহণের সুবিধা।</p>
  </div>
  <div class="container" style="text-align:center;padding:3rem 0">
    <a class="btn btn-primary" href="tel:16699" style="font-size:1.3rem;padding:1rem 2.5rem;border-radius:50px">
       ১৬৬৯৯ ডায়াল করুন (টোল-ফ্রি)
    </a>
  </div>`;
}

function renderAuthLink() {
  const el = $('#loginLink');
  if (!el) return;
  if (ME) {
    el.innerHTML = esc(ME.name || 'ড্যাশবোর্ড') + ' ';
    el.href = ME.role && ME.role !== 'applicant' && ME.role !== 'CITIZEN' ? '#/console' : '#/dashboard';
  } else {
    el.innerHTML = 'লগইন <span style="font-size:14px"></span>';
    el.href = '#/login';
  }
}

// ---------- ইনিশিয়ালাইজেশন ----------
(async function init() {
  initShell();
  try {
    BOOT = await apiGet('bootstrap');
  } catch (e) {
    console.error('Failed to load bootstrap data:', e);
  }
  // Cookie session restore — লগইন পেজ রিলোডেও টিকে থাকে
  try {
    const s = await apiGet('auth');
    if (s && s.session && s.session.role) ME = s.session;
  } catch (e) {}
  renderAuthLink();
  await route();
})();
