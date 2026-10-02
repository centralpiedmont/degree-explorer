import { KioskState } from './state.js';
import { mountKeyboard } from './keyboard.js';

const params = new URLSearchParams(location.search);
// Signage builds (Android WebView) pass ?signage=1: no server behind them. GitHub Pages and
// file:// have no POST /email either, so "Email" only appears where it can actually send.
const SIGNAGE = params.get('signage') === '1';
const CAN_EMAIL = !SIGNAGE && location.protocol.startsWith('http') && !/github\.io$/.test(location.hostname);
const NO_VIDEO = params.get('novideo') === '1';

const IDLE_MS = 60_000;
const WARN_MS = 15_000;
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// cpcc.edu arrow language: → stays on the kiosk, ↗ opens on your phone (QR).
const AR = '<svg class="ar" viewBox="0 0 24 20" aria-hidden="true"><path d="M2 10h19M14 3l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
const AL = '<svg class="ar" viewBox="0 0 24 20" aria-hidden="true"><path d="M22 10H3M10 3l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
const UR = '<svg class="ar" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16L16 4M6 4h10v10" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
const SEP = '<svg class="sep" width="16" height="14" viewBox="0 0 24 20" aria-hidden="true"><path d="M2 10h19M14 3l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';

// Quiz answer icons (self-hosted Font Awesome, solid).
const ICONS = {
  compass: 'fa-compass', code: 'fa-code', chart: 'fa-chart-column', shield: 'fa-shield-halved',
  controller: 'fa-gamepad', wrench: 'fa-wrench', briefcase: 'fa-briefcase', calculator: 'fa-calculator',
  truck: 'fa-truck-fast', scale: 'fa-scale-balanced', stethoscope: 'fa-stethoscope', handshake: 'fa-handshake',
  'hand-holding-heart': 'fa-hand-holding-heart', 'hands-holding': 'fa-hands-holding', 'heart-pulse': 'fa-heart-pulse',
  flask: 'fa-flask', tooth: 'fa-tooth', 'truck-medical': 'fa-truck-medical', utensils: 'fa-utensils',
  cake: 'fa-cake-candles', bread: 'fa-bread-slice', concierge: 'fa-concierge-bell', hotel: 'fa-hotel',
  scissors: 'fa-scissors', spa: 'fa-spa', leaf: 'fa-leaf', seedling: 'fa-seedling', tree: 'fa-tree',
};
const icon = (name) => (ICONS[name] ? `<i class="fa-solid ${ICONS[name]}" aria-hidden="true"></i>` : '');

const app = document.getElementById('app');
let state, data, idleTimer, warnTimer;
let programMode = 'cards', modeWorld = null;
let lastKey = '', lastDepth = 0, lastOverlay = null;

// ---------- Canvas scaling: fixed 1920x1080 design, uniform scale, centered ----------
const DESIGN_W = 1920, DESIGN_H = 1080;
function fitScreen() {
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  if (!vw || !vh) return;
  const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
  app.style.transform = `translate(${Math.round((vw - DESIGN_W * s) / 2)}px, ${Math.round((vh - DESIGN_H * s) / 2)}px) scale(${s})`;
}
['resize', 'orientationchange', 'load', 'pageshow'].forEach((ev) => window.addEventListener(ev, fitScreen));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitScreen);
function fitWithRetries() { fitScreen(); requestAnimationFrame(fitScreen); [150, 500, 1500].forEach((ms) => setTimeout(fitScreen, ms)); }

// ---------- Data helpers ----------
const world = (id) => data.worlds.find((w) => w.id === id);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function photo(cls, file, faIcon, inner = '') {
  return file
    ? `<div class="${cls}" style="background-image:url('${file}')">${inner}</div>`
    : `<div class="${cls} nophoto"><i class="fa-solid ${faIcon}" aria-hidden="true"></i>${inner}</div>`;
}
// "The Caregiver" -> light "The" + heavy "Caregiver" (President's Report headline pair).
function lightHeavy(text) {
  const words = String(text).split(' ');
  const cut = words[0].toLowerCase() === 'the' ? 1 : Math.ceil(words.length / 2);
  return `<span class="lt">${esc(words.slice(0, cut).join(' '))} </span><span class="hv">${esc(words.slice(cut).join(' '))}</span>`;
}
// Time to complete: the catalog's sequence length when there is one, else the website's timeline.
const timeText = (p) => (p.semesters ? plural(p.semesters, 'semester') : p.timeline || '');
function admChips(a) {
  if (!a) return '';
  const chips = [a.admissionType === 'selective' ? '<span class="chip gold">Competitive admission</span>' : '<span class="chip gold">Open admission</span>'];
  if (a.teasRequired) chips.push('<span class="chip">TEAS required</span>');
  if (a.infoSessionRequired) chips.push('<span class="chip">Info session required</span>');
  if (a.applicationWindow) chips.push(`<span class="chip">${esc(a.applicationWindow)}</span>`);
  return chips.join('');
}

