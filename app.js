'use strict';
// ============================================================
// app.js – Daily Quests PWA
// Prinzip: Immer nur 1 Aufgabe sichtbar. Erst nach "Erledigt"
// kommt sofort eine neue zufällige Aufgabe. Beliebig viele pro Tag.
// Streak: +1 pro Tag an dem mindestens 1 Quest erledigt wurde.
// ============================================================

const XP_PER_LEVEL = 100;

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
  health: '#ef4444',
  move:   '#22c55e',
  mind:   '#3b82f6',
  social: '#f59e0b',
  focus:  '#a855f7',
};
const CAT_LABEL = { health:'Health', move:'Move', mind:'Mind', social:'Social', focus:'Focus' };

let allQuests = [];
let state     = null;
let deferredInstall = null;
let currentQuest = null; // die aktuell angezeigte Quest (Objekt aus allQuests)

const $ = id => document.getElementById(id);

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('./sw.js').catch(console.warn);

  allQuests = await fetch('./quests.json').then(r => r.json()).catch(() => []);

  loadState();
  renderHeader();
  pickAndShowQuest(false); // erste Anzeige ohne Wechsel-Animation
  setupInstall();
  setupButtons();

  const idx = new Date().getDay();
  $('motivationQuote').textContent = MOTIVATIONS[idx % MOTIVATIONS.length];
}

// ── STATE laden ──────────────────────────────────────────────
function loadState() {
  const today     = getToday();
  const yesterday = getYesterday();
  let s = {};
  try { s = JSON.parse(localStorage.getItem('dq_oneatatime') || '{}'); } catch {}

  // Streak verloren wenn gestern (und nicht heute) zuletzt etwas gemacht wurde
  let streak = s.streak || 0;
  if (s.lastDoneDate && s.lastDoneDate !== today && s.lastDoneDate !== yesterday) {
    streak = 0;
  }

  state = {
    date:         today,
    doneTodayCount: (s.date === today) ? (s.doneTodayCount || 0) : 0,
    completedIds: (s.date === today) ? (s.completedIds || []) : [],
    streak,
    lastDoneDate: s.lastDoneDate || null,
    xp:           s.xp || 0,
    totalXp:      s.totalXp || 0,
    level:        s.level || 1,
    bestStreak:   s.bestStreak || 0,
    totalDone:    s.totalDone || 0,
    lastQuestId:  s.lastQuestId ?? null,
  };
}

function saveState() {
  localStorage.setItem('dq_oneatatime', JSON.stringify(state));
}

