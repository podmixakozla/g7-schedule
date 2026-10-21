// ------------------------------------------------------------------
// App Bootstrap, Liquid Glass Theme Sync (Telegram themeParams) & Views
// ------------------------------------------------------------------

function hexToRgbTriplet(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b].some(isNaN) ? null : `${r}, ${g}, ${b}`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b].some(isNaN) ? null : `${r}, ${g}, ${b}`;
  }
  return null;
}

function applyTelegramThemeParams(scheme) {
  const tg = getTelegram();
  const metaTheme = document.getElementById('metaThemeColor');
  const activeBg = scheme === 'light' ? '#F3F4F8' : '#121212';
  if (metaTheme) metaTheme.setAttribute('content', activeBg);

  if (tg && tgSupports('6.1')) {
    try {
      tg.setHeaderColor(activeBg);
      tg.setBackgroundColor(activeBg);
    } catch {}
  }
}

function updateThemeToggleButton(scheme) {
  const btn = document.getElementById('btnThemeToggle');
  if (!btn) return;
  btn.innerHTML = icon(scheme === 'dark' ? 'sun' : 'moon', 18);
  btn.title = scheme === 'dark' ? 'Світла тема' : 'Темна тема';
}

function syncTheme(forcedScheme) {
  const urlTheme = (typeof URL_PARAMS !== 'undefined') ? URL_PARAMS.get('theme') : null;
  const saved = readStored('g7_theme', '');
  let scheme = forcedScheme || (urlTheme === 'light' || urlTheme === 'dark' ? urlTheme : null);

  if (!scheme) {
    scheme = (saved === 'light' || saved === 'dark') ? saved : 'dark';
  }

  document.documentElement.dataset.theme = scheme;
  applyTelegramThemeParams(scheme);
  updateThemeToggleButton(scheme);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  writeStored('g7_theme', next);
  haptic('light');
  syncTheme(next);
}

function setViewMode(mode, { silent = false } = {}) {
  if (!VALID_VIEWS.includes(mode)) mode = 'today';
  if (mode === 'visits' && !(currentUser && currentUser.is_admin)) {
    mode = 'today';
  }
  currentView = mode;
  if (!silent) haptic('light');

  document.querySelectorAll('.tab[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });

  const schedEl = document.getElementById('scheduleContainer');
  const calEl = document.getElementById('calendarContainer');
  const shameEl = document.getElementById('shameContainer');
  const visitsEl = document.getElementById('visitsContainer');

  schedEl.hidden = !(mode === 'week' || mode === 'today');
  calEl.hidden = mode !== 'calendar';
  shameEl.hidden = mode !== 'shame';
  if (visitsEl) visitsEl.hidden = mode !== 'visits';

  if (mode === 'week' || mode === 'today') {
    renderSchedule();
  } else if (mode === 'calendar') {
    renderCalendar();
  } else if (mode === 'shame') {
    loadShameEntries();
  } else if (mode === 'visits') {
    loadAdminVisits();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTopLayer();
});

document.addEventListener('DOMContentLoaded', async () => {
  hydrateIcons();
  syncTheme();

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!readStored('g7_theme', '')) syncTheme();
    });
  }

  const tg = getTelegram();
  if (tg && isTelegramMiniApp()) {
    try {
      tg.ready();
      tg.expand();
      if (tg.onEvent) tg.onEvent('themeChanged', () => syncTheme(tg.colorScheme));
      if (tgSupports('6.1') && tg.BackButton) {
        tg.BackButton.onClick(() => closeTopLayer());
      }
    } catch {}
  }

  setViewMode(currentView, { silent: true });
  await initSchedule();
  updateClockAndCountdown(true);
  setInterval(updateClockAndCountdown, 1000);
  await initAuth();
  logCurrentVisit();
});
