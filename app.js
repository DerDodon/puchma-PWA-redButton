'use strict';
// ============================================================
// app.js – Daily Quests PWA
// Fix: Karten werden über data-quest-id gefunden (nicht über Text)
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
];

const CAT_COLOR = {
  health: ['#ef4444','rgba(239,68,68,0.08)'],
  move:   ['#22c55e','rgba(34,197,94,0.08)'],
  mind:   ['#3b82f6','rgba(59,130,246,0.08)'],
  social: ['#f59e0b','rgba(245,158,11,0.08)'],
  focus:  ['#a855f7','rgba(168,85,247,0.08)'],
};
const CAT_LABEL = { health:'Health', move:'Move', mind:'Mind', social:'Social', focus:'Focus' };

let allQuests = [];
let state     = null;
let deferredInstall = null;
let currentModalQuestId = null;

const $ = id => document.getElementById(id);

async function init() {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('./sw.js').catch(console.warn);

  allQuests = await fetch('./quests.json').then(r => r.json()).catch(() => []);

  loadState();
  render();
  setupInstall();
  setupModal();
  $('luBtn').onclick = () => $('levelup').classList.remove('show');

  const idx = new Date().getDay();
  $('motivationQuote').textContent = MOTIVATIONS[idx % MOTIVATIONS.length];
}

function loadState() {
  const today     = getToday();
  const yesterday = getYesterday();
  let s = {};
  try { s = JSON.parse(localStorage.getItem('dq3') || '{}'); } catch {}

  let streak = s.streak || 0;
  if (s.date !== today && s.lastDoneDate && s.lastDoneDate !== yesterday) {
    streak = 0;
  }

  if (s.date === today) {
    state = {
      date: today,
      todayIds: (s.todayIds && s.todayIds.length) ? s.todayIds : pickQuests(today),
      doneToday: new Set(s.doneToday || []),
      streak,
      lastDoneDate: s.lastDoneDate || null,
      xp: s.xp || 0, totalXp: s.totalXp || 0, level: s.level || 1,
      bestStreak: s.bestStreak || 0, totalDone: s.totalDone || 0,
    };
  } else {
    state = {
      date: today,
      todayIds: pickQuests(today),
      doneToday: new Set(),
      streak,
      lastDoneDate: s.lastDoneDate || null,
      xp: s.xp || 0, totalXp: s.totalXp || 0, level: s.level || 1,
      bestStreak: s.bestStreak || 0, totalDone: s.totalDone || 0,
    };
  }
}

function saveState() {
  localStorage.setItem('dq3', JSON.stringify({ ...state, doneToday: [...state.doneToday] }));
}

function pickQuests(dateStr) {
  if (!allQuests.length) return [];
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) seed += dateStr.charCodeAt(i) * (i + 1);

  const arr = [...allQuests];
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const j = ((seed >>> 0) % (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(QUESTS_PER_DAY, arr.length)).map(q => q.id);
}

function openModal(quest) {
  if (state.doneToday.has(quest.id)) return;
  currentModalQuestId = quest.id;
  $('modalEmoji').textContent = quest.emoji;
  $('modalTitle').textContent = quest.text;
  $('modalTip').textContent   = quest.tip || 'Einfach machen – du schaffst das!';
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

  if (state.lastDoneDate !== state.date) {
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    state.lastDoneDate = state.date;
    setTimeout(() => showToast(`🔥 ${state.streak} Tage Streak!`), 300);
  } else {
    showToast(`+${quest.xp} XP ✨`);
  }

  const newLevel = Math.floor(state.totalXp / XP_PER_LEVEL) + 1;
  if (newLevel > state.level) {
    state.level = newLevel;
    setTimeout(() => showLevelUp(newLevel), 700);
  }

  if ('vibrate' in navigator) navigator.vibrate([30, 20, 80]);

  saveState();
  renderHeader();
  renderList();

  if (state.doneToday.size === state.todayIds.length) {
    setTimeout(launchConfetti, 400);
  }
}

function render() { renderHeader(); renderList(); }