// ---------- Shared chrome: white header with breadcrumbs, Gray/Gold rail ----------
function crumbs() {
  const S = state.screen, out = [];
  const inExplore = ['world', 'program', 'detail', 'courses', 'admissions', 'ce', 'ce-detail'].includes(S);
  if (inExplore) out.push({ label: 'Explore programs', act: 'crumb-world' });
  const w = state.worldId && world(state.worldId);
  if (['program', 'detail', 'courses', 'admissions'].includes(S) && w && (S === 'program' || w.programIds.length > 1)) {
    out.push({ label: w.name, act: 'crumb-program' });
  }
  if (['detail', 'courses', 'admissions'].includes(S) && state.current) out.push({ label: state.current.name, act: 'crumb-detail' });
  if (S === 'courses') out.push({ label: 'Courses' });
  if (S === 'admissions') out.push({ label: 'How to get in' });
  if ((S === 'ce' || S === 'ce-detail') && data.ce) out.push({ label: data.ce.short, act: 'crumb-ce' });
  if (S === 'ce-detail' && state.ceCourse) out.push({ label: state.ceCourse.code });
  if (S.startsWith('quiz')) out.push({ label: 'Career quiz' });
  return out;
}
function header() {
  const list = crumbs();
  const items = list.map((c, i) => {
    const last = i === list.length - 1;
    return SEP + (last || !c.act ? `<span class="c now">${esc(c.label)}</span>` : `<button class="c" data-act="${c.act}">${esc(c.label)}</button>`);
  }).join('');
  return `<header class="hdr">
    <img class="logo" src="assets/brand/logo-color.svg" alt="Central Piedmont Community College">
    <nav class="crumbs" aria-label="You are here"><button class="home" data-act="home" aria-label="Start over"><i class="fa-solid fa-house"></i></button>${items}</nav>
    <div class="spacer"></div>
    <div class="label">${esc(data.copy.topbarLabel)}</div>
    <button class="btn btn-gold btn-sm" data-act="apply">Apply now ${UR}</button>
  </header>`;
}
function rail(body) {
  return `<footer class="rail">
    <div class="nav"><img class="mark" src="assets/brand/mark-white.png" alt="">
      <button class="btn btn-light" data-act="back">${AL} Back</button>
      <button class="btn btn-light" data-act="over"><i class="fa-solid fa-rotate-left"></i> Start over</button></div>
    <div class="body">${body}</div>
  </footer>`;
}
const quizCta = () => (data.quiz ? `<div class="hint">Not sure where to start?</div><div class="grow"></div>
  <button class="btn btn-ink" data-act="quiz">Take the 1-minute career quiz ${AR}</button>`
  : `<div class="hint">Not sure where to start? A Navigator can help.</div><div class="grow"></div>
  <button class="btn btn-ink" data-act="nav">Talk to a Navigator ${UR}</button>`);
const infoShort = () => data.copy.infoShort || 'Information session';
const sheetLabel = (p) => (/catalog\.cpcc\.edu/.test(p.sheetUrl) ? 'Scan for the full catalog listing' : 'Scan for the full degree sheet');
const exploreCta = () => `<div class="hint">Your answers stay on this screen. Nothing is saved.</div><div class="grow"></div>`;
function qrBand(qrFile, title, sub = 'Opens on your phone. No Wi-Fi needed.', withEmail = false) {
  return `<div class="qr" style="background-image:url('${qrFile}')"></div>
    <div class="qtxt"><b>${title} ${UR}</b><span>${sub}</span></div><div class="grow"></div>
    ${withEmail && CAN_EMAIL ? '<button class="btn btn-ink" data-act="email"><i class="fa-solid fa-envelope"></i> Email it to me</button>' : ''}
    <button class="btn btn-ink-line" data-act="info">${esc(infoShort())} ${UR}</button>`;
}
function screen(cls, main, railBody, { mainCls = '' } = {}) {
  return el(`<section class="screen ${cls}">${header()}<div class="main ${mainCls}">${main}</div>${rail(railBody)}</section>`);
}
const chevrons = (which = ['tr', 'bl']) => which.map((c) => `<img class="chev ${c}" src="assets/brand/chevrons.svg" alt="">`).join('');

// ---------- Screens ----------
const SCREENS = {
  attract: attractView,
  world: worldView,
  program: programView,
  detail: () => detailView(state.current),
  courses: () => coursesView(state.current),
  admissions: () => admissionsView(state.current),
  ce: ceView,
  'ce-detail': () => ceCourseView(state.ceCourse),
  quizIntro: quizIntroView,
  quizQuestion: quizQuestionView,
  quizSuspense: quizSuspenseView,
  quizResult: quizResultView,
};

