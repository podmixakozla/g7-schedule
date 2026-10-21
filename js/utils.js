// ------------------------------------------------------------------
// Утиліти: екранування, іконки, сповіщення, підтвердження, модалки
// ------------------------------------------------------------------

// Повне HTML-екранування (включно з лапками — безпечно і для атрибутів).
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Українська множина: plural(5, ['коментар', 'коментарі', 'коментарів'])
function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// "21 жовтня"
function formatDayMonth(date) {
  return `${date.getDate()} ${MONTH_GENITIVE[date.getMonth()]}`;
}

// Тривалість у секундах → "34:12", "2 год 05 хв", "3 дн 4 год"
function formatCountdown(totalSec) {
  totalSec = Math.max(0, Math.floor(totalSec));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d} дн ${h} год`;
  if (h > 0) return `${h} год ${pad2(m)} хв`;
  return `${pad2(m)}:${pad2(s)}`;
}

// ── Іконки (Lucide, MIT) ──
const ICON_PATHS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  barChart: '<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  board: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  smilePlus: '<path d="M22 11v1a10 10 0 1 1-9-10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01M16 5h6M19 2v6"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>'
};

function icon(name, size = 18, extraClass = '') {
  const paths = ICON_PATHS[name];
  if (!paths) return '';
  return `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// Замінює <span data-icon="name"> у статичній розмітці на SVG.
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.hydrated) return;
    const size = Number(el.dataset.iconSize) || (el.classList.contains('tab-icon') ? 22 : 18);
    el.innerHTML = icon(el.dataset.icon, size);
    el.dataset.hydrated = '1';
  });
}

// ── Telegram ──
function getTelegram() {
  return (window.Telegram && window.Telegram.WebApp) || null;
}

// SDK завантажується і в звичайному браузері, тому перевіряємо саме initData.
function isTelegramMiniApp() {
  const tg = getTelegram();
  return !!(tg && tg.initData);
}

function tgSupports(version) {
  const tg = getTelegram();
  try {
    return !!(tg && isTelegramMiniApp() && tg.isVersionAtLeast && tg.isVersionAtLeast(version));
  } catch {
    return false;
  }
}

function haptic(type = 'light') {
  const tg = getTelegram();
  if (!tg || !isTelegramMiniApp() || !tg.HapticFeedback) return;
  try {
    if (type === 'success' || type === 'error' || type === 'warning') tg.HapticFeedback.notificationOccurred(type);
    else tg.HapticFeedback.impactOccurred(type);
  } catch {}
}

// ── Сповіщення (замість alert) ──
function toast(message, type = 'info', timeoutMs = 3200) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const iconName = type === 'error' ? 'alert' : (type === 'success' ? 'check' : 'sparkles');
  el.innerHTML = `${icon(iconName, 18)}<span>${escapeHtml(message)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  if (type === 'error') haptic('error');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, timeoutMs);
}

// ── Підтвердження (нативне в Telegram, інакше confirm) ──
function uiConfirm(message) {
  const tg = getTelegram();
  if (tgSupports('6.2') && typeof tg.showConfirm === 'function') {
    return new Promise(resolve => {
      try { tg.showConfirm(message, ok => resolve(!!ok)); }
      catch { resolve(window.confirm(message)); }
    });
  }
  return Promise.resolve(window.confirm(message));
}

// ── Модальні вікна (bottom sheet на мобільних + Telegram BackButton) ──
function syncTelegramBackButton() {
  const tg = getTelegram();
  if (!tg || !tgSupports('6.1') || !tg.BackButton) return;
  const hasOverlay = !!(document.querySelector('.sheet-backdrop.open') || document.getElementById('photoLightbox'));
  try {
    if (hasOverlay) tg.BackButton.show();
    else tg.BackButton.hide();
  } catch {}
}

function openSheet(backdrop) {
  if (!backdrop) return;
  backdrop.classList.add('open');
  document.body.classList.add('no-scroll');
  syncTelegramBackButton();
}

function closeSheet(backdrop) {
  if (!backdrop) return;
  backdrop.classList.remove('open');
  if (!document.querySelector('.sheet-backdrop.open')) {
    document.body.classList.remove('no-scroll');
  }
  syncTelegramBackButton();
}

// Закриває верхній відкритий шар (лайтбокс → пікер → модалка). Повертає true, якщо щось закрито.
function closeTopLayer() {
  if (document.getElementById('photoLightbox')) { closeLightbox(); return true; }
  if (typeof activePickerEl !== 'undefined' && activePickerEl) { closeReactionPicker(); return true; }
  const menu = document.querySelector('.user-menu.open');
  if (menu) { menu.classList.remove('open'); return true; }
  const open = Array.from(document.querySelectorAll('.sheet-backdrop.open')).pop();
  if (open) {
    if (open.id === 'shameModal') closeShameModal();
    else if (open.id === 'authOverlay') hideAuthOverlay();
    else if (open.id === 'scheduleAdminModal') closeScheduleAdminModal();
    else closeSheet(open);
    return true;
  }
  return false;
}