function renderHeader() {
  $('dateTxt').textContent = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
  $('streakNum').textContent = state.streak;
  $('streakPill').classList.toggle('active', state.streak > 0);

  const xpIn = state.totalXp % XP_PER_LEVEL;
  const pct  = (xpIn / XP_PER_LEVEL) * 100;
  $('xpFill').style.width  = pct + '%';
  $('xpGlow').style.left   = pct + '%';
  $('xpNum').textContent   = xpIn;
  $('levelTxt').textContent = `Level ${state.level}`;

  const dots = $('progressDots');
  dots.innerHTML = '';
  for (let i = 0; i < state.todayIds.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot' + (i < state.doneToday.size ? ' filled' : '');
    dots.appendChild(dot);
  }

  $('progressTxt').textContent = `${state.doneToday.size} / ${state.todayIds.length} heute erledigt`;
  $('bestStreakNum').textContent = state.bestStreak;
  $('totalDoneTxt').textContent  = `${state.totalDone} Aufgaben total erledigt`;

  const allDone = state.doneToday.size === state.todayIds.length && state.todayIds.length > 0;
  $('allDone').classList.toggle('show', allDone);
}

function renderList() {
  const list = $('questList');
  list.innerHTML = '';

  if (!state.todayIds.length) {
    list.innerHTML = `<p style="color:#a3a3a3;text-align:center;padding:20px;">Keine Quests verfügbar. quests.json prüfen.</p>`;
    return;
  }

  const todayQuests = state.todayIds
    .map(id => allQuests.find(q => q.id === id))
    .filter(Boolean)
    .sort((a, b) => (state.doneToday.has(a.id) ? 1 : 0) - (state.doneToday.has(b.id) ? 1 : 0));

  todayQuests.forEach(quest => {
    const done = state.doneToday.has(quest.id);
    const [col, glow] = CAT_COLOR[quest.category] || ['#f59e0b', 'rgba(245,158,11,0.08)'];

    const card = document.createElement('div');
    card.className = 'quest-card' + (done ? ' done' : '');
    card.dataset.questId = String(quest.id);
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
          <span class="quest-cat-badge">${CAT_LABEL[quest.category] || quest.category}</span>
        </div>
      </div>
      <div class="quest-check" aria-hidden="true"></div>
    `;

    if (!done) {
      card.addEventListener('click', () => openModal(quest));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(quest); }
      });
    }

    list.appendChild(card);
  });
}

function setupModal() {
  $('modalBtnDone').addEventListener('click', () => {
    if (currentModalQuestId == null) return;
    const id = currentModalQuestId;
    $('modalBg').classList.remove('show');

    const card = document.querySelector(`.quest-card[data-quest-id="${id}"]`);
    if (card) {
      card.classList.add('pop');
      setTimeout(() => card.classList.remove('pop'), 450);
    }

    currentModalQuestId = null;
    completeQuest(id);
  });

  $('modalBtnClose').addEventListener('click', () => {
    $('modalBg').classList.remove('show');
    currentModalQuestId = null;
  });

  $('modalBg').addEventListener('click', e => {
    if (e.target === $('modalBg')) {
      $('modalBg').classList.remove('show');
      currentModalQuestId = null;
    }
  });
}

function showLevelUp(level) {
  $('luLevel').textContent = `Level ${level}`;
  $('levelup').classList.add('show');
  if ('vibrate' in navigator) navigator.vibrate([100, 60, 100, 60, 200]);
}

function launchConfetti() {
  const canvas = $('confetti');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#f59e0b','#f97316','#22c55e','#3b82f6','#a855f7','#ec4899','#fff'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    w: 6 + Math.random() * 8,
    h: 10 + Math.random() * 12,
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
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (frame > 90) p.opacity -= 0.012;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (frame < 160) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function setupInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    const banner = $('installBanner');
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('slide-in'), 1500);
  });

  $('installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') showToast('App installiert! 🎉');
    deferredInstall = null;
    dismissBanner();
  });

  $('installDismiss').addEventListener('click', dismissBanner);

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

function getToday()     { return new Date().toISOString().split('T')[0]; }
function getYesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }

document.addEventListener('DOMContentLoaded', init);