// Attract: muted b-roll, then a run of program photographs with a tappable spotlight.
let videoBroken = NO_VIDEO;
let spotOrder = null, spotIdx = 0, vidIdx = 0;
const VIDEOS = ['assets/video/broll.mp4', 'assets/video/reel.mp4'];
const PHOTOS_PER_VIDEO = 4;
function attractView() {
  const s = el(`<section class="screen attract">
    <div class="stage"></div><div class="scrim"></div>
    <div class="a-top"><img class="logo" src="assets/brand/logo-white.svg" alt="Central Piedmont Community College"><div class="label">${esc(data.copy.topbarLabel)}</div></div>
    <div class="a-copy">
      <div class="eyebrow">Central Piedmont Community College</div>
      <h1><span class="lt">Conquer</span><span class="hv">possibility.</span></h1>
      <p class="sub">${esc(data.copy.attractSub)}</p>
      <div class="a-ctas">
        <button class="btn btn-gold btn-xl" data-act="start">Explore programs ${AR}</button>
        ${data.quiz ? `<button class="btn btn-light btn-xl" data-act="quiz">Take the 1-minute career quiz ${AR}</button>` : ''}
      </div>
    </div>
    <div class="a-touch"><span class="pulse"></span>Touch anywhere to begin</div>
    <button class="a-spot" data-act="spot"><span class="corner"><img src="assets/brand/mark-dark.png" alt=""></span>
      <span class="sp-txt"><span class="sp-k">Program spotlight</span><span class="sp-n"></span><span class="sp-d"></span></span></button>
  </section>`);
  runAttract(s);
  return s;
}
function runAttract(s) {
  const stage = s.querySelector('.stage'), spot = s.querySelector('.a-spot');
  if (!spotOrder) {
    const seen = new Set();
    spotOrder = Object.values(data.programs).filter((p) => p.heroFile && !seen.has(p.heroFile) && seen.add(p.heroFile));
    for (let i = spotOrder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spotOrder[i], spotOrder[j]] = [spotOrder[j], spotOrder[i]]; }
  }
  let step = 0, timer;
  const show = (node) => {
    const old = [...stage.children];
    stage.appendChild(node);
    requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('in')));
    setTimeout(() => old.forEach((n) => n.remove()), 1200);
  };
  const next = () => {
    clearTimeout(timer);
    if (!s.isConnected) return;
    const videoTurn = !videoBroken && step % (PHOTOS_PER_VIDEO + 1) === 0;
    step++;
    if (videoTurn) {
      const v = document.createElement('video');
      Object.assign(v, { muted: true, autoplay: true, playsInline: true, preload: 'auto', src: VIDEOS[vidIdx++ % VIDEOS.length] });
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.onended = next;
      v.onerror = () => { videoBroken = true; next(); };
      spot.classList.remove('on');
      show(v);
      const p = v.play();
      if (p) p.catch((e) => { if (e.name !== 'AbortError') { videoBroken = true; next(); } });
      timer = setTimeout(next, 45_000); // safety net if 'ended' never fires
      return;
    }
    if (!spotOrder.length) return;
    const prog = spotOrder[spotIdx++ % spotOrder.length];
    show(el(`<div class="ph" style="background-image:url('${prog.heroFile}')"></div>`));
    spot.dataset.id = prog.id;
    spot.querySelector('.sp-n').textContent = prog.name;
    spot.querySelector('.sp-d').innerHTML = `${prog.track ? esc(prog.track) + ' &middot; ' : ''}${esc(prog.degree)} &middot; Tap to explore ${AR}`;
    spot.classList.add('on');
    timer = setTimeout(next, 6500);
  };
  timer = setTimeout(next, 0); // the screen is attached to the DOM after attractView returns
}

function worldView() {
  const cards = data.worlds.map((w) => {
    const n = w.programIds.length;
    return `<button class="wcard" data-act="pick-world" data-id="${w.id}">
      <div class="wc-body"><div class="wc-top"><span class="ic"><i class="fa-solid ${w.icon}"></i></span><span class="count">${plural(n, 'program')}</span></div>
        <h2>${esc(w.name)}</h2><p>${esc(w.desc)}</p><span class="go">${n === 1 ? 'See the program' : 'Explore'} ${AR}</span></div>
      ${photo('wc-photo', w.photo, w.icon)}</button>`;
  });
  if (data.ce) {
    cards.push(`<button class="wcard std" data-act="ce">
      <div class="wc-body"><div class="wc-top"><span class="ic"><i class="fa-solid fa-certificate"></i></span><span class="count">Non-credit</span></div>
        <h2>${esc(data.ce.label)}</h2><p>${esc(data.ce.tileDesc)}</p><span class="go">Browse courses ${AR}</span></div>
      ${photo('wc-photo', data.ce.photo, 'fa-certificate')}</button>`);
  }
  const layout = cards.length <= 5 ? 'row' : cards.length > 8 ? 'grid2 narrow' : 'grid2';
  return screen('world', `
    <div class="pagehead"><div class="titles"><div class="eyebrow">${esc(data.copy.topbarLabel)}</div><h1>What do you want to do?</h1></div>
      <p class="lede">Choose an area that interests you. Each one opens the programs inside it.</p></div>
    <div class="cards ${layout}" style="${layout.startsWith('grid2') ? `grid-template-columns:repeat(${Math.ceil(cards.length / 2)},1fr)` : ''}">${cards.join('')}</div>`, quizCta());
}

