'use strict';
// ============================================================
// app.js – Daily Quests PWA
// Features: zufällige Quests, Streak, XP/Level, Modal, Konfetti,
//           Best-Streak, Motivations-Sprüche, Install-Banner oben
// ============================================================
 
const XP_PER_LEVEL   = 100;
const QUESTS_PER_DAY = 5;
 
const MOTIVATIONS = [
  "Kleine Schritte führen zu großen Veränderungen.",
  "Du musst es nicht perfekt machen. Nur machen.",
  "Jeder Tag ist ein neuer Anfang.",
  "Fortschritt, nicht Perfektion.",
  "Die beste Zeit ist jetzt.",
  "Disziplin schlägt Motivation langfristig.",
  "Einmal anfangen ist alles.",
  "Du wirst stolz sein, dass du es getan hast.",
  "Kleine Gewohnheiten, großer Unterschied.",
  "Heute besser als gestern.",
];
 
const CAT_COLOR = {
  health: ['#ef4444','rgba(239,68,68,0.08)'],
  move:   ['#22c55e','rgba(34,197,94,0.08)'],
  mind:   ['#3b82f6','rgba(59,130,246,0.08)'],
  social: ['#f59e0b','rgba(245,158,11,0.08)'],
  focus:  ['#a855f7','rgba(168,85,247,0.08)'],
};
 
const CAT_LABEL = {
  health:'Health', move:'Move', mind:'Mind', social:'Social', focus:'Focus'
};
 
const QUEST_TIPS = {
  1:  "Einfach ein normales Wasserglas, am besten jetzt sofort!",
  2:  "Balkon, Garten oder kurz vor die Tür – alles zählt.",
  3:  "Arme hoch, Seite dehnen, Nacken rollen – 30 Sekunden reicht.",
  4:  "Ein Apfel, eine Banane, eine Gurke – whatever da ist.",
  5:  "Buch, Artikel, auch News auf dem Handy zählt.",
  6:  "Handy weglegen, face-down oder in eine andere Schublade.",
  7:  "Ehrliches Kompliment, Danke sagen oder einfach lächeln.",
  8:  "Schreibtisch, Bett, eine Ecke – irgendetwas aufräumen.",
  9:  "Was lief gut? Was hast du geschafft? Aufschreiben hilft.",
  10: "Zählt auch: zum Supermarkt gehen, eine Runde im Haus.",
  11: "Zweites Glas Wasser – hast du das erste schon getrunken? 😄",
  12: "Augenkontakt + Lächeln. Das war's schon.",
  13: "Müsli, Brot, Joghurt – irgendwas Echtes.",
  14: "Einfach 'Hey, wie geht's?' reicht schon.",
  15: "Kniebeugen vor dem Spiegel oder Liegestütze am Boden.",
  16: "Mit Kopfhörern, laut, Augen zu – voll dabei sein.",
  17: "Augen zu, Handy weg, nichts tun. Nur 60 Sekunden.",
  18: "Alle Zettel, Kabel, Gläser – einfach durchgehen.",
  19: "30 Minuten früher als sonst. Handy um 22 Uhr weglegen.",
  20: "Auch einfaches Aufwärmen oder ein Sandwich selbst machen.",
  21: "Anrufen statt schreiben – die andere Person freut sich.",
  22: "Im Büro, Schule, Einkaufszentrum – einfach die Treppe nehmen.",
  23: "3 Punkte für heute – was MUSS erledigt werden?",
  24: "4 Sekunden einatmen, 4 halten, 4 ausatmen. Wiederholen.",
  25: "Wofür bist du dankbar? Sag es der Person direkt.",
};
 
let allQuests = [];
let state     = null;
let deferredInstall = null;
let currentModalQuestId = null;
 
const $ = id => document.getElementById(id);
 
// ── INIT ─────────────────────────────────────────────────────
async function init() {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
 
  allQuests = await fetch('./quests.json').then(r => r.json()).catch(() => []);
  loadState();
  render();
  setupInstall();
  setupModal();
  setupLevelUp();
 
  // Motivationsspruch
  const idx = Math.floor(Math.random() * MOTIVATIONS.length);
  $('motivationQuote').textContent = MOTIVATIONS[idx];
}
 
