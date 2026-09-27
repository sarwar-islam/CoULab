/**
 * আইনসহায় — SPA router ও সব পেজের লজিক।
 * রাউট: #/, #/topics, #/topic/:id, #/article/:id, #/guide, #/search?q=,
 *       #/apply, #/track, #/offices, #/news, #/help, #/login, #/register,
 *       #/dashboard, #/complaint
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

async function apiGet(name, params = {}) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch('/api/' + name + (q ? '?' + q : ''));
  return r.json();
}
async function apiPost(name, body) {
  const r = await fetch('/api/' + name, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  });
  return r.json();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ---------- থিম / ভাষা / a11y ----------
function initShell() {
  // থিম
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  else if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
  $('#themeToggle').textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
  $('#themeToggle').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    $('#themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
  };

  // ভাষা
  const savedLang = localStorage.getItem('lang');
  if (savedLang) document.documentElement.lang = savedLang;
  $('#langToggle').onclick = () => {
    const next = document.documentElement.lang === 'bn' ? 'en' : 'bn';
    document.documentElement.lang = next;
    localStorage.setItem('lang', next);
    applyI18n();
    route();
  };

  // প্রবেশগম্যতা
  const a11y = JSON.parse(localStorage.getItem('a11y') || '{}');
  if (a11y.fscale) document.documentElement.style.setProperty('--fscale', a11y.fscale);
  if (a11y.contrast) document.documentElement.dataset.contrast = 'high';
  $('#a11yToggle').onclick = () => $('#a11yPanel').classList.toggle('hidden');
  $('#fsInc').onclick = () => setFscale(Math.min(1.5, (a11y.fscale || 1) + .1));
  $('#fsDec').onclick = () => setFscale(Math.max(.8, (a11y.fscale || 1) - .1));
  $('#contrastToggle').onclick = () => {
    const on = document.documentElement.dataset.contrast === 'high';
    if (on) delete document.documentElement.dataset.contrast; else document.documentElement.dataset.contrast = 'high';
    a11y.contrast = !on; localStorage.setItem('a11y', JSON.stringify(a11y));
  };
  $('#a11yReset').onclick = () => { localStorage.removeItem('a11y'); location.reload(); };
  function setFscale(v) {
    a11y.fscale = Math.round(v * 10) / 10;
    document.documentElement.style.setProperty('--fscale', a11y.fscale);
    localStorage.setItem('a11y', JSON.stringify(a11y));
  }

  // মোবাইল মেনু
  $('#navBurger').onclick = () => $('#mainNav').classList.toggle('open');

  // চ্যাট
  const chatBody = $('#chatBody');
  const chatOpen = () => { $('#chatWidget').classList.remove('hidden'); $('#chatText').focus(); };
  $('#chatFab').onclick = () => { const w = $('#chatWidget'); if (w.classList.contains('hidden')) chatOpen(); else w.classList.add('hidden'); };
  $('#chatClose').onclick = () => $('#chatWidget').classList.add('hidden');
  window.__chatOpen = chatOpen;

  const chatNav = (route, label) => {
    if (route === location.hash) return;
    const div = document.createElement('div');
    div.className = 'msg bot chat-acted';
    div.textContent = '➡️ ' + (label || route);
    chatBody.appendChild(div); chatBody.scrollTop = chatBody.scrollHeight;
  };

  const renderActions = (r) => {
    const wrap = document.createElement('div');
    wrap.className = 'chat-actions';
    const mkBtn = (html, cls, fn) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'chat-chip ' + cls; btn.innerHTML = html;
      btn.onclick = fn; return btn;
    };
    if (r.action && r.action.route) {
      wrap.appendChild(mkBtn(esc(r.action.label || r.action.route), 'primary', () => {
        chatNav(r.action.route, r.action.label);
        $('#chatWidget').classList.add('hidden');
        location.hash = r.action.route;
      }));
    }
    for (const key of r.actions || []) {
      const acts = {
        home: ['#/','🏠 হোম'], library: ['#/topics','📚 লাইব্রেরি'], guide: ['#/guide','🧭 গাইড'],
        apply: ['#/apply','📝 আবেদন'], track: ['#/track','📦 ট্র্যাক'], offices: ['#/offices','🗺️ অফিস'],
        news: ['#/news','📰 নিউজ'], help: ['#/help','🤝 সহায়তা'], call: ['#/call','📞 কল করুন'],
        login: ['#' + (ME ? '/dashboard' : '/login'), ME ? '👤 ড্যাশবোর্ড' : '🔐 লগইন'],
        dashboard: ['#/dashboard','👤 ড্যাশবোর্ড'], complaint: ['#/complaint','📣 অভিযোগ'], search: ['#/search','🔍 খুঁজুন']
      };
      const a = acts[key]; if (!a) continue;
      wrap.appendChild(mkBtn(a[1], '', () => {
        chatNav(a[0], a[1]);
        $('#chatWidget').classList.add('hidden');
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
      btn.type = 'button'; btn.className = 'chat-chip'; btn.textContent = q;
      btn.onclick = () => {
        const fake = document.createElement('div');
        fake.className = 'msg user'; fake.textContent = q;
        chatBody.appendChild(fake); chatBody.scrollTop = chatBody.scrollHeight;
        sendChat(q);
      };
      wrap.appendChild(btn);
    }
    chatBody.appendChild(wrap);
  };

  const sendChat = async (override) => {
    const txt = (override != null ? override : $('#chatText').value).trim();
    if (!txt) return;
    if (override == null) $('#chatText').value = '';
    chatBody.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(txt)}</div>`);
    chatBody.scrollTop = chatBody.scrollHeight;
    const typing = document.createElement('div');
    typing.className = 'msg bot typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    chatBody.appendChild(typing); chatBody.scrollTop = chatBody.scrollHeight;
    const r = await apiPost('chat', { message: txt });
    typing.remove();
    const reply = String(r.reply || t('errGeneric'));
    const fmt = esc(reply).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    chatBody.insertAdjacentHTML('beforeend', `<div class="msg bot">${fmt}</div>`);
    if (r.route && r.autoNavigate !== false && r.action) {
      renderActions(r);
    } else if (r.action && r.action.route) {
      // অটো নেভিগেট — সাইট কন্ট্রোল
      chatNav(r.action.route, r.action.label);
      location.hash = r.action.route;
    }
    renderActions(r);
    renderQuick(r);
    chatBody.scrollTop = chatBody.scrollHeight;
  };

  $('#chatForm').onsubmit = async (e) => { e.preventDefault(); await sendChat(); };
}

// ---------- router ----------
const routes = [
  { re: /^#?\/?$/, fn: pageHome },
  { re: /^#\/topics$/, fn: pageTopics },
  { re: /^#\/topic\/([\w-]+)$/, fn: pageTopic },
  { re: /^#\/section\/([\w-]+)$/, fn: pageSection },
  { re: /^#\/form\/([\w-]+)$/, fn: pageForm },
  { re: /^#\/article\/([\w-]+)$/, fn: pageArticle },
  { re: /^#\/guide$/, fn: pageGuide },
  { re: /^#\/search$/, fn: pageSearch },
  { re: /^#\/apply$/, fn: pageApply },
  { re: /^#\/track$/, fn: pageTrack },
  { re: /^#\/offices$/, fn: pageOffices },
  { re: /^#\/news$/, fn: pageNews },
  { re: /^#\/news\/([\w-]+)$/, fn: pageNewsDetail },
  { re: /^#\/call$/, fn: pageCall },
  { re: /^#\/help$/, fn: pageHelp },
  { re: /^#\/help\/([\w-]+)$/, fn: pageHelpChannel },
  { re: /^#\/login$/, fn: pageLogin },
  { re: /^#\/register$/, fn: pageRegister },
  { re: /^#\/dashboard$/, fn: pageDashboard },
  { re: /^#\/console(\?.*)?$/, fn: pageConsole },
  { re: /^#\/complaint$/, fn: pageComplaint }
];

async function route() {
  const hash = location.hash || '#/';
  applyI18n();
  $$('#mainNav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === hash.split('?')[0]));
  for (const r of routes) {
    const m = hash.match(r.re);
    if (m) { try { await r.fn(...m.slice(1)); } catch (e) { console.error(e); app.innerHTML = `<div class="empty-state">${t('errGeneric')}</div>`; } window.scrollTo(0, 0); return; }
  }
  app.innerHTML = `<div class="empty-state"><h2>৪০৪</h2><p>পেজটি পাওয়া যায়নি।</p></div>`;
}

// ---------- ম্যাপ (Leaflet) ----------
let mapObj = null;
function initOfficeMap(highlightId) {
  const el = document.getElementById('map');
  if (!el || typeof L === 'undefined') return;
  if (mapObj) { mapObj.remove(); mapObj = null; }
  mapObj = L.map('map', { scrollWheelZoom: true }).setView([23.8, 90.2], 6.4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap'
  }).addTo(mapObj);
  const group = [];
  for (const o of BOOT.offices) {
    if (o.lat == null) continue;
    const color = o.type === 'special' ? '#C25E4C' : o.type === 'labour' ? '#B8863B' : o.type === 'pilot' ? '#5A7A9A' : '#3D9970';
    const marker = L.circleMarker([o.lat, o.lng], { radius: 7, color, fillColor: color, fillOpacity: .85, weight: 2 });
    marker.bindPopup(`<div class="map-popup"><strong>${esc(o.name)}</strong><span>${esc(o.address)}</span><br>📞 <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a><br>🕘 ${esc(o.hours)}</div>`);
    marker.on('click', () => highlightCard(o.id));
    marker.addTo(mapObj);
    group.push(marker);
    o._marker = marker;
  }
  if (highlightId) {
    const o = BOOT.offices.find((x) => x.id === highlightId);
    if (o && o._marker) {
      mapObj.setView([o.lat, o.lng], 12);
      setTimeout(() => o._marker.openPopup(), 350);
    }
  }
}
function highlightCard(id) {
  const card = document.querySelector(`[data-office="${id}"]`);
  if (card) {
    $$('.office-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ---------- হোম পেজ ----------
async function pageHome() {
  const heroArt = `<svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="আদালতের ইলাস্ট্রেশন">
    <rect x="30" y="70" width="240" height="130" rx="10" fill="#ffffff" opacity=".14"/>
    <rect x="45" y="90" width="210" height="95" rx="6" fill="#ffffff" opacity=".92"/>
    <rect x="60" y="105" width="80" height="10" rx="5" fill="#0B6E4F" opacity=".8"/>
    <rect x="60" y="125" width="150" height="8" rx="4" fill="#C9C2B2"/>
    <rect x="60" y="140" width="150" height="8" rx="4" fill="#C9C2B2"/>
    <rect x="60" y="155" width="100" height="8" rx="4" fill="#C9C2B2"/>
    <circle cx="225" cy="128" r="22" fill="#E9B44C"/>
    <path d="M225 112v32M218 118l14-6M218 138l14 6" stroke="#7A5A1E" stroke-width="4" stroke-linecap="round"/>
    <rect x="128" y="30" width="44" height="44" rx="8" fill="#E9B44C"/>
    <path d="M150 36v36M136 46l28-12M136 62l28 12" stroke="#5A4310" stroke-width="4" stroke-linecap="round"/>
  </svg>`;

  app.innerHTML = `
  <section class="hero">
    <div class="container hero-inner">
      <div>
        <span class="section-eyebrow" style="background:rgba(255,255,255,.18);color:#fff">${t('heroBadge')}</span>
        <h1>${t('heroTitle')}</h1>
        <p class="lead">${t('heroBody')}</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#/apply">${t('ctaApply')} →</a>
          <a class="btn btn-outline" href="#/track">${t('ctaTrack')}</a>
        </div>
      </div>
      <div class="hero-art">${heroArt}</div>
    </div>
    <div class="container stat-strip">
      <div class="stat"><b>${bnNum('৬৯')}</b><span>জেলা ও বিশেষ অফিস</span></div>
      <div class="stat"><b>${bnNum('৩০০')}</b><span>ইউনিয়নে UDC সহায়তা</span></div>
      <div class="stat"><b>${bnNum('৮')}</b><span>পাইলট জেলা (মধ্যস্থতা)</span></div>
      <div class="stat"><b>${bnNum('৬৫০ক+')}</b><span>সেবাপ্রার্থী</span></div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head"><h2>${t('helpCardsTitle')}</h2></div>
      <div class="help-cards">
        <a class="help-card" href="#/guide">
          <div class="hc-art">🧭</div>
          <h3>${t('hc1Title')}</h3>
          <p>${t('hc1Body')}</p>
          <span class="hc-link">${t('hc1Link')} →</span><div class="hc-line"></div>
        </a>
        <a class="help-card" href="#/topics">
          <div class="hc-art">📚</div>
          <h3>${t('hc2Title')}</h3>
          <p>${t('hc2Body')}</p>
          <span class="hc-link">${t('hc2Link')} →</span><div class="hc-line"></div>
        </a>
        <a class="help-card" href="#/search">
          <div class="hc-art">🔍</div>
          <h3>${t('hc3Title')}</h3>
          <p>${t('hc3Body')}</p>
          <span class="hc-link">${t('hc3Link')} →</span><div class="hc-line"></div>
        </a>
      </div>
    </div>
  </section>

  <section class="section" style="background:var(--surface-2)">
    <div class="container">
      <div class="section-head"><h2>${t('libraryTitle')}</h2><p>${t('libraryBody')}</p></div>
      <div class="topic-grid" id="homeTopics"></div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head"><h2>⚡ সকল সেবা ও টুল</h2><p>এক ক্লিকেই যা যা দরকার — আবেদন, ট্র্যাকিং, কল, অভিযোগ এবং প্রোভাইডার কনসোল (রুলবুক ডেমো A1–A5)।</p></div>
      <div class="quick-tiles">
        ${[
          ['#/apply', '📝', 'নতুন আবেদন', '৬ ধাপে ফ্রি আইনি সহায়তার আবেদন'],
          ['#/track', '📦', 'আবেদন ট্র্যাক', 'আইডি + শেষ ৪ ডিজিট দিয়ে স্টেটাস'],
          ['#/guide', '🧭', 'গাইড উইজার্ড', '৩ প্রশ্নে আপনার পরবর্তী পদক্ষেপ'],
          ['#/search', '🔍', 'খুঁজুন', 'আর্টিকেল, ফরম ও অফিস সার্চ'],
          ['#/offices', '🗺️', 'অফিস খুঁজুন', '৬৪ জেলা + বিশেষ অফিস, ম্যাপসহ'],
          ['#/call', '📞', 'ফোন/IVR ডেমো', '১৬৬৯৯ কল সিমুলেটর + ইউএসএসডি'],
          ['#/complaint', '📣', 'অভিযোগ', 'ফি/হয়রানির অভিযোগ জানান'],
          ['#/help', '🤝', 'সহায়তা চ্যানেল', 'কল · UDC · ইউএসএসডি · AI চ্যাট'],
          ['#/dashboard', '👤', 'আমার অ্যাকাউন্ট', 'লগইন করে আবেদন তালিকা দেখুন'],
          ['#/console', '🛠️', 'প্রোভাইডার কনসোল', 'রুলবুক ডেমো B1–B7, T1–T11'],
          ['#/console?persona=A1', '🧑‍🤝‍🧑', 'A1 ময়ূরী — সেফ-কন্টাক্ট', 'রুলবুক সিনারিও সরাসরি লোড'],
          ['#/console?persona=A2', '🤝', 'A2 রিপন — প্রতিনিধি', 'প্রতিবন্ধী বোনের হয়ে আবেদন'],
          ['#/console?persona=A3', '🔒', 'A3 নাবিলা — স্পর্শকাতর', 'সীমিত অ্যাক্সেস রেকর্ড টেস্ট'],
          ['#/console?persona=A4', '🏢', 'A4 নুচিং — UDC', 'অ্যাসিস্টেড ইনটেক + অফলাইন'],
          ['#/console?persona=A5', '⏳', 'A5 মালেক — দীর্ঘস্থায়ী', 'আইনজীবী-ওভারডিউ + heads-up']
        ].map(([href, ic, ti, dsc]) => `
          <a class="quick-tile" href="${href}">
            <span class="qt-icon">${ic}</span>
            <span class="qt-body"><strong>${ti}</strong><small>${dsc}</small></span>
          </a>`).join('')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head"><h2>${t('officesTitle')}</h2><p>${t('officesBody')}</p></div>
      <div class="office-finder">
        <div>
          <div class="search-bar" style="margin:0 0 .9rem">
            <input id="offQ" placeholder="${t('officesSearchPh')}">
          </div>
          <div class="office-list" id="homeOffices"></div>
        </div>
        <div id="map" style="min-height:420px"></div>
      </div>
    </div>
  </section>

  <section class="section" style="background:var(--surface-2)">
    <div class="container">
      <div class="section-head"><h2>${t('newsTitle')}</h2></div>
      <div class="news-grid" id="homeNews"></div>
      <p style="text-align:center;margin-top:1.4rem"><a class="btn btn-outline" href="#/news">${t('newsAll')} →</a></p>
    </div>
  </section>

  <section class="section" style="text-align:center">
    <div class="container" id="moreHelp"></div>
  </section>`;

  initOfficeMap();

  // টপিক
  $('#homeTopics').innerHTML = BOOT.categories.slice(0, 6).map((c) => `
    <a class="topic-card" href="#/topic/${c.id}">
      <span class="topic-icon">${c.icon}</span>
      <span><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p></span>
    </a>`).join('') + `<a class="topic-card" href="#/topics" style="justify-content:center;align-items:center;color:var(--brand);font-weight:700">সব টপিক দেখুন →</a>`;

  // অফিস
  const renderOffices = (q) => {
    const list = BOOT.offices.filter((o) => !q || (o.name + o.district).toLowerCase().includes(q.toLowerCase()));
    $('#homeOffices').innerHTML = list.slice(0, 8).map((o) => officeCard(o)).join('') ||
      `<div class="empty-state">কোনো অফিস মেলেনি</div>`;
  };
  renderOffices('');
  $('#offQ').oninput = (e) => renderOffices(e.target.value);

  // নিউজ
  $('#homeNews').innerHTML = BOOT.news.slice(0, 6).map(newsCard).join('');

  // MLH-স্টাইল "আরও সাহায্য" ব্যান্ড
  $('#moreHelp').innerHTML = `
    <h2>${t('moreHelpTitle')}</h2>
    <p style="color:var(--muted);max-width:44rem;margin:.5rem auto 0">${t('moreHelpBody')}</p>
    <a class="btn btn-primary" href="#/guide" style="margin-top:1.1rem">${t('getStarted')} →</a>`;
}

function officeCard(o) {
  return `<div class="office-card" data-office="${o.id}" onclick="focusOffice('${o.id}')">
    <h3>${esc(o.name)}</h3>
    <p>${esc(o.address)}</p>
    <p>🕘 ${esc(o.hours)}</p>
    <a class="office-phone" href="tel:${esc(o.phone)}">📞 ${esc(o.phone)}</a>
  </div>`;
}

function focusOffice(id) {
  const o = BOOT.offices.find((x) => x.id === id);
  if (!o) return;
  highlightCard(id);
  if (mapObj && o._marker) {
    mapObj.setView([o.lat, o.lng], 13);
    o._marker.openPopup();
  }
}
window.focusOffice = focusOffice;

function newsCard(n) {
  return `<a class="news-card" href="#/news/${n.id}">
    <div class="news-img"><img src="${esc(n.img)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentElement.style.fontSize='3rem';this.parentElement.innerHTML='📰'"></div>
    <div class="news-body">
      <span class="news-badge ${n.type}">${n.type === 'event' ? t('event') : t('news')}</span>
      <h3>${esc(n.title)}</h3>
      <div class="news-date">${t('posted')}: ${esc(n.date)}</div>
    </div>
  </a>`;
}

// ---------- টপিক পেজ ----------
async function pageTopics() {
  app.innerHTML = `
  <div class="container page-head">
    <h1>${t('libraryTitle')}</h1><p>${t('libraryBody')}</p>
    <div class="search-bar" style="margin-top:1rem;max-width:100%">
      <input id="topicQ" placeholder="${t('searchPh')}">
    </div>
  </div>
  <div class="container"><div class="topic-grid" id="topicGrid"></div></div>`;
  const render = (q = '') => {
    const cats = BOOT.categories.filter((c) => !q || (c.title + c.desc).toLowerCase().includes(q.toLowerCase()));
    $('#topicGrid').innerHTML = cats.map((c) => {
      const count = (BOOT.articles || []).filter((a) => a.topic === c.id).length;
      return `<a class="topic-card" href="#/topic/${c.id}">
        <span class="topic-icon">${c.icon}</span>
        <span><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p>
        <small style="color:var(--brand)">${bnNum(count)}টি আর্টিকেল</small></span>
      </a>`;
    }).join('') || `<div class="empty-state">${t('noResults')}</div>`;
  };
  render();
  $('#topicQ').oninput = (e) => render(e.target.value);
}

async function pageTopic(id) {
  const cat = BOOT.categories.find((c) => c.id === id);
  if (!cat) return pageTopics();
  const sections = BOOT.sections[id] || [];
  const countAll = (list) => list.reduce((n, s) => n + (s.children ? countAll(s.children) : 1), 0);
  app.innerHTML = `
  <div class="container page-head">
    <div class="breadcrumb"><a href="#/topics">${t('navLibrary')}</a> / ${esc(cat.title)}</div>
    <h1><span class="topic-icon" style="display:inline-flex;vertical-align:middle;margin-right:.5rem">${cat.icon}</span>${esc(cat.title)}</h1>
    <p>${esc(cat.desc)}</p>
  </div>
  <div class="container">
    <div class="topic-grid">
      ${sections.map((s) => `
        <a class="topic-card" href="${s.kind === 'form' ? '#/form/' + s.formId : '#/section/' + s.id}">
          <span class="topic-icon">${s.icon || (s.kind === 'form' ? '📄' : '📖')}</span>
          <span><h3>${esc(s.title)}</h3>
          ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
          <small style="color:var(--brand)">${s.kind === 'form' ? t('formBadge') : s.children ? bnNum(countAll(s.children)) + 'টি আইটেম' : t('readArt')}</small></span>
        </a>`).join('')}
    </div>
    <div class="quick-ans" style="margin-top:1.6rem">
      <strong>${t('needMoreHelp')}</strong>
      <p style="color:var(--muted);margin:.3rem 0 .7rem">${t('moreHelpBody')}</p>
      <a class="btn btn-primary btn-sm" href="#/guide">${t('useGuide')} →</a>
    </div>
  </div>`;
}

// সেকশন (folder) পেজ — সাব-সাব-আইটেম
async function pageSection(id) {
  // সব টপিকের সেকশনগুলোতে খুঁজি
  let section = null, parentCat = null;
  for (const [catId, secs] of Object.entries(BOOT.sections)) {
    const hit = secs.find((s) => s.id === id);
    if (hit) { section = hit; parentCat = BOOT.categories.find((c) => c.id === catId); break; }
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
  </div>
  <div class="container"><div class="art-grid art-grid-2">
    ${(section.children || []).map((ch) => {
      if (ch.kind === 'form') {
        return `<a class="art-card" href="#/form/${ch.formId}">
          <span class="art-form-badge">${t('formBadge')}</span>
          <h3>${esc(ch.title)}</h3>
          <p>${t('fillForm')} →</p>
        </a>`;
      }
      const a = BOOT.articles.find((x) => x.id === ch.id);
      return `<a class="art-card" href="#/article/${ch.id}">
        <h3>${esc(ch.title)}</h3>
        <p>${a ? esc(a.summary) : ''}</p>
        ${a ? `<div class="art-meta"><span>⏱ ${esc(a.read)}</span></div>` : ''}
      </a>`;
    }).join('')}
  </div></div>`;
}

// ---------- ফরম পেজ (input → generated output) ----------
async function pageForm(id) {
  const f = await apiGet('form', { id });
  if (!f || f.error) return pageTopics();
  app.innerHTML = `
  <div class="container page-head">
    <div class="breadcrumb"><a href="#/topics">${t('navLibrary')}</a> / ${esc(f.title)}</div>
    <h1>📄 ${esc(f.title)}</h1>
    ${f.law ? `<p>📜 আইন: ${esc(f.law)}</p>` : ''}
  </div>
  <div class="container"><div class="form-card">
    <div class="form-grid" id="formFields">
      ${f.fields.map((fd) => `
        <div class="field ${fd.type === 'textarea' ? 'full' : ''}">
          <label>${esc(fd.label)} ${fd.req ? '<span class="req">*</span>' : ''}</label>
          ${fd.type === 'textarea'
            ? `<textarea id="ff_${fd.id}"></textarea>`
            : fd.type === 'select'
              ? `<select id="ff_${fd.id}">${(fd.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select>`
              : `<input id="ff_${fd.id}" type="${fd.type === 'number' ? 'number' : fd.type === 'date' ? 'date' : 'text'}">`}
        </div>`).join('')}
    </div>
    <div id="formErr" class="form-error hidden"></div>
    <button class="btn btn-primary btn-block" id="fGen" style="margin-top:1.2rem">${t('generate')}</button>
    <div id="formOut"></div>
  </div></div>`;
  $('#fGen').onclick = () => {
    const missing = [];
    const vals = {};
    for (const fd of f.fields) {
      const v = $('#ff_' + fd.id)?.value.trim() || '';
      if (fd.req && !v) missing.push(fd.label);
      vals[fd.id] = v;
    }
    if (missing.length) {
      const e = $('#formErr');
      e.textContent = 'প্রয়োজনীয় ঘর পূরণ করুন: ' + missing.join(', ');
      e.classList.remove('hidden');
      return;
    }
    $('#formErr').classList.add('hidden');
    const today = new Date().toLocaleDateString('bn-BD');
    let out = `তারিখ: ${today}\n\n`;
    out += `বিষয়: ${f.title}\n`;
    if (f.law) out += `আইন: ${f.law}\n`;
    out += `\n${'—'.repeat(24)}\n\n`;
    for (const fd of f.fields) out += `${fd.label}: ${vals[fd.id] || '—'}\n`;
    out += `\n${'—'.repeat(24)}\n\n`;
    out += `আবেদনকারী/নোটিশদাতা\nস্বাক্ষর: ______________\n\n`;
    out += `(সংশ্লিষ্ট অফিসে জমা দেওয়ার আগে পড়ে নিন। এই নোটিশ/আবেদনটি সহায়তার জন্য তৈরি — আইনি পরামর্শ নয়।)`;
    $('#formOut').innerHTML = `
      <h2 style="margin-top:1.6rem">✅ আপনার ${t('formBadge')} তৈরি হয়েছে</h2>
      <div class="output-doc" id="outDoc">${esc(out)}</div>
      <div class="output-actions">
        <button class="btn btn-outline" id="outCopy">📋 ${t('printCopy')}</button>
        <a class="btn btn-primary" href="#/apply">${t('ctaApply')} →</a>
      </div>`;
    $('#outCopy').onclick = () => {
      navigator.clipboard.writeText($('#outDoc').textContent).then(() => toast(t('copied')));
    };
    $('#formOut').scrollIntoView({ behavior: 'smooth' });
  };
}

async function pageArticle(id) {
  const a = await apiGet('article', { id });
  if (!a || a.error) return pageTopics();
  const cat = BOOT.categories.find((c) => c.id === a.topic);
  const bodyHtml = (a.body || []).map((b) => {
    if (b.h) return `<h2>${esc(b.h)}</h2>`;
    if (b.p) return `<p>${esc(b.p)}</p>`;
    if (b.li) return `<ul>${b.li.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (b.warn) return `<div class="warn">⚠️ ${esc(b.warn)}</div>`;
    return '';
  }).join('');
  const related = BOOT.articles.filter((x) => x.topic === a.topic && x.id !== a.id).slice(0, 3);
  app.innerHTML = `
  <div class="container page-head article-wrap">
    <div class="breadcrumb"><a href="#/topics">${t('navLibrary')}</a> / <a href="#/topic/${esc(a.topic)}">${esc(cat?.title || '')}</a></div>
    <h1>${esc(a.title)}</h1>
    <div class="article-meta"><span>${t('updated')}: ${esc(a.updated)}</span><span>⏱ ${t('read')}: ${esc(a.read)}</span></div>
    <p><strong>${esc(a.summary)}</strong></p>
    ${bodyHtml}
    <div class="quick-ans">
      <strong>এই বিষয়ে সাহায্য দরকার?</strong>
      <p style="margin:.4rem 0 .8rem;color:var(--muted)">আবেদন করুন — যোগ্য হলে বিনামূল্যে আইনজীবী ও মধ্যস্থতা পাবেন।</p>
      <a class="btn btn-primary btn-sm" href="#/apply">${t('ctaApply')}</a>
      <a class="btn btn-outline btn-sm" href="tel:16699" style="margin-left:.5rem">📞 ১৬৬৯৯</a>
    </div>
    ${related.length ? `<h2 style="margin-top:2rem">${t('relatedArt')}</h2>
      <div class="art-grid" style="margin-top:1rem">${related.map((r) => `<a class="art-card" href="#/article/${r.id}"><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p></a>`).join('')}</div>` : ''}
  </div>`;
}

// ---------- গাইড উইজার্ড ----------
const guideState = { q: 1, topic: null, need: null, income: null };
async function pageGuide() {
  guideState.q = 1; guideState.topic = null; guideState.need = null; guideState.income = null;
  renderGuide();
}
function renderGuide() {
  const g = BOOT.guide;
  const key = 'q' + guideState.q;
  const step = g[key];
  if (step) {
    app.innerHTML = `
    <div class="container page-head"><h1>🧭 ${t('navGuide')}</h1><p>${t('guideLead')}</p></div>
    <div class="container"><div class="form-card">
      <div class="wizard-steps">
        ${[1, 2, 3].map((i) => `<div class="wstep ${i === guideState.q ? 'active' : i < guideState.q ? 'done' : ''}">${bnNum(i)}</div>`).join('')}
      </div>
      <h2 style="margin-bottom:1rem">${esc(step.title)}</h2>
      ${step.options.map((o, i) => `<button class="guide-option" data-i="${i}">${esc(o.label)}</button>`).join('')}
      <div class="wizard-actions">
        ${guideState.q > 1 ? `<button class="btn btn-ghost" id="gBack">← ${t('guideBack')}</button>` : '<span></span>'}
      </div>
    </div></div>`;
    $$('.guide-option').forEach((btn) => btn.onclick = () => {
      const o = step.options[+btn.dataset.i];
      if (o.topic) guideState.topic = o.topic;
      if (o.need) guideState.need = o.need;
      if (o.income != null) guideState.income = o.income;
      if (o.next) { guideState.q++; renderGuide(); }
      else renderGuideResult();
    });
    const back = $('#gBack');
    if (back) back.onclick = () => { guideState.q--; renderGuide(); };
    return;
  }
  renderGuideResult();
}
async function renderGuideResult() {
  const r = await apiPost('guide', guideState);
  app.innerHTML = `
  <div class="container page-head"><h1>🎯 ${t('guideResult')}</h1></div>
  <div class="container"><div class="form-card" style="max-width:760px">
    ${r.topic ? `<div class="section-eyebrow">${r.topic.icon} ${esc(r.topic.title)}</div>` : ''}
    ${r.eligibility ? `<div class="quick-ans"><strong>${esc(r.eligibility.title)}</strong><p style="color:var(--muted)">${esc(r.eligibility.sub)}</p></div>` : ''}
    <p style="margin:1rem 0">${esc(r.next)}</p>
    ${r.articles.length ? `<h3>${t('guideReadArt')}</h3>
      <div class="art-grid" style="margin-top:.8rem">${r.articles.map((a) => `<a class="art-card" href="#/article/${a.id}"><h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p></a>`).join('')}</div>` : ''}
    <div class="wizard-actions">
      <button class="btn btn-ghost" id="gRestart">↺ ${t('guideRestart')}</button>
      <a class="btn btn-primary" href="#/apply">${t('ctaApply')} →</a>
    </div>
  </div></div>`;
  $('#gRestart').onclick = () => pageGuide();
}

// ---------- আবেদন ফরম ----------
async function pageApply() {
  const districts = Object.values(BOOT.mediationDistricts && BOOT.divisions ? BOOT.divisions : []).flat();
  const allDistricts = [...new Set(BOOT.offices.map((o) => o.district))];
  const state = { step: 1, data: {} };
  render();

  function render() {
    const steps = ['সমস্যা', 'পরিচয়', 'যোগাযোগ', 'আর্থ-সামাজিক', 'বিরোধী পক্ষ', 'যাচাই ও জমা'];
    app.innerHTML = `
    <div class="container page-head"><h1>📝 ${t('applyTitle')}</h1><p>${t('applyLead')}</p></div>
    <div class="container"><div class="form-card" style="max-width:720px">
      <div class="wizard-steps">${steps.map((s, i) => `<div class="wstep ${i + 1 === state.step ? 'active' : i + 1 < state.step ? 'done' : ''}">${bnNum(i + 1)}. ${s}</div>`).join('')}</div>
      <div id="stepBody"></div>
      <div class="wizard-actions">
        <button class="btn btn-ghost" id="aPrev" ${state.step === 1 ? 'style="visibility:hidden"' : ''}>← ${t('guideBack')}</button>
        <button class="btn btn-primary" id="aNext">${state.step === 6 ? '✓ জমা দিন' : t('guideNext') + ' →'}</button>
      </div>
    </div></div>`;
    renderStep();
    $('#aPrev').onclick = () => { if (state.step > 1) { state.step--; render(); } };
    $('#aNext').onclick = () => {
      if (!collect()) return;
      if (state.step < 6) { state.step++; render(); }
      else submit();
    };
  }

  function stepHtml(inner) { $('#stepBody').innerHTML = inner; }

  function renderStep() {
    const d = state.data;
    if (state.step === 1) {
      stepHtml(`
        <div class="field"><label>${'আপনার সমস্যা কোন ধরনের?'} <span class="req">*</span></label>
          <select id="f_caseType">${BOOT.caseTypes.map((c) => `<option value="${c.id}" ${d.caseType === c.id ? 'selected' : ''}>${esc(c.label)} — ${esc(c.desc)}</option>`).join('')}</select></div>
        <div class="field" style="margin-top:.9rem"><label>${'আপনার উদ্দেশ্য'}</label>
          <select id="f_purpose">
            <option value="new" ${d.purpose === 'new' ? 'selected' : ''}>নতুন মামলা/সমস্যা নিষ্পত্তি</option>
            <option value="mediation" ${d.purpose === 'mediation' ? 'selected' : ''}>মধ্যস্থতায় নিষ্পত্তি চাই</option>
            <option value="lawyer" ${d.purpose === 'lawyer' ? 'selected' : ''}>আইনজীবী ও আদালত সহায়তা</option>
            <option value="change-lawyer" ${d.purpose === 'change-lawyer' ? 'selected' : ''}>আইনজীবী পরিবর্তনের অনুরোধ (চলমান মামলায়)</option>
            <option value="advice" ${d.purpose === 'advice' ? 'selected' : ''}>শুধু পরামর্শ</option>
          </select></div>
        <div class="field" style="margin-top:.9rem"><label>${'জেলা'} <span class="req">*</span></label>
          <select id="f_district">${allDistricts.map((x) => `<option ${d.district === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="field" style="margin-top:.9rem"><label>${'সমস্যার বিবরণ'} <span class="req">*</span></label>
          <textarea id="f_problem" placeholder="কী ঘটেছে, কবে থেকে, প্রতিপক্ষ কে — সংক্ষেপে লিখুন">${esc(d.problem || '')}</textarea></div>
        <label class="check-line" style="margin-top:.8rem"><input type="checkbox" id="f_emergency" ${d.emergency ? 'checked' : ''}> জরুরি আইনগত সহায়তা প্রয়োজন</label>
        <label class="check-line"><input type="checkbox" id="f_sensitive" ${d.sensitive ? 'checked' : ''}> এটি স্পর্শকাতর অভিযোগ (নির্যাতন/নিরাপত্তা ঝুঁকি) — সীমিত অ্যাক্সেসে রাখুন</label>`);
    } else if (state.step === 2) {
      stepHtml(`
        <div class="field"><label>${t('name')} <span class="req">*</span></label><input id="f_name" value="${esc(d.name || '')}"></div>
        <div class="form-grid" style="margin-top:.9rem">
          <div class="field"><label>${'লিঙ্গ'}</label><select id="f_gender"><option>পুরুষ</option><option>মহিলা</option><option>অন্য</option></select></div>
          <div class="field"><label>${'বয়স'}</label><input id="f_age" type="number" min="0" value="${esc(d.age || '')}"></div>
        </div>
        <div class="field" style="margin-top:.9rem"><label>${t('nid')}</label><input id="f_nid" value="${esc(d.nid || '')}" placeholder="১০/১৩/১৭ ডিজিট"></div>`);
    } else if (state.step === 3) {
      stepHtml(`
        <div class="field"><label>${t('phone')} <span class="req">*</span></label><input id="f_phone" value="${esc(d.phone || '')}" placeholder="${t('phonePh')}"><div class="hint">এই নম্বরেই আপডেট এসএমএস যাবে</div></div>
        <div class="field" style="margin-top:.9rem"><label>${t('email')}</label><input id="f_email" value="${esc(d.email || '')}"></div>
        <div class="field" style="margin-top:.9rem"><label>${'বর্তমান ঠিকানা'}</label><textarea id="f_addr" style="min-height:70px">${esc(d.addr || '')}</textarea></div>
        <div class="quick-ans" style="margin-top:1rem">
          <strong>📵 নিরাপদ যোগাযোগ (A1)</strong> — আপনার ফোন অন্য কেউ নিয়ন্ত্রণ করলে এখানে লিখুন; অফিস শুধু নিরাপদ নম্বরে, নিরপেক্ষ ভাষায় কথা বলবে।
        </div>
        <div class="form-grid" style="margin-top:.9rem">
          <div class="field"><label>নিরাপদ নম্বর (না দিলে উপরের ফোনই ধরা হবে)</label><input id="f_safe" value="${esc(d.safeNumber || '')}" placeholder="01XXXXXXXXX"></div>
          <div class="field"><label>যোগাযোগের নিরাপদ সময়</label><input id="f_window" value="${esc(d.window || '')}" placeholder="যেমন: সকাল ১১টা–দুপুর ১টা"></div>
        </div>
        <div class="field" style="margin-top:.9rem"><label>যে নম্বরে কল করা যাবে না (কমা দিয়ে আলাদা করুন)</label><input id="f_unsafe" value="${esc(d.unsafeNumbers || '')}" placeholder="018XXXXXXXX, 019XXXXXXXX"><div class="hint">এই নম্বরে রিং গেলে কল বিলম্বিত হবে ও লগ হবে — কারণসহ রেকর্ডে থাকবে</div></div>`);
    } else if (state.step === 4) {
      stepHtml(`
        <div class="form-grid">
          <div class="field"><label>${'পেশা'}</label><input id="f_occ" value="${esc(d.occ || '')}"></div>
          <div class="field"><label>${'মাসিক আয় (টাকা)'}</label><input id="f_income" type="number" min="0" value="${esc(d.income || '')}"></div>
        </div>
        <div class="field" style="margin-top:.9rem"><label>${'নির্ভরশীল সদস্য সংখ্যা'}</label><input id="f_deps" type="number" min="0" value="${esc(d.deps || '')}"></div>
        <div class="quick-ans" style="margin-top:1rem">
          <strong>যোগ্যতার সাধারণ সীমা:</strong> বার্ষিক আয় ১,৮০,০০০ টাকার নিচে হলে সাধারণত যোগ্য। নারী-শিশু, প্রতিবন্ধী, মুক্তিযোদ্ধা, বন্দী ও পাচার-এসিড নির্যাতনের শিকার সবসময় যোগ্য।
        </div>`);
    } else if (state.step === 5) {
      stepHtml(`
        <div class="field"><label>${'প্রতিপক্ষের নাম'}</label><input id="f_oppName" value="${esc(d.oppName || '')}"></div>
        <div class="form-grid" style="margin-top:.9rem">
          <div class="field"><label>${'প্রতিপক্ষের ধরন'}</label><select id="f_oppType">
            <option>ব্যক্তি</option><option>প্রতিষ্ঠান/কোম্পানি</option><option>সরকারি অফিস</option><option>অজানা</option>
          </select></div>
          <div class="field"><label>${'প্রতিপক্ষের ফোন (জানলে)'}</label><input id="f_oppPhone" value="${esc(d.oppPhone || '')}"></div>
        </div>
        <div class="quick-ans" style="margin-top:1rem"><strong>নোট:</strong> প্রতিপক্ষের তথ্য আপনার তথ্যের মতো সুরক্ষিত থাকবে এবং প্রতিপক্ষকে কখনো আপনার আবেদনের বিবরণ দেখানো হবে না।</div>`);
    } else {
      const d2 = state.data;
      stepHtml(`
        <h3>আপনার আবেদন যাচাই করুন</h3>
        <div class="quick-ans" style="margin-top:.8rem">
          <p><strong>ধরন:</strong> ${esc(BOOT.caseTypes.find((c) => c.id === d2.caseType)?.label || '')}</p>
          <p><strong>নাম:</strong> ${esc(d2.name || '—')} · <strong>ফোন:</strong> ${esc(d2.phone || '—')}</p>
          <p><strong>জেলা:</strong> ${esc(d2.district || '—')} · <strong>জরুরি:</strong> ${d2.emergency ? 'হ্যাঁ' : 'না'} · <strong>স্পর্শকাতর:</strong> ${d2.sensitive ? 'হ্যাঁ' : 'না'}</p>
        </div>
        <div class="quick-ans" style="margin-top:.8rem;border-color:var(--brand)"><strong>🆓 ফ্রি-সার্ভিস নোটিশ (B4):</strong> এই সেবা সম্পূর্ণ বিনামূল্যে — আবেদন ফি, আইনজীবীর ফি বা আদালত ফি কিছুই দিতে হবে না। কেউ টাকা চাইলে ১৬৬৯৯-এ জানান।</div>
        <label class="check-line" style="margin-top:1rem"><input type="checkbox" id="f_true"> আমি নিশ্চিত করছি উপরের সব তথ্য সঠিক</label>
        <div class="quick-ans" style="margin-top:1rem"><strong>আপনার তথ্য কীভাবে ব্যবহৃত হয়:</strong> শুধুমাত্র আপনার কেস সামলানো কর্মকর্তা দেখবেন; প্রতিপক্ষ কখনো নয়। নির্যাতন-সংক্রান্ত কেস "স্পর্শকাতর" হিসেবে আলাদা রাখা হয়।</div>
        <div id="applyErr" class="form-error hidden"></div>`);
    }
  }

  function collect() {
    const d = state.data;
    if (state.step === 1) {
      d.caseType = $('#f_caseType').value; d.purpose = $('#f_purpose').value;
      d.district = $('#f_district').value; d.problem = $('#f_problem').value.trim();
      d.emergency = $('#f_emergency').checked; d.sensitive = $('#f_sensitive').checked;
      if (!d.problem) { toast('সমস্যার বিবরণ লিখুন'); return false; }
    } else if (state.step === 2) {
      d.name = $('#f_name').value.trim(); d.gender = $('#f_gender').value; d.age = $('#f_age').value; d.nid = $('#f_nid').value.trim();
      if (!d.name) { toast('নাম লিখুন'); return false; }
    } else if (state.step === 3) {
      d.phone = $('#f_phone').value.trim(); d.email = $('#f_email').value.trim(); d.addr = $('#f_addr').value.trim();
      d.safeNumber = $('#f_safe').value.trim(); d.window = $('#f_window').value.trim(); d.unsafeNumbers = $('#f_unsafe').value.trim();
      if (!/^01\d{9}$/.test(d.phone)) { toast('সঠিক ১১ ডিজিটের ফোন নম্বর দিন (01XXXXXXXXX)'); return false; }
    } else if (state.step === 4) {
      d.occ = $('#f_occ').value.trim(); d.income = $('#f_income').value; d.deps = $('#f_deps').value;
    } else if (state.step === 5) {
      d.oppName = $('#f_oppName').value.trim(); d.oppType = $('#f_oppType').value; d.oppPhone = $('#f_oppPhone').value.trim();
    } else {
      if (!$('#f_true').checked) { toast('তথ্য সঠিক বলে নিশ্চিত করুন'); return false; }
    }
    return true;
  }

  async function submit() {
    const d = state.data;
    // B4: UDC রোলে লগইন থাকলে সহায়তাকারী রেকর্ড হয়
    if (ME && ME.role === 'udc') d.assistedBy = ME.name || 'UDC উদ্যোক্তা';
    // A1: সেফ-কন্টাক্ট স্ট্রাকচার
    if (d.safeNumber || d.unsafeNumbers || d.window) d.safeContact = { safeNumber: d.safeNumber, unsafeNumbers: (d.unsafeNumbers || '').split(',').map((s) => s.trim()).filter(Boolean), window: d.window };
    // A2: প্রতিনিধি (আবেদনকারীর বদলে অন্য কেউ জমা দিলে)
    if (d.repName) d.representation = { repName: d.repName, repPhone: d.repPhone, relation: d.repRelation, scope: 'intake-only' };
    const r = await apiPost('applications', d);
    if (!r.ok) { toast(r.error || t('errGeneric')); return; }
    app.innerHTML = `
    <div class="container page-head"><h1>✅ আপনার আবেদন জমা হয়েছে</h1></div>
    <div class="container"><div class="form-card" style="text-align:center">
      <p style="color:var(--muted)">${t('appId')}</p>
      <div style="font-size:1.7rem;font-weight:800;font-family:ui-monospace,monospace;color:var(--brand);margin:.4rem 0 1rem">${esc(r.appId)}</div>
      ${r.freeServiceNotice ? `<div class="quick-ans" style="text-align:left">🆓 ${esc(r.freeServiceNotice)}</div>` : ''}
      <div class="form-success" style="text-align:left;margin-top:.8rem">
        <strong>এরপর কী হবে?</strong>
        <ul style="margin:.6rem 0 0 1.2rem">${(r.nextSteps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      </div>
      <div class="wizard-actions">
        <a class="btn btn-outline" href="#/track">${t('ctaTrack')}</a>
        <a class="btn btn-primary" href="#/">হোমে যান</a>
      </div>
    </div></div>`;
  }
}

// ---------- ট্র্যাক পেজ ----------
async function pageTrack() {
  app.innerHTML = `
  <div class="container page-head"><h1>📦 ${t('trackTitle')}</h1><p>${t('trackLead')}</p></div>
  <div class="container"><div class="form-card">
    <div id="trackErr" class="form-error hidden"></div>
    <div class="field"><label>${t('appId')} <span class="req">*</span></label>
      <input id="t_id" placeholder="DLAS-NET-2026-04417"><div class="hint">${t('appIdHint')}</div></div>
    <div class="field" style="margin-top:.9rem"><label>${t('last4')} <span class="req">*</span></label>
      <input id="t_last4" maxlength="4" inputmode="numeric" placeholder="****"></div>
    <div class="wizard-actions">
      <button class="btn btn-ghost" id="t_clear">${t('clear')}</button>
      <button class="btn btn-primary" id="t_go">${t('lookup')}</button>
    </div>
    <div id="trackResult"></div>
  </div></div>`;
  $('#t_clear').onclick = () => { $('#t_id').value = ''; $('#t_last4').value = ''; $('#trackResult').innerHTML = ''; $('#trackErr').classList.add('hidden'); };
  $('#t_go').onclick = async () => {
    const err = $('#trackErr');
    err.classList.add('hidden');
    const r = await apiPost('track', { appId: $('#t_id').value, last4: $('#t_last4').value });
    if (r.error) { err.textContent = r.error; err.classList.remove('hidden'); return; }
    $('#trackResult').innerHTML = `
      <div class="quick-ans" style="margin-top:1.4rem">
        <strong>${t('currentStage')}: ${esc(r.stageLabel)}</strong>
        ${r.nextStep ? `<div style="margin-top:.3rem">🎯 <strong>পরবর্তী পদক্ষেপ:</strong> ${esc(r.nextStep)}</div>` : ''}
        ${r.emergency ? '<div><span class="badge warn">জরুরি আবেদন</span></div>' : ''}
      </div>
      ${(r.headsUp && r.headsUp.length) ? `<div class="quick-ans" style="margin-top:.8rem;border-color:var(--accent)">
        <strong>🔔 জরুরি তথ্য (যাত্রার আগে দেখুন):</strong>
        <ul style="margin:.4rem 0 0 1.2rem">${r.headsUp.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      </div>` : ''}
      <ul class="timeline">
        ${r.stages.map((s, i) => `<li class="${s.done ? 'done' : ''} ${s.current ? 'current' : ''}">
          <div class="tl-dot">${s.done ? '✓' : bnNum(i + 1)}</div>
          <div class="tl-body"><strong>${esc(s.label)}</strong>${s.current ? `<span>${t('currentStage')}</span>` : ''}</div>
        </li>`).join('')}
      </ul>
      <p style="color:var(--muted);font-size:.88rem">${esc(r.note)}</p>`;
  };
}

// ---------- অফিস পেজ (Leaflet ম্যাপ) ----------
async function pageOffices() {
  app.innerHTML = `
  <div class="container page-head"><h1>🏢 ${t('officesTitle')}</h1><p>${t('officesBody')} ${t('mapHint')}</p></div>
  <div class="container">
    <div class="office-finder">
      <div>
        <div class="filter-row">
          <input id="offQ2" placeholder="${t('officesSearchPh')}" style="flex:1">
          <select id="offDiv"><option value="">সব বিভাগ</option>${BOOT.divisions.map((d) => `<option>${esc(d)}</option>`).join('')}</select>
        </div>
        <p id="offCount" style="color:var(--muted);margin-bottom:.7rem;font-size:.85rem"></p>
        <div class="office-list" id="offGrid"></div>
      </div>
      <div id="map"></div>
    </div>
  </div>`;
  const render = () => {
    const q = $('#offQ2').value.trim().toLowerCase();
    const div = $('#offDiv').value;
    const list = BOOT.offices.filter((o) => (!q || (o.name + o.district + o.address).toLowerCase().includes(q)) && (!div || o.division === div));
    $('#offCount').textContent = t('officesCount').replace('{n}', bnNum(list.length));
    $('#offGrid').innerHTML = list.map(officeCard).join('') || `<div class="empty-state">${t('noResults')}</div>`;
  };
  render();
  $('#offQ2').oninput = render;
  $('#offDiv').onchange = render;
  initOfficeMap();
}

// ---------- নিউজ পেজ ----------
async function pageNews() {
  app.innerHTML = `
  <div class="container page-head"><h1>📰 ${t('newsTitle')}</h1></div>
  <div class="container"><div class="news-grid">${BOOT.news.map(newsCard).join('')}</div></div>`;
}

// নিউজ ডিটেইল — কেস বিবরণসহ
async function pageNewsDetail(id) {
  const n = await apiGet('newsitem', { id });
  if (!n || n.error) return pageNews();
  app.innerHTML = `
  <div class="container page-head article-wrap">
    <div class="breadcrumb"><a href="#/news">${t('backToNews')}</a></div>
    <span class="news-badge ${n.type}">${n.type === 'event' ? t('event') : t('news')}</span>
    <h1 style="margin-top:.5rem">${esc(n.title)}</h1>
    <div class="article-meta"><span>${t('posted')}: ${esc(n.date)}</span></div>
    <img class="news-detail-img" src="${esc(n.img)}" alt="" onerror="this.style.display='none'">
    <p style="font-size:1.05rem">${esc(n.body)}</p>
    ${(n.cases || []).length ? `<h2 style="margin-top:1.6rem">${t('caseDetail')}</h2>
      ${n.cases.map((c) => `<div class="case-block"><h3>${esc(c.t)}</h3><p>${esc(c.d)}</p></div>`).join('')}` : ''}
    <div class="quick-ans">
      <strong>${t('needMoreHelp')}</strong>
      <p style="color:var(--muted);margin:.3rem 0 .7rem">${t('moreHelpBody')}</p>
      <a class="btn btn-primary btn-sm" href="#/apply">${t('ctaApply')}</a>
      <a class="btn btn-outline btn-sm" href="tel:16699" style="margin-left:.4rem">📞 ${t('callNow')}</a>
    </div>
  </div>`;
}

// ---------- সার্চ ----------
async function pageSearch() {
  app.innerHTML = `
  <div class="container page-head"><h1>🔍 ${t('searchTitle')}</h1></div>
  <div class="container">
    <div class="search-bar"><input id="sq" placeholder="${t('searchPh')}"><button class="btn btn-primary" id="sgo">${t('searchBtn')}</button></div>
    <div id="sres" style="margin-top:1.6rem"></div>
  </div>`;
  const doSearch = () => {
    const q = $('#sq').value.trim().toLowerCase();
    const box = $('#sres');
    if (!q) { box.innerHTML = ''; return; }
    const arts = BOOT.articles.filter((a) => (a.title + a.summary).toLowerCase().includes(q));
    const cats = BOOT.categories.filter((c) => (c.title + c.desc).toLowerCase().includes(q));
    const offs = BOOT.offices.filter((o) => (o.name + o.district).toLowerCase().includes(q));
    box.innerHTML = `
      ${cats.length ? `<h2>${t('navLibrary')}</h2><div class="topic-grid" style="margin:.8rem 0 1.4rem">${cats.map((c) => `<a class="topic-card" href="#/topic/${c.id}"><span class="topic-icon">${c.icon}</span><span><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p></span></a>`).join('')}</div>` : ''}
      ${arts.length ? `<h2>${t('navLibrary')} — আর্টিকেল</h2><div class="art-grid" style="margin:.8rem 0 1.4rem">${arts.map((a) => `<a class="art-card" href="#/article/${a.id}"><h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p></a>`).join('')}</div>` : ''}
      ${offs.length ? `<h2>${t('navOffices')}</h2><div class="art-grid" style="margin:.8rem 0">${offs.slice(0, 6).map(officeCard).join('')}</div>` : ''}
      ${!cats.length && !arts.length && !offs.length ? `<div class="empty-state">${t('noResults')}</div>` : ''}`;
  };
  $('#sgo').onclick = doSearch;
  $('#sq').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
}

// ---------- সহায়তা ----------
async function pageHelp() {
  app.innerHTML = `
  <div class="container page-head"><h1>🤝 ${t('helpTitle')}</h1><p>${t('helpLead')}</p></div>
  <div class="container"><div class="help-cards" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    <a class="help-card" href="#/help/call"><div class="hc-art">📞</div><h3>${t('hCallT')}</h3><p>${t('hCallB')}</p><span class="btn btn-primary btn-sm">বিস্তারিত দেখুন →</span></a>
    <a class="help-card" href="#/help/udc"><div class="hc-art">🏢</div><h3>${t('hUdcT')}</h3><p>${t('hUdcB')}</p><span class="btn btn-outline btn-sm">বিস্তারিত দেখুন →</span></a>
    <a class="help-card" href="#/help/ussd"><div class="hc-art">#️⃣</div><h3>${t('hUssdT')}</h3><p>${t('hUssdB')}</p><span class="btn btn-outline btn-sm">বিস্তারিত দেখুন →</span></a>
    <a class="help-card" href="#/help/ai"><div class="hc-art">🤖</div><h3>${t('hAiT')}</h3><p>${t('hAiB')}</p><span class="btn btn-outline btn-sm">বিস্তারিত দেখুন →</span></a>
  </div></div>
  <div class="container section">
    <div class="form-card" style="max-width:none">
      <h2>${t('channelChoice')}</h2>
      <ul style="margin:.7rem 0 0 1.2rem;display:flex;flex-direction:column;gap:.4rem;color:var(--muted)">
        <li>${t('chanCompare1')}</li><li>${t('chanCompare2')}</li><li>${t('chanCompare3')}</li><li>${t('chanCompare4')}</li>
      </ul>
    </div>
  </div>
  <div class="container section" style="padding-top:0">
    <div class="form-card" style="max-width:none">
      <h2>সাধারণ প্রশ্ন</h2>
      ${[
        ['এই সেবা কি সত্যিই ফ্রি?', 'হ্যাঁ। আবেদন ফি, আইনজীবীর ফি, আদালত ফি — কিছুই দিতে হবে না। কেউ টাকা চাইলে অভিযোগ ফরমে জানান।'],
        ['আমার তথ্য কি গোপন থাকবে?', 'হ্যাঁ। শুধু আপনার কেস সামলানো কর্মকর্তা দেখবেন। নির্যাতন-সংক্রান্ত কেস "স্পর্শকাতর" হিসেবে আলাদা থাকে।'],
        ['স্মার্টফোন নেই, আবেদন করব কীভাবে?', '১৬৬৯৯-এ কল করুন — অপারেটর ফোনেই ফরম পূরণ করবেন। অথবা ইউনিয়ন ডিজিটাল সেন্টারে যান।'],
        ['মধ্যস্থতার সিদ্ধান্ত মানতে চাই না কী হবে?', 'দুই পক্ষ সই না করলে সমঝোতা বাধ্যতামূলক নয় — তখন স্বাভাবিক আদালত প্রক্রিয়া চলবে।'],
        ['কত সময় লাগে?', 'কর্মকর্তা কয়েক কর্মদিবসে যাচাই করেন। মধ্যস্থতা আইনত ৬০ দিনে (৩০ দিন বাড়তি সম্ভব) শেষ হতে হয়।']
      ].map(([q, a]) => `<details style="margin-top:.7rem"><summary style="font-weight:700;cursor:pointer">${esc(q)}</summary><p style="margin-top:.4rem;color:var(--muted)">${esc(a)}</p></details>`).join('')}
    </div>
  </div>`;
}

// সহায়তা চ্যানেল বিস্তারিত পেজ
async function pageHelpChannel(ch) {
  const map = {
    call: { icon: '📞', title: t('callDeskTitle'), body: t('callDeskBody'),
      extra: `<h2 style="margin-top:1.4rem">${t('callPrepTitle')}</h2><ul style="margin:.5rem 0 0 1.2rem;display:flex;flex-direction:column;gap:.4rem;color:var(--muted)">
        <li>এনআইডি/জন্মনিবন্ধন নম্বর</li><li>সমস্যার সংক্ষিপ্ত বিবরণ (কবে থেকে, প্রতিপক্ষ কে)</li>
        <li>জেলা ও থানার নাম</li><li>আগের আবেদন থাকলে আবেদন আইডি</li></ul>`,
      action: `<div class="call-cta-row">
        <a class="btn btn-primary" href="tel:16699" style="font-size:1.1rem;padding:.9rem 1.6rem">📞 ${t('callNow')}: ১৬৬৯৯</a>
        <a class="btn btn-outline" href="#/call" style="font-size:1.1rem;padding:.9rem 1.6rem">📱 ইন্টারঅ্যাকটিভ ডেমো দেখুন</a>
      </div>
      <p style="color:var(--muted);margin-top:.6rem">বিদেশ থেকে: +৮৮০ ৯৬১২ ৩৯ ১৬৬৯৯</p>` },
    udc: { icon: '🏢', title: t('udcTitle'), body: t('udcBody'),
      extra: `<div class="quick-ans" style="margin-top:1.2rem"><strong>ইউডিসিতে যা নেবেন</strong>
        <ul style="margin:.5rem 0 0 1.2rem;color:var(--muted)"><li>এনআইডি/জন্মনিবন্ধন</li><li>সমস্যা সম্পর্কিত কাগজ (দলিল/কাবিননামা/রশিদ)</li><li>নিজের ফোন নম্বর</li></ul></div>`,
      action: `<a class="btn btn-primary" href="#/offices">${t('navOffices')} →</a>` },
    ussd: { icon: '#️⃣', title: t('ussdTitle'), body: t('ussdBody'),
      extra: `<h2 style="margin-top:1.4rem">ধাপে ধাপে</h2><ol style="margin:.5rem 0 0 1.2rem;display:flex;flex-direction:column;gap:.4rem;color:var(--muted)">
        <li>শর্টকোড ডায়াল করুন</li><li>ভাষা বেছে নিন (বাংলা/English)</li><li>মামলার ধরন বেছে নিন (১-৯)</li>
        <li>নাম ও এনআইডি লিখে পাঠান</li><li>এসএমএসে আবেদন আইডি পাবেন</li></ol>`,
      action: `<div class="call-cta-row">
        <a class="btn btn-outline" href="#/track">${t('ctaTrack')} →</a>
        <a class="btn btn-primary" href="#/call" style="background:#0f172a;border-color:#0f172a">📱 ইন্টারঅ্যাকটিভ মেনু দেখুন</a>
      </div>` },
    ai: { icon: '🤖', title: t('aiChanTitle'), body: t('aiChanBody'), extra: '',
      action: `<button class="btn btn-primary" onclick="document.getElementById('chatFab').click()">🤖 ${t('aiChanTitle')} খুলুন</button>` }
  };
  const c = map[ch];
  if (!c) return pageHelp();
  app.innerHTML = `
  <div class="container page-head article-wrap">
    <div class="breadcrumb"><a href="#/help">${t('helpTitle')}</a> / ${esc(c.title)}</div>
    <h1>${c.icon} ${esc(c.title)}</h1>
    <p style="font-size:1.03rem;margin-top:.5rem">${c.body}</p>
    ${c.extra}
    <div style="margin-top:1.6rem">${c.action}</div>
    <div class="quick-ans" style="margin-top:1.8rem">
      <strong>${t('needMoreHelp')}</strong>
      <p style="color:var(--muted);margin:.3rem 0 .7rem">${t('moreHelpBody')}</p>
      <a class="btn btn-primary btn-sm" href="#/guide">${t('useGuide')} →</a>
    </div>
  </div>`;
}

// ---------- auth ----------
async function pageLogin() {
  if (ME) return (location.hash = '#/dashboard');
  app.innerHTML = `
  <div class="container"><div class="form-card auth-card">
    <h1 style="font-size:1.5rem">🔐 ${t('loginTitle')}</h1>
    <p style="color:var(--muted);margin:.4rem 0 1rem">${t('loginLead')}</p>
    <div id="authErr" class="form-error hidden"></div>
    <div class="field"><label>${t('phone')}</label><input id="l_phone" placeholder="${t('phonePh')}"></div>
    <div class="field" style="margin-top:.8rem"><label>${t('password')}</label><input id="l_pw" type="password"></div>
    <button class="btn btn-primary btn-block" id="l_go" style="margin-top:1.2rem">${t('login')}</button>
    <p class="auth-alt">${t('noAccount')} <a href="#/register">${t('regLink')}</a></p>
  </div></div>`;
  $('#l_go').onclick = async () => {
    const r = await apiPost('login', { phone: $('#l_phone').value.trim(), password: $('#l_pw').value });
    if (r.error) { const e = $('#authErr'); e.textContent = r.error; e.classList.remove('hidden'); return; }
    ME = r.user; renderAuthLink(); location.hash = '#/dashboard';
  };
}

async function pageRegister() {
  if (ME) return (location.hash = '#/dashboard');
  app.innerHTML = `
  <div class="container"><div class="form-card auth-card">
    <h1 style="font-size:1.5rem">📝 ${t('regTitle')}</h1>
    <p style="color:var(--muted);margin:.4rem 0 1rem">${t('regLead')}</p>
    <div id="authErr" class="form-error hidden"></div>
    <div class="field"><label>${t('name')} <span class="req">*</span></label><input id="r_name"></div>
    <div class="field" style="margin-top:.8rem"><label>${t('phone')} <span class="req">*</span></label><input id="r_phone" placeholder="${t('phonePh')}"></div>
    <div class="field" style="margin-top:.8rem"><label>${t('password')} <span class="req">*</span></label><input id="r_pw" type="password"><div class="hint">কমপক্ষে ৬ অক্ষর</div></div>
    <div class="field" style="margin-top:.8rem"><label>${t('nid')}</label><input id="r_nid"></div>
    <button class="btn btn-primary btn-block" id="r_go" style="margin-top:1.2rem">${t('regTitle')}</button>
    <p class="auth-alt">${t('haveAccount')} <a href="#/login">${t('loginLinkTxt')}</a></p>
  </div></div>`;
  $('#r_go').onclick = async () => {
    const e = $('#authErr');
    if ($('#r_pw').value.length < 6) { e.textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে'; e.classList.remove('hidden'); return; }
    const r = await apiPost('register', {
      name: $('#r_name').value.trim(), phone: $('#r_phone').value.trim(),
      password: $('#r_pw').value, nid: $('#r_nid').value.trim()
    });
    if (r.error) { e.textContent = r.error; e.classList.remove('hidden'); return; }
    ME = r.user; renderAuthLink(); location.hash = '#/dashboard';
  };
}

async function pageDashboard() {
  if (!ME) return (location.hash = '#/login');
  const r = await apiGet('applications');
  const apps = r.applications || [];
  const stageIcons = ['📝', '🔍', '👨‍⚖️', '🤝', '✅'];
  app.innerHTML = `
  <div class="container page-head">
    <div class="dash-hero">
      <div class="dash-avatar">${esc((ME.name || 'অ').trim()[0])}</div>
      <div>
        <h1>${t('dashTitle')}</h1>
        <p>স্বাগতম, <strong>${esc(ME.name)}</strong>! ${ME.phone ? '📞 ' + esc(ME.phone) : ''}</p>
      </div>
      <button class="btn btn-outline btn-sm" id="d_logout" style="margin-left:auto">${t('logout')}</button>
    </div>
  </div>
  <div class="container">
    <div class="dash-grid">
      <div class="stat-card"><h3>আমার আবেদন</h3><div class="stat-num">${bnNum(apps.length)}</div></div>
      <div class="stat-card"><h3>চলমান</h3><div class="stat-num">${bnNum(apps.filter((a) => a.stage < 4).length)}</div></div>
      <div class="stat-card"><h3>নিষ্পত্তি</h3><div class="stat-num">${bnNum(apps.filter((a) => a.stage >= 4).length)}</div></div>
      <div class="stat-card"><h3>জরুরি</h3><div class="stat-num">${bnNum(apps.filter((a) => a.emergency).length)}</div></div>
    </div>
    <div class="dash-head-row"><h2>${t('myApps')}</h2><a class="btn btn-primary btn-sm" href="#/apply">+ ${t('newApp')}</a></div>
    ${apps.length ? `<div class="myapps">${apps.map((a) => `
      <button class="app-card" data-app="${esc(a.appId)}">
        <span class="app-stage-icon">${stageIcons[a.stage] || '📝'}</span>
        <span class="app-main">
          <span class="app-id">${esc(a.appId)}</span>
          <span class="app-meta">${esc(a.caseType || 'সাধারণ')} ${a.district ? '· ' + esc(a.district) : ''} · ${t('submittedAt')}: ${new Date(a.createdAt).toLocaleDateString('bn-BD')}</span>
        </span>
        <span class="app-right">
          ${a.emergency ? '<span class="badge warn">জরুরি</span>' : ''}
          <span class="badge">${esc(BOOT.stages[a.stage]?.label || '')}</span>
          <span class="app-chevron">›</span>
        </span>
      </button>`).join('')}</div>` : `<div class="empty-state">${t('noApps')} <a href="#/apply">${t('newApp')} →</a></div>`}
    <div class="quick-ans" style="margin-top:1.6rem">
      <strong>📞 ফোনে সহায়তা নিন</strong>
      <p style="color:var(--muted);margin:.3rem 0 .7rem">অ্যাপ ছাড়াই ১৬৬৯৯ নম্বরে কল করে IVR ভয়েস মেনু থেকে সব সেবা নিন — ডেমো দেখুন।</p>
      <a class="btn btn-primary btn-sm" href="#/call">📞 কল সিমুলেটর চালান →</a>
    </div>
  </div>
  <div id="appModal" class="modal hidden">
    <div class="modal-box">
      <button class="modal-x" id="mClose">✕</button>
      <div id="mBody"></div>
    </div>
  </div>`;
  $('#d_logout').onclick = async () => {
    await apiPost('logout', {});
    ME = null; renderAuthLink(); location.hash = '#/'; toast('লগআউট হয়েছে');
  };
  const modal = $('#appModal');
  const closeModal = () => modal.classList.add('hidden');
  $('#mClose').onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  $$('.app-card').forEach((card) => {
    card.onclick = async () => {
      modal.classList.remove('hidden');
      $('#mBody').innerHTML = '<div class="empty-state">লোড হচ্ছে…</div>';
      const d = await apiGet('myapp', { id: card.dataset.app });
      if (d.error) { $('#mBody').innerHTML = `<div class="form-error">${esc(d.error)}</div>`; return; }
      $('#mBody').innerHTML = `
        <h2 style="margin-bottom:.2rem">${esc(d.appId)}</h2>
        <span class="badge">${esc(d.stageLabel)}</span>
        ${d.emergency ? '<span class="badge warn">জরুরি আবেদন</span>' : ''}
        <div class="modal-facts">
          <div><span>নাম</span><strong>${esc(d.name)}</strong></div>
          <div><span>ফোন</span><strong>${esc(d.phone)}</strong></div>
          <div><span>জেলা</span><strong>${esc(d.district || '—')}</strong></div>
          <div><span>মামলার ধরন</span><strong>${esc(d.caseType || '—')}</strong></div>
          <div><span>উদ্দেশ্য</span><strong>${esc(d.purpose || '—')}</strong></div>
          <div><span>জমার তারিখ</span><strong>${new Date(d.submitted).toLocaleDateString('bn-BD')}</strong></div>
        </div>
        <h3 style="margin:1.1rem 0 .5rem">${t('currentStage')}: ${esc(d.stageLabel)}</h3>
        <ul class="timeline">
          ${d.stages.map((s, i) => `<li class="${s.done ? 'done' : ''} ${s.current ? 'current' : ''}">
            <div class="tl-dot">${s.done ? '✓' : bnNum(i + 1)}</div>
            <div class="tl-body"><strong>${esc(s.label)}</strong>${s.current ? `<span>${t('currentStage')}</span>` : ''}</div>
          </li>`).join('')}
        </ul>
        <p style="color:var(--muted);font-size:.85rem;margin-top:.8rem">${esc(d.note)}</p>
        <div class="wizard-actions" style="margin-top:1rem">
          <a class="btn btn-outline btn-sm" href="#/track">📦 ${t('trackTitle')}</a>
          <a class="btn btn-primary btn-sm" href="#/call">📞 ১৬৬৯৯-এ কল</a>
        </div>`;
    };
  });
}

// ---------- ফোন কল সিমুলেটর (DLAS-স্টাইল IVR) ----------
async function pageCall() {
  const bnDigit = (d) => bnNum(d);
  const KEYS = ['1','2','3','4','5','6','7','8','9','*','0','#'];
  const KEY_SUB = { '2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ','0':'+','*':'',' #':'' };
  app.innerHTML = `
  <div class="container page-head">
    <a class="btn btn-ghost btn-sm" href="#/help">← ${t('backHelp') || 'সহায়তায় ফিরুন'}</a>
    <h1>📞 ফোনে সহায়তা নিন — অ্যাডভোকেট ও ইউএসএসডি মেনু</h1>
    <p>দুটি চ্যানেলেই ২৪/৭ বা অফিস আওয়ারে আইনি প্রাথমিক সহায়তা পাবেন। যেকোনো একটি বেছে নিন — ডেমো কল চালিয়ে দেখুন কীভাবে কাজ করে।</p>
    <div class="call-tabs">
      <button class="call-tab active" id="tabPhone">📞 অ্যাডভোকেট কল · ১৬৬৯৯</button>
      <button class="call-tab" id="tabUssd">📱 ইউএসএসডি মেনু</button>
    </div>
  </div>
  <div class="container call-layout">
    <div class="phone-frame">
      <div class="phone-notch"></div>
      <div class="phone-status"><span>প্রাইভেট</span><span>ব্যাটারি ৪২%</span></div>
      <div class="phone-screen" id="phScreen">
        <div class="ph-idle">
          <div class="ph-icon">📞</div>
          <p>কল করতে নিচের বোতাম চাপুন অথবা নম্বর ডায়াল করুন</p>
        </div>
        <div class="ph-digits" id="phDigits"></div>
        <div class="ph-timer hidden" id="phTimer">০০:০০</div>
        <div class="ph-visualizer hidden" id="phViz">${Array.from({length: 18}, (_, i) => `<span style="--h:${8 + Math.round(Math.abs(Math.sin(i * 1.7)) * 26)}px"></span>`).join('')}</div>
      </div>
      <div class="keypad" id="keypad">
        ${KEYS.map((k) => `<button class="key" data-k="${k}"><b>${bnDigit(k === '*' ? '*' : k === '#' ? '#' : bnNum(k))}</b>${KEY_SUB[k] ? `<small>${KEY_SUB[k]}</small>` : '<small>&nbsp;</small>'}</button>`).join('')}
      </div>
      <div class="phone-actions">
        <button class="ph-btn ghost" id="phHold">⏸ ধরে রাখুন</button>
        <button class="ph-btn danger hidden" id="phEnd">📞 কল কাটুন</button>
        <button class="ph-btn green" id="phStart">✆ কল করুন</button>
      </div>
    </div>
    <div class="call-right">
      <h2>কলের ট্রান্সক্রিপ্ট</h2>
      <div class="live-badge" id="liveBadge" hidden><span class="dot"></span> লাইভ কী-লগ</div>
      <div class="transcript" id="transcript">
        <div class="tr-item sys"><span class="tr-tag">IVR</span> নম্বর ডায়াল করে "কল করুন" চাপুন — এরপর প্রতিটি ধাপ এখানে দেখা যাবে।</div>
      </div>
      <div class="call-hint">ℹ️ বাস্তব কল নয় — ইন্টারঅ্যাকটিভ ডেমো। আসল কলে ভয়েস-কী-প্রেস কাজ করে।</div>
      <div class="call-steps" id="callSteps">
        <h3>এক নজরে IVR মেনু</h3>
        <ol>
          <li>ভাষা নির্বাচন — বাংলার জন্য ১, English এর জন্য ২</li>
          <li>১ → আবেদন ট্র্যাক (আইডির শেষ ৯ ডিজিট + #)</li>
          <li>২ → নতুন আবেদন / এসএমএস লিংক</li>
          <li>৩ → অফিসের ঠিকানা এসএমএসে</li>
          <li>৪ → আইনজীবী নিয়োগ তথ্য</li>
          <li>০ → সরাসরি কল-সেন্টার এজেন্ট</li>
        </ol>
      </div>
    </div>
  </div>`;
  // ---- কল স্টেট ----
  let onCall = false, held = false, timer = null, secs = 0, digits = '', ivrState = 'start', lang = 'bn', mode = 'call', ussdPath = '';
  const $t = $('#transcript'), $digits = $('#phDigits'), $timer = $('#phTimer'), $viz = $('#phViz'), $idle = document.querySelector('.ph-idle');
  const $start = $('#phStart'), $end = $('#phEnd'), $hold = $('#phHold'), $live = $('#liveBadge');
  const addTr = (who, text) => {
    const div = document.createElement('div');
    div.className = 'tr-item ' + who;
    div.innerHTML = `<span class="tr-tag">${who === 'ivr' ? 'IVR' : who === 'user' ? 'আপনি' : 'ℹ️'}</span> ${esc(text)}`;
    $t.appendChild(div); $t.scrollTop = $t.scrollHeight;
  };
  const setScreen = () => {
    $digits.textContent = digits;
    if (onCall && !held) { $timer.classList.remove('hidden'); $viz.classList.remove('hidden'); $idle.style.display = 'none'; }
    else if (onCall && held) { $timer.classList.remove('hidden'); $viz.classList.add('hidden'); $idle.style.display = 'none'; }
    else if (digits) { $timer.classList.add('hidden'); $viz.classList.add('hidden'); $idle.style.display = 'none'; }
    else { $timer.classList.add('hidden'); $viz.classList.add('hidden'); $idle.style.display = ''; }
  };
  const fmt = (s) => bnNum(String(Math.floor(s / 60)).padStart(2, '0')) + ':' + bnNum(String(s % 60).padStart(2, '0'));
  const tick = () => { secs++; $timer.textContent = fmt(secs); };
  const ivr = async (payload) => {
    const r = await apiPost('ivr', payload);
    (r.say || []).forEach((s) => addTr('ivr', s));
    if (r.prompt) addTr('sys', r.prompt);
    if (r.next) ivrState = r.next;
    return r;
  };
  const startCall = async () => {
    if (onCall) return;
    onCall = true; held = false; secs = 0; digits = ''; ivrState = 'start';
    $start.classList.add('hidden'); $end.classList.remove('hidden'); $hold.classList.remove('hidden');
    $live.hidden = false; setScreen();
    $timer.textContent = fmt(0);
    if (mode === 'ussd') {
      // ইউএসএসডি — ফোনেই মেনু চলে
      ussdPath = '*১৬৬৯৯#';
      $digits.textContent = ussdPath;
      addTr('sys', '📲 শর্টকোড পাঠানো হচ্ছে…');
      setTimeout(async () => {
        addTr('sys', 'ইউএসএসডি সেশন শুরু');
        await ivr({ state: 'start' });
        $digits.textContent = '';
      }, 700);
      return;
    }
    tick(); timer = setInterval(tick, 1000);
    addTr('sys', '📞 ১৬৬৯৯-এ কল যাচ্ছে…');
    setTimeout(async () => {
      addTr('sys', 'ধরা পড়েছে — সিগন্যাল ভালো');
      await ivr({ state: 'start' });
    }, 800);
  };
  const endCall = () => {
    if (!onCall) return;
    onCall = false; held = false; clearInterval(timer);
    $start.classList.remove('hidden'); $end.classList.add('hidden'); $hold.classList.add('hidden');
    $live.hidden = true; digits = ''; setScreen();
    addTr('sys', mode === 'ussd' ? 'ইউএসএসডি সেশন শেষ' : `কল শেষ — সময়কাল ${fmt(secs)}`);
  };
  const pressKey = async (k) => {
    if (!onCall) { digits += k; setScreen(); return; }
    if (held) { held = false; $hold.textContent = '⏸ ধরে রাখুন'; addTr('sys', 'কল পুনরায় চালু'); }
    addTr('user', k === '#' ? '#' : k === '*' ? '*' : k);
    if (ivrState === 'track' || ivrState === 'trackResult') {
      if (k === '#') { await ivr({ state: 'track', digits: digits.replace(/\D/g, '') }); digits = ''; }
      else digits += k;
      setScreen(); return;
    }
    if (k === '*') { await ivr({ state: 'langBn', key: '*' }); return; }
    await ivr({ state: ivrState, key: k });
  };
  $$('#keypad .key').forEach((btn) => { btn.onclick = () => pressKey(btn.dataset.k); });
  $start.onclick = startCall;
  $end.onclick = endCall;
  $hold.onclick = () => {
    if (!onCall) return;
    held = !held;
    $hold.textContent = held ? '▶ চালু করুন' : '⏸ ধরে রাখুন';
    addTr('sys', held ? 'কল হোল্ডে' : 'কল পুনরায় চালু');
    setScreen();
  };
  // ---- USSD ট্যাব — একই ফোনে মেনু মোড ----
  $('#tabUssd').onclick = () => {
    $('#tabPhone').classList.remove('active'); $('#tabUssd').classList.add('active');
    mode = 'ussd';
    $('#phStart').innerHTML = '📲 শর্টকোড পাঠান';
    if (!onCall) endCall();
    addTr('sys', 'ইউএসএসডি মোড — ফোনের স্ক্রিনেই মেনু দেখা যাবে। "শর্টকোড পাঠান" চাপুন।');
  };
  $('#tabPhone').onclick = () => {
    $('#tabUssd').classList.remove('active'); $('#tabPhone').classList.add('active');
    mode = 'call';
    $('#phStart').innerHTML = '✆ কল করুন';
  };
}
async function pageComplaint() {
  app.innerHTML = `
  <div class="container page-head"><h1>📣 ${t('complaintTitle')}</h1><p>${t('complaintLead')}</p></div>
  <div class="container"><div class="form-card">
    <div id="cErr" class="form-error hidden"></div>
    <div id="cBody">
      <div class="field"><label>${t('compCategory')}</label>
        <select id="c_cat">
          <option>অফিস সংক্রান্ত</option><option>আইনজীবী সংক্রান্ত</option><option>টাকা-পয়সা চাওয়া হয়েছে</option>
          <option>ওয়েবসাইট সংক্রান্ত</option><option>অন্য</option>
        </select></div>
      <div class="field" style="margin-top:.9rem"><label>${t('compCase')}</label><input id="c_case" placeholder="DLAS-NET-…"></div>
      <div class="field" style="margin-top:.9rem"><label>${t('compDesc')} <span class="req">*</span></label><textarea id="c_desc"></textarea></div>
      <div class="field" style="margin-top:.9rem"><label>${t('phone')} (যোগাযোগের জন্য)</label><input id="c_phone" placeholder="${t('phonePh')}"></div>
      <button class="btn btn-primary btn-block" id="c_go" style="margin-top:1.2rem">${t('compSubmit')}</button>
    </div>
  </div></div>`;
  $('#c_go').onclick = async () => {
    const r = await apiPost('complaints', {
      category: $('#c_cat').value, caseRef: $('#c_case').value.trim(),
      desc: $('#c_desc').value.trim(), phone: $('#c_phone').value.trim()
    });
    if (r.error) { const e = $('#cErr'); e.textContent = r.error; e.classList.remove('hidden'); return; }
    $('#cBody').innerHTML = `<div class="form-success">✅ ${t('compDone')}: <strong>${esc(r.id)}</strong><p style="margin-top:.4rem">${esc(r.message)}</p></div>`;
  };
}

// ---------- হেডারের লগইন লিংক ----------
function renderAuthLink() {
  const el = $('#loginLink');
  if (ME) { el.textContent = t('dashboard'); el.setAttribute('href', '#/dashboard'); }
  else { el.textContent = t('login'); el.setAttribute('href', '#/login'); }
}

// ---------- boot ----------
(async function init() {
  initShell();
  applyI18n();
  try {
    BOOT = await apiGet('bootstrap');
  } catch (e) {
    app.innerHTML = '<div class="empty-state">সার্ভারে সংযোগ করা যাচ্ছে না। <code>npm start</code> চালান।</div>';
    return;
  }
  const me = await apiGet('me');
  ME = me.user;
  renderAuthLink();
  window.addEventListener('hashchange', route);
  route();
})();