function programView() {
  const w = world(state.worldId);
  const progs = state.currentPrograms();
  if (modeWorld !== w.id) { programMode = progs.length > 4 ? 'table' : 'cards'; modeWorld = w.id; }
  const hasAdm = progs.some((p) => p.admissions);
  const hasFormat = progs.some((p) => p.format);
  const body = programMode === 'table'
    ? `<table class="ptable"><thead><tr><th>Program</th><th>Credential</th><th>Credit hours</th><th>Time to complete</th>${hasFormat ? '<th>Format</th>' : ''}${hasAdm ? '<th>Admission</th>' : ''}<th></th></tr></thead><tbody>
        ${progs.map((p) => `<tr class="go" data-act="pick-program" data-id="${p.id}">
          <td>${esc(p.name)}${p.track ? `<div class="chip line" style="display:inline-block;margin-left:12px">${esc(p.track)}</div>` : ''}</td>
          <td>${esc(p.degree)}</td><td>${esc(p.totalHours)}</td><td>${esc(timeText(p))}</td>${hasFormat ? `<td>${esc(p.format)}</td>` : ''}
          ${hasAdm ? `<td>${p.admissions ? (p.admissions.admissionType === 'selective' ? 'Competitive' : 'Open') : 'Open'}</td>` : ''}
          <td class="arrow">${AR}</td></tr>`).join('')}</tbody></table>`
    : `<div class="cards row">${progs.map((p) => `
        <button class="pcard" data-act="pick-program" data-id="${p.id}">
          ${photo('pc-photo', p.heroFile, w.icon, `<span class="tab">${esc(p.degree)}</span><span class="fold"><img src="assets/brand/mark-white.png" alt=""></span>`)}
          <div class="pc-body"><h2>${esc(p.name)}</h2>${p.track ? `<div class="trk">${esc(p.track)}</div>` : ''}
            ${p.tileDesc ? `<p>${esc(p.tileDesc)}</p>` : ''}
            <div class="meta"><span class="chip">${esc(p.totalHours)} credit hours</span>${timeText(p) ? `<span class="chip">${esc(timeText(p))}</span>` : ''}
              ${p.admissions && p.admissions.admissionType === 'selective' ? '<span class="chip gold">Competitive</span>' : ''}</div>
            <span class="go">Discover this program ${AR}</span></div></button>`).join('')}</div>`;
  return screen('program', `
    <div class="pagehead"><div class="titles"><div class="eyebrow"><i class="fa-solid ${w.icon}"></i>${esc(data.copy.topbarLabel)}</div><h1>${esc(w.name)}</h1></div>
      <p class="lede">${plural(progs.length, 'program')}. Tap one to see what you will learn, where it leads, and how to get in.</p>
      ${progs.length > 1 ? `<div class="seg"><button class="${programMode === 'cards' ? 'on' : ''}" data-act="mode" data-id="cards"><i class="fa-solid fa-table-cells-large"></i> Cards</button>
        <button class="${programMode === 'table' ? 'on' : ''}" data-act="mode" data-id="table"><i class="fa-solid fa-table-list"></i> Compare</button></div>` : ''}</div>
    ${body}`, quizCta());
}