// ── STATE ─────────────────────────────────────────────────────
function loadState() {
  const today = getToday();
  let s = {};
  try { s = JSON.parse(localStorage.getItem('dq3') || '{}'); } catch {}
 
  const yesterday = getYesterday();
  let streak = s.streak || 0;
  // Streak-Logik: bricht wenn gestern nichts gemacht wurde
  if (s.date !== today && s.lastDoneDate && s.lastDoneDate !== yesterday && s.lastDoneDate !== today) {
    streak = 0;
  }
 
  if (s.date === today) {
    state = { date:today, todayIds: s.todayIds || pickQuests(today), doneToday: new Set(s.doneToday||[]),
      streak, lastDoneDate: s.lastDoneDate||null, xp: s.xp||0, totalXp: s.totalXp||0,
      level: s.level||1, bestStreak: s.bestStreak||0, totalDone: s.totalDone||0 };
  } else {
    state = { date:today, todayIds: pickQuests(today), doneToday: new Set(),
      streak, lastDoneDate: s.lastDoneDate||null, xp: s.xp||0, totalXp: s.totalXp||0,
      level: s.level||1, bestStreak: s.bestStreak||0, totalDone: s.totalDone||0 };
  }
}
 
function saveState() {
  localStorage.setItem('dq3', JSON.stringify({
    ...state, doneToday: [...state.doneToday]
  }));
}
 
function pickQuests(dateStr) {
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) seed += dateStr.charCodeAt(i) * (i+1);
  const arr = [...allQuests];
  // Fisher-Yates mit seed
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const j = ((seed >>> 0) % (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, QUESTS_PER_DAY).map(q => q.id);
}
 
// ── TOGGLE QUEST (via Modal) ──────────────────────────────────
function openModal(quest) {
  if (state.doneToday.has(quest.id)) return; // schon erledigt
  currentModalQuestId = quest.id;
  $('modalEmoji').textContent = quest.emoji;
  $('modalTitle').textContent = quest.text;
  $('modalTip').textContent   = QUEST_TIPS[quest.id] || 'Einfach machen – du schaffst das!';
  $('modalXp').textContent    = `+${quest.xp} XP`;
  $('modalBg').classList.add('show');
}
 
function completeQuest(id) {
  const quest = allQuests.find(q => q.id === id);
  if (!quest || state.doneToday.has(id)) return;
 
  state.doneToday.add(id);
  state.xp      += quest.xp;
  state.totalXp += quest.xp;
  state.totalDone++;
 
  // Streak
  if (state.lastDoneDate !== state.date) {
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    state.lastDoneDate = state.date;
    setTimeout(() => showToast(`🔥 ${state.streak} Tage Streak!`), 300);
  } else {
    showToast(`+${quest.xp} XP ✨`);
  }
 
  if ('vibrate' in navigator) navigator.vibrate([30, 20, 80]);
 
  // Level Up?
  const newLevel = Math.floor(state.totalXp / XP_PER_LEVEL) + 1;
  if (newLevel > state.level) {
    state.level = newLevel;
    setTimeout(() => showLevelUp(newLevel), 600);
  }
 
  saveState();
  renderHeader();
  renderList();
 
  // Alle erledigt? → Konfetti
  if (state.doneToday.size === state.todayIds.length) {
    setTimeout(launchConfetti, 400);
  }
}
 
// ── RENDER ────────────────────────────────────────────────────
function render() {
  renderHeader();
  renderList();
}
 
function renderHeader() {
  // Datum
  $('dateTxt').textContent = new Date().toLocaleDateString('de-AT',
    { weekday:'long', day:'numeric', month:'long' });
 
  // Streak
  $('streakNum').textContent = state.streak;
  $('streakPill').classList.toggle('active', state.streak > 0);
 
  // XP
  const xpIn = state.totalXp % XP_PER_LEVEL;
  const pct  = (xpIn / XP_PER_LEVEL) * 100;
  $('xpFill').style.width = pct + '%';
  $('xpGlow').style.left  = pct + '%';
  $('xpNum').textContent   = xpIn;
  $('levelTxt').textContent = `Level ${state.level}`;
 
  // Progress dots
  const dots = $('progressDots');
  dots.innerHTML = '';
  for (let i = 0; i < state.todayIds.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot' + (i < state.doneToday.size ? ' filled' : '');
    dots.appendChild(dot);
  }
 
  // Progress label
  $('progressTxt').textContent = `${state.doneToday.size} / ${state.todayIds.length} heute erledigt`;
 
  // Best streak & total
  $('bestStreakNum').textContent = state.bestStreak;
  $('totalDoneTxt').textContent  = `${state.totalDone} Aufgaben total erledigt`;
 
  // All done
  $('allDone').classList.toggle('show', state.doneToday.size === state.todayIds.length && state.todayIds.length > 0);
}
 