// ── Zufällige Quest auswählen (vermeidet direkte Wiederholung) ──
function pickRandomQuest() {
  if (!allQuests.length) return null;
  let pool = allQuests;
  if (allQuests.length > 1 && state.lastQuestId != null) {
    pool = allQuests.filter(q => q.id !== state.lastQuestId);
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  state.lastQuestId = q.id;
  saveState();
  return q;
}

// ── Quest anzeigen ────────────────────────────────────────────
function pickAndShowQuest(animate) {
  currentQuest = pickRandomQuest();
  if (!currentQuest) {
    $('qText').textContent = 'Keine Aufgaben verfügbar – quests.json prüfen.';
    return;
  }

  const card = $('questCurrent');
  const color = CAT_COLOR[currentQuest.category] || '#f59e0b';
  card.style.setProperty('--cat-color', color);
  card.style.setProperty('--cat-glow', color + '22');

  const renderContent = () => {
    $('qCatTag').textContent  = CAT_LABEL[currentQuest.category] || currentQuest.category;
    $('qEmoji').textContent   = currentQuest.emoji;
    $('qText').textContent    = currentQuest.text;
    $('qXp').textContent      = `+${currentQuest.xp} XP`;
    $('qTip').textContent     = '💡 ' + (currentQuest.tip || 'Einfach machen – du schaffst das!');
    $('qDoneBtn').disabled    = false;
    $('qDoneBtn').classList.remove('completing');
  };

  if (animate) {
    card.classList.add('leaving');
    setTimeout(() => {
      renderContent();
      card.classList.remove('leaving');
      // Re-trigger Entry-Animation
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = '';
      $('qEmoji').classList.add('swap');
      setTimeout(() => $('qEmoji').classList.remove('swap'), 500);
    }, 280);
  } else {
    renderContent();
  }
}

// ── Quest abschließen ────────────────────────────────────────
function completeCurrentQuest() {
  if (!currentQuest) return;
  const quest = currentQuest;

  $('qDoneBtn').disabled = true;
  $('qDoneBtn').classList.add('completing');

  state.completedIds.push(quest.id);
  state.doneTodayCount++;
  state.xp      += quest.xp;
  state.totalXp += quest.xp;
  state.totalDone++;

  // Streak: nur einmal pro Tag erhöhen
  const today = getToday();
  if (state.lastDoneDate !== today) {
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    state.lastDoneDate = today;
    setTimeout(() => showToast(`🔥 ${state.streak} Tage Streak!`), 500);
  } else {
    showToast(`+${quest.xp} XP ✨`);
  }

  // Level-Up?
  const newLevel = Math.floor(state.totalXp / XP_PER_LEVEL) + 1;
  let leveledUp = false;
  if (newLevel > state.level) {
    state.level = newLevel;
    leveledUp = true;
  }

  if ('vibrate' in navigator) navigator.vibrate([30, 20, 80]);

  saveState();
  renderHeader();
  bumpTodayCount();

  // Konfetti bei jedem Abschluss (kleine Belohnung)
  launchConfetti();

  // Nächste Quest nach kurzer Pause anzeigen
  setTimeout(() => {
    pickAndShowQuest(true);
    if (leveledUp) setTimeout(() => showLevelUp(state.level), 500);
  }, 700);
}

// ── Skip: andere Aufgabe ohne Abschluss ───────────────────────
function skipQuest() {
  pickAndShowQuest(true);
}

// ── Header rendern ────────────────────────────────────────────
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

  $('todayCount').textContent = state.doneTodayCount;
  $('bestStreakNum').textContent = state.bestStreak;
  $('totalDoneTxt').textContent  = `${state.totalDone} Aufgaben total erledigt`;
}

function bumpTodayCount() {
  const el = $('todayCount');
  el.textContent = state.doneTodayCount;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// ── Buttons ───────────────────────────────────────────────────
function setupButtons() {
  $('qDoneBtn').addEventListener('click', completeCurrentQuest);
  $('qSkipBtn').addEventListener('click', skipQuest);
  $('luBtn').addEventListener('click', () => $('levelup').classList.remove('show'));
}

// ── Level-Up ──────────────────────────────────────────────────
function showLevelUp(level) {
  $('luLevel').textContent = `Level ${level}`;
  $('levelup').classList.add('show');
  if ('vibrate' in navigator) navigator.vibrate([100, 60, 100, 60, 200]);
}

// ── Konfetti ──────────────────────────────────────────────────
function launchConfetti() {
  const canvas = $('confetti');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#f59e0b','#f97316','#22c55e','#3b82f6','#a855f7','#ec4899','#fff'];
  const pieces = Array.from({ length: 80 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 100,
    y: canvas.height * 0.35,
    w: 5 + Math.random() * 7,
    h: 8 + Math.random() * 10,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 9,
    vy: -6 - Math.random() * 5,
    rot: Math.random() * 360,
    vr: (Math.random() - 0.5) * 10,
    opacity: 1,
  }));

  let frame = 0;
  const gravity = 0.35;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.vy += gravity;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (frame > 50) p.opacity -= 0.02;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (frame < 110) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── PWA Install Banner ─────────────────────────────────────────
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

// ── Datum-Helfer ──────────────────────────────────────────────
function getToday()     { return new Date().toISOString().split('T')[0]; }
function getYesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }

// ── Start ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