function detailView(p) {
  const w = world(p.world);
  const adm = p.admissions;
  const specs = p.specializations || [];
  const ctas = adm
    ? `<button class="btn btn-gold" data-act="admissions">How to get in ${AR}</button><button class="btn btn-line" data-act="courses">See all courses ${AR}</button>`
    : `<button class="btn btn-gold" data-act="courses">See all courses ${AR}</button>`;
  const learnCol = `<div><h2>What you will learn</h2><p class="body">${esc(p.learn)}</p>
    ${p.skills && p.skills.length ? `<div class="skills">${p.skills.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}</div>`;
  const careerCol = p.careers && p.careers.length ? `<div><h2>Where it can take you</h2><div class="careers">
      ${p.careers.map((c) => `<div class="job"><span class="t">${esc(c.title)}</span><span class="s">${esc(c.salaryText)}</span></div>`).join('')}</div>
      <div class="src">National median annual wage. U.S. Bureau of Labor Statistics, May 2025.</div></div>` : '';
  const pathSec = specs.length || adm ? `<section class="d-sec mist"><div class="d-two">
      <div>${specs.length ? `<h2>Specialize as you go</h2><table class="spec-table"><thead><tr><th>Stackable credential</th><th>Code</th></tr></thead>
        <tbody>${specs.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.code || '')}</td></tr>`).join('')}</tbody></table>
        <p class="body" style="margin-top:16px">Each one counts toward this degree.</p>` : ''}</div>
      <div>${adm ? `<h2>How to get in</h2><div class="adm-row">${admChips(adm)}</div><button class="btn btn-gold" data-act="admissions">See the steps ${AR}</button>` : ''}</div>
    </div></section>` : '';
  const s = screen('detail', `<div class="scroll">
      <section class="d-hero">${photo('d-photo', p.heroFile, w.icon)}
        <div class="d-copy"><div class="eyebrow"><i class="fa-solid ${w.icon}"></i>${esc(w.name)}</div>
          <h1>${esc(p.name)}</h1>${p.track ? `<div class="trk">${esc(p.track)}</div>` : ''}
          <p class="lead">${esc(p.lead)}</p>
          <div class="stats"><div><b>${esc(p.degree)}</b><small>Credential</small></div><div><b>${esc(p.totalHours)}</b><small>Credit hours</small></div>${p.semesters ? `<div><b>${esc(p.semesters)}</b><small>Semesters</small></div>` : p.timeline ? `<div><b>${esc(p.timeline)}</b><small>Time to complete</small></div>` : ''}</div>
          ${p.format || p.campus ? `<div class="facts">${p.format ? `<span class="chip">${esc(p.format)}</span>` : ''}${p.campus ? `<span class="chip">${esc(p.campus)}</span>` : ''}</div>` : ''}
          <div class="d-ctas">${ctas}</div></div></section>
      <section class="d-sec"><div class="d-two">${learnCol}${careerCol}</div></section>
      ${pathSec}
      <section class="d-action"><div class="ph"></div><div class="panel">
        <h2>Turn idea into action</h2>
        <p>See the program in person, or talk with a Navigator. Navigators guide you from your first question to your first class.</p>
        <div class="qrrow">
          <button class="qrtile" data-act="info"><span class="q" style="background-image:url('${data.infoSession.qrFile}')"></span><span><b>${esc(infoShort())} ${UR}</b><span>Scan to see dates and sign up</span></span></button>
          <button class="qrtile" data-act="nav"><span class="q" style="background-image:url('${data.college.navigator.qrFile}')"></span><span><b>Talk to a Navigator ${UR}</b><span>Scan to connect with one</span></span></button>
        </div></div></section>
      <section class="d-next"><h2>Are you ready to take the next step?</h2><div class="row">
        <button class="btn btn-gold" data-act="courses">See all courses ${AR}</button>
        <button class="btn btn-line" data-act="back">Explore other programs ${AR}</button></div></section>
    </div><div class="scroll-cue"><i class="fa-solid fa-arrow-down"></i> Scroll for more</div>`,
  qrBand(p.qrFile, sheetLabel(p), undefined, true));
  const sc = s.querySelector('.scroll'), cue = s.querySelector('.scroll-cue');
  sc.addEventListener('scroll', () => cue.classList.toggle('off', sc.scrollTop > 40), { passive: true });
  return s;
}

function termGrid(columns) {
  // A short list (a certificate's requirements) keeps readable columns instead of stretching.
  return `<div class="terms" style="${columns.length < 4 ? 'grid-auto-columns:560px' : ''}">${columns.map((c) => `<div class="term"><div class="th"><b>${esc(c.title)}</b><span>${esc(c.meta)}</span></div>
    <div class="rows">${c.rows.join('')}</div></div>`).join('')}</div>`;
}
function coursesView(p) {
  const row = (r) => {
    const inner = `<div class="code">${esc(r.code)}</div><div class="nm">${esc(r.name)}</div><span class="cr">${esc(r.credits)}</span>`;
    return r.desc ? `<button class="crow" data-act="course" data-code="${esc(r.code)}">${inner}<span class="more"><i class="fa-solid fa-circle-info"></i></span></button>` : `<div class="crow">${inner}</div>`;
  };
  const note = p.planOfStudy.find((t) => t.note);
  return screen('courses', `
    <div class="pagehead"><div class="titles"><div class="eyebrow">${esc(p.name)}</div><h1>${p.planKind === 'requirements' ? 'Program requirements' : 'The courses you will take'}</h1></div>
      <div class="tot"><b>${esc(p.totalHours)}</b> credit hours &middot; ${esc(p.degree)} &middot; Tap a course to read about it</div></div>
    ${termGrid(p.planOfStudy.map((t) => ({ title: t.term, meta: `${t.termCredits} credits`, rows: t.rows.map(row) })))}
    ${note ? `<div class="foot-note">${esc(note.term)}: ${esc(note.note)}</div>` : ''}`,
  qrBand(p.qrFile, sheetLabel(p), undefined, true));
}