function renderList() {
  const list = $('questList');
  list.innerHTML = '';
 
  const todayQuests = state.todayIds
    .map(id => allQuests.find(q => q.id === id)).filter(Boolean)
    .sort((a,b) => (state.doneToday.has(a.id)?1:0) - (state.doneToday.has(b.id)?1:0));
 
  todayQuests.forEach(quest => {
    const done  = state.doneToday.has(quest.id);
    const [col, glow] = CAT_COLOR[quest.category] || ['#f59e0b','rgba(245,158,11,0.08)'];
 
    const card = document.createElement('div');
    card.className  = 'quest-card' + (done ? ' done' : '');
    card.style.setProperty('--cat-color', col);
    card.style.setProperty('--cat-glow',  glow);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', done ? 'true' : 'false');
 
    card.innerHTML = `
      <div class="quest-emoji" aria-hidden="true">${quest.emoji}</div>
      <div class="quest-info">
        <div class="quest-text">${quest.text}</div>
        <div class="quest-badges">
          <span class="quest-xp-badge">${done ? '✓ Erledigt' : '+' + quest.xp + ' XP'}</span>
          <span class="quest-cat-badge">${CAT_LABEL[quest.category]||quest.category}</span>
        </div>
      </div>
      <div class="quest-check" aria-hidden="true"></div>
    `;
 
    if (!done) {
      card.onclick    = () => openModal(quest);
      card.onkeydown  = e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); openModal(quest); } };
    }
 
    list.appendChild(card);
  });
}
 
// ── MODAL ─────────────────────────────────────────────────────
function setupModal() {
  $('modalBtnDone').onclick = () => {
    if (currentModalQuestId == null) return;
    // Card-Animation
    const cards = [...document.querySelectorAll('.quest-card')];
    const card  = cards.find(c => {
      const q = allQuests.find(q => q.id === currentModalQuestId);
      return q && c.querySelector('.quest-text')?.textContent === q.text;
    });
    if (card) {
      card.classList.add('pop');
      setTimeout(() => card.classList.remove('pop'), 450);
    }
    $('modalBg').classList.remove('show');
    completeQuest(currentModalQuestId);
    currentModalQuestId = null;
  };
  $('modalBtnClose').onclick = () => {
    $('modalBg').classList.remove('show');
    currentModalQuestId = null;
  };
  $('modalBg').onclick = e => {
    if (e.target === $('modalBg')) {
      $('modalBg').classList.remove('show');
      currentModalQuestId = null;
    }
  };
}
 
// ── LEVEL UP ──────────────────────────────────────────────────
function setupLevelUp() {
  $('luBtn').onclick = () => $('levelup').classList.remove('show');
}
function showLevelUp(level) {
  $('luLevel').textContent = `Level ${level}`;
  $('levelup').classList.add('show');
  if ('vibrate' in navigator) navigator.vibrate([100,60,100,60,200]);
}
 
// ── KONFETTI ──────────────────────────────────────────────────
function launchConfetti() {
  const canvas = $('confetti');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
 
  const colors  = ['#f59e0b','#f97316','#22c55e','#3b82f6','#a855f7','#ec4899','#fff'];
  const pieces  = Array.from({length: 120}, () => ({
    x:  Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    w:  6  + Math.random() * 8,
    h:  10 + Math.random() * 12,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    rot: Math.random() * 360,
    vr: (Math.random() - 0.5) * 8,
    opacity: 1,
  }));
 
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x   += p.vx;
      p.y   += p.vy;
      p.rot += p.vr;
      if (frame > 90) p.opacity -= 0.012;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (frame < 160) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}
 
// ── INSTALL ───────────────────────────────────────────────────
function setupInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    // Banner von oben reinpoppen nach 1.2s
    const banner = $('installBanner');
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('slide-in'), 1200);
  });
 
  $('installBtn').onclick = async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') showToast('App installiert! 🎉');
    deferredInstall = null;
    dismissBanner();
  };
  $('installDismiss').onclick = dismissBanner;
 
  window.addEventListener('appinstalled', () => {
    dismissBanner();
    showToast('Willkommen! 🎉');
  });
}
 
function dismissBanner() {
  const banner = $('installBanner');
  banner.classList.remove('slide-in');
  setTimeout(() => banner.classList.add('hidden'), 600);
}
 
// ── TOAST ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
 
// ── DATUM ─────────────────────────────────────────────────────
function getToday()     { return new Date().toISOString().split('T')[0]; }
function getYesterday() { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; }
 
// ── START ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
 