function admissionsView(p) {
  const a = p.admissions || {};
  return screen('admissions', `
    <div class="pagehead"><div class="titles"><div class="eyebrow">${esc(p.name)}</div><h1>How to get in</h1></div></div>
    <div class="adm">
      <div><div class="adm-row">${admChips(a)}</div>
        ${(a.keyPrereqs || []).length ? `<h2>Key prerequisites</h2><div class="adm-row">${a.keyPrereqs.map((c) => `<span class="chip line">${esc(c)}</span>`).join('')}</div>` : ''}
        ${a.notes ? `<p class="notes">${esc(a.notes)}</p>` : ''}</div>
      <div><h2>Your next steps</h2><ol class="steps">${(a.nextSteps || []).map((t, i) => `<li><span class="n">${i + 1}</span><span>${esc(t)}</span></li>`).join('')}</ol></div>
    </div>`,
  qrBand(p.applyQrFile || data.college.apply.qrFile, p.applyQrFile ? 'Scan to apply or get advised' : 'Scan to start your application'));
}

function ceView() {
  const ce = data.ce;
  const cols = ce.categories.map((cat) => ({
    title: cat.name, meta: plural(cat.courses.length, 'course'),
    rows: cat.courses.map((c) => `<button class="crow" data-act="ce-course" data-code="${esc(c.code)}"><div class="code">${esc(c.code)}</div><div class="nm">${esc(c.name)}</div>
      <div class="ce-meta">${c.price ? `$${esc(c.price)}${c.hours ? ` &middot; ${esc(c.hours)} hours` : ''}` : 'Dates coming soon'}</div></button>`),
  }));
  return screen('ce', `
    <div class="pagehead"><div class="titles"><div class="eyebrow">${esc(ce.label)}</div><h1>${data.copy.ceHeading}</h1></div><p class="lede">${esc(ce.tagline)}</p></div>
    ${termGrid(cols)}`,
  qrBand(ce.qrFile, 'Scan to see dates, pricing, and registration', 'Non-credit courses. Financial aid options available.'));
}
function ceCourseByCode(code) { return data.ce.categories.flatMap((c) => c.courses).find((c) => c.code === code); }

function ceCourseView(c) {
  if (!c) return ceView();
  const ce = data.ce;
  const desc = c.desc || 'Hands-on, certificate-focused training. Scan the code to see the full description, upcoming dates, and pricing.';
  return screen('detail ce-detail', `<div class="scroll">
    <section class="d-hero">${photo('d-photo', ce.photo, 'fa-certificate')}
      <div class="d-copy"><div class="eyebrow"><i class="fa-solid fa-certificate"></i>${esc(ce.label)}</div>
        <h1>${esc(c.name)}</h1><p class="lead">${esc(desc)}</p>
        <div class="stats"><div><b>${c.price ? '$' + esc(c.price) : 'TBA'}</b><small>Course fee</small></div><div><b>${esc(c.hours || 'TBA')}</b><small>Contact hours</small></div><div><b>${esc(c.code)}</b><small>Course code</small></div></div>
        <div class="d-ctas"></div></div></section>
    <section class="d-sec"><h2>Good to know</h2><p class="body">Non-credit continuing education, in person or live online. Financial aid options are available. Scan the code below to see upcoming dates and register.</p></section>
  </div>`, qrBand(c.qrFile || ce.qrFile, c.qrFile ? 'Scan to register for this course' : 'Scan to see dates, pricing, and registration'));
}

function quizIntroView() {
  const q = data.quiz;
  const tiles = data.worlds.slice(0, 4).map((w) => `<div style="background-image:url('${w.photo || ''}')"></div>`).join('');
  return screen('quiz dark', `${chevrons(['bl'])}
    <div class="q-intro"><div class="copy"><div class="eyebrow">Career quiz &middot; ${plural(q.questions.length, 'question')}</div>
      <h1>${lightHeavy(q.intro.title)}</h1><p>${esc(q.intro.blurb)}</p>
      <div class="row"><button class="btn btn-gold btn-xl" data-act="quiz-begin">Start the quiz ${AR}</button></div></div>
      <div class="mosaic">${tiles}</div></div>`, exploreCta());
}

let answering = false;
function quizQuestionView() {
  const q = data.quiz, idx = state.quizIndex, question = q.questions[idx];
  answering = false;
  return screen('quiz dark', `${chevrons(['tr'])}
    <div class="q-prog">${q.questions.map((_, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('')}</div>
    <div class="q-head"><div class="k">Question ${idx + 1} of ${q.questions.length}</div><h1>${esc(question.prompt)}</h1></div>
    <div class="q-tiles">${question.answers.map((a, i) => `<button class="qtile" data-act="answer" data-world="${esc(a.world)}" style="--d:${0.05 + i * 0.07}s">
      <span class="ic">${icon(a.icon)}</span><span class="lb">${esc(a.label)}</span></button>`).join('')}</div>`, exploreCta());
}

function quizSuspenseView() {
  setTimeout(() => { if (state.screen === 'quizSuspense') state.showResult(); }, 1400);
  return screen('quiz dark', `${chevrons()}<div class="q-wait"><div class="bars"><span></span><span></span><span></span></div><p>Matching you with programs&hellip;</p></div>`, exploreCta());
}

function quizResultView() {
  const w = world(state.quizResultWorld), arch = data.quiz.archetypes[w.id];
  const fits = w.programIds.map((id) => data.programs[id]).map((p) => `<span class="chip">${esc(p.name)}${p.track ? ' &middot; ' + esc(p.track) : ''}</span>`).join('');
  return screen('quiz dark', `${chevrons(['tr'])}
    <div class="q-result">${photo('photo', w.photo, w.icon)}
      <div class="info"><div class="eyebrow">${esc(data.copy.resultEyebrow)}</div>
        <h1>${lightHeavy(arch.name)}</h1><p>${esc(arch.blurb)}</p>
        <div class="fits"><div class="k">Programs that fit</div><div class="list">${fits}</div></div>
        <div class="row"><button class="btn btn-gold btn-xl" data-act="quiz-go">See your matches ${AR}</button>
          ${CAN_EMAIL ? '<button class="btn btn-light" data-act="quiz-email"><i class="fa-solid fa-envelope"></i> Email my results</button>' : ''}
          <button class="btn btn-light" data-act="quiz-retake"><i class="fa-solid fa-rotate-left"></i> Retake the quiz</button></div></div></div>`, exploreCta());
}

// ---------- Overlays ----------
const QR_COPY = {
  info: () => ({ title: data.copy.infoButton, file: data.infoSession.qrFile, text: 'Scan with your phone to see dates and sign up.' }),
  apply: () => ({ title: 'Apply to Central Piedmont', file: data.college.apply.qrFile, text: 'Scan to see how to apply, step by step, on your phone.' }),
  navigator: () => ({ title: 'Talk to a Navigator', file: data.college.navigator.qrFile, text: 'Navigators help you choose a program, apply, and register. Scan to connect with one.' }),
};
const OVERLAYS = {
  qr: () => {
    const c = (QR_COPY[state.qrKind] || QR_COPY.info)();
    return el(`<div class="overlay"><div class="modal"><h3>${esc(c.title)}</h3>
      <img class="bigqr" src="${c.file}" alt="QR code"><p>${esc(c.text)}</p>
      <div class="actions"><button class="btn btn-ink" data-act="close">Close</button></div></div></div>`);
  },
  emailPicker: () => {
    const w = world(state.quizResultWorld);
    const progs = (w ? w.programIds : []).map((id) => data.programs[id]);
    return el(`<div class="overlay"><div class="modal"><h3>Which degree sheet should we send?</h3>
      <div class="ep-list">${progs.map((p) => `<button class="ep-item" data-act="email-pick" data-id="${p.id}"><span>${esc(p.name)}${p.track ? ' &middot; ' + esc(p.track) : ''}</span>${AR}</button>`).join('')}</div>
      <div class="actions"><button class="btn btn-ink-line" data-act="close">Cancel</button></div></div></div>`);
  },
  email: () => mountKeyboard({
    initial: state.emailDraft,
    onType: (v) => { if (v !== state.emailDraft) state.typeEmail(v); },
    onCancel: () => state.closeOverlay(),
    onSubmit: async (email) => {
      const ctx = state.emailCtx || { programId: state.current && state.current.id, worldId: null };
      let ok = true;
      try {
        const r = await fetch('/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, programId: ctx.programId, worldId: ctx.worldId }) });
        ok = r.ok;
      } catch { ok = false; }
      state.emailDraft = '';
      state.closeOverlay();
      flash(ok ? 'Sent.' : 'We could not send that here.', ok ? 'Check your inbox for the degree sheet.' : 'Scan the code on screen to open the degree sheet on your phone.');
    },
  }),
};

function showCourseInfo(r) {
  app.appendChild(el(`<div class="overlay" data-local="1"><div class="modal course-modal">
    <div class="code">${esc(r.code)}</div><h3>${esc(r.name)}</h3><div class="cr">${esc(r.credits)} credit hours</div>
    <p class="desc">${esc(r.desc)}</p><div class="actions"><button class="btn btn-ink" data-act="close-local">Close</button></div></div></div>`));
}
function flash(title, text) {
  const t = el(`<div class="overlay" data-local="1"><div class="modal"><h3>${esc(title)}</h3><p>${esc(text)}</p></div></div>`);
  app.appendChild(t);
  setTimeout(() => t.isConnected && t.remove(), 2800);
}

// ---------- Actions (one delegated listener) ----------
const inHistory = (screenName) => state.history.some((h) => h.screen === screenName);
const ACTIONS = {
  home: () => state.startOver(),
  over: () => state.startOver(),
  back: () => (state.screen === 'quizQuestion' ? state.quizBack() : state.goBack()),
  start: () => state.start(),
  quiz: () => state.startQuiz(),
  spot: (t) => t.dataset.id && state.jumpToProgram(t.dataset.id),
  'crumb-world': () => (inHistory('world') ? state.popTo('world') : (state.startOver(), state.start())),
  'crumb-program': () => state.popTo('program'),
  'crumb-detail': () => state.popTo('detail'),
  'crumb-ce': () => state.popTo('ce'),
  apply: () => state.openQR('apply'),
  info: () => state.openQR('info'),
  nav: () => state.openQR('navigator'),
  email: () => state.openEmail(),
  'pick-world': (t) => state.chooseWorld(t.dataset.id),
  'pick-program': (t) => state.chooseProgram(t.dataset.id),
  ce: () => state.showCE(),
  mode: (t) => { programMode = t.dataset.id; render(); },
  courses: () => state.showCourses(),
  admissions: () => state.showAdmissions(),
  course: (t) => {
    const r = state.current.planOfStudy.flatMap((x) => x.rows).find((x) => x.code === t.dataset.code);
    if (r) showCourseInfo(r);
  },
  'ce-course': (t) => state.showCECourse(ceCourseByCode(t.dataset.code)),
  'quiz-begin': () => state.beginQuiz(),
  answer: (t) => {
    if (answering) return;
    answering = true;
    t.classList.add('sel');
    setTimeout(() => state.answerQuiz(t.dataset.world), 380);
  },
  'quiz-go': () => state.chooseWorld(state.quizResultWorld),
  'quiz-email': () => state.openEmailResults(),
  'quiz-retake': () => state.retakeQuiz(),
  'email-pick': (t) => state.pickEmailProgram(t.dataset.id),
  close: () => state.closeOverlay(),
  'close-local': (t) => t.closest('.overlay').remove(),
};
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (t) { const fn = ACTIONS[t.dataset.act]; if (fn) fn(t, e); return; }
  if (e.target.classList.contains('overlay')) {
    if (e.target.dataset.local) e.target.remove(); else state.closeOverlay();
    return;
  }
  if (state.screen === 'attract' && !state.overlay) state.start(); // touch anywhere to begin
});

// ---------- Render with direction-aware transitions and preserved scroll ----------
function screenKey() { return [state.screen, state.worldId, state.current && state.current.id, state.ceCourse && state.ceCourse.code, state.quizIndex].join('|'); }
function render() {
  if (!state) return; // ignore emits during KioskState construction; boot() renders explicitly
  const key = screenKey(), same = key === lastKey;
  const prevScroll = same ? (app.querySelector('.scroll') || {}).scrollTop || 0 : 0;
  app.innerHTML = '';
  const node = SCREENS[state.screen]();
  if (!same) node.classList.add(state.history.length < lastDepth ? 'enter-back' : 'enter-fwd');
  app.appendChild(node);
  if (prevScroll) { const sc = node.querySelector('.scroll'); if (sc) { sc.scrollTop = prevScroll; sc.dispatchEvent(new Event('scroll')); } }
  if (state.overlay) {
    const o = OVERLAYS[state.overlay]();
    if (state.overlay === lastOverlay && same) { o.style.animation = 'none'; const m = o.querySelector('.modal'); if (m) m.style.animation = 'none'; }
    app.appendChild(o);
  }
  lastKey = key; lastDepth = state.history.length; lastOverlay = state.overlay;
}

// ---------- Idle: warn, then reset to attract ----------
function bumpIdle() {
  clearTimeout(idleTimer); clearTimeout(warnTimer);
  const warn = app.querySelector('.idle'); if (warn) warn.remove();
  if (!state || state.screen === 'attract') return;
  warnTimer = setTimeout(() => app.appendChild(el(`<div class="idle" style="--t:${WARN_MS}ms"><b>Still exploring?</b>
    <span>Tap anywhere to keep going. This screen resets in ${WARN_MS / 1000} seconds.</span><div class="bar"></div></div>`)), IDLE_MS - WARN_MS);
  idleTimer = setTimeout(() => state.reset(), IDLE_MS);
}
['click', 'touchstart', 'keydown'].forEach((ev) => document.addEventListener(ev, bumpIdle, { passive: true }));

// Kiosk lock: no pinch-zoom, double-tap zoom, ctrl-wheel zoom, or ctrl/cmd +/-/0 zoom
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });

// fetch() is blocked under file:// in Android WebView; XHR works there.
function loadJson(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'json';
    xhr.onload = () => ((xhr.status === 0 || xhr.status === 200) ? resolve(xhr.response) : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('XHR error'));
    xhr.send();
  });
}

(async function boot() {
  data = await loadJson('kiosk-data.json');
  state = new KioskState(data, { onChange: () => { render(); bumpIdle(); } });
  render();
  fitWithRetries();
})();
