// ------------------------------------------------------------------
// Глобальний змінний стан застосунку
// ------------------------------------------------------------------

function readStored(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

const VALID_VIEWS = ['today', 'week', 'calendar', 'shame', 'visits', 'starosta'];

const URL_PARAMS = (() => {
  try { return new URLSearchParams(window.location.search); }
  catch { return new URLSearchParams(); }
})();

function resolveCurrentGroup() {
  const urlG = URL_PARAMS.get('group');
  if (urlG && urlG in GROUP_LABELS) return urlG;
  if (currentUser && currentUser.user_group && currentUser.user_group in GROUP_LABELS) {
    return currentUser.user_group;
  }
  let guestG = readStored('g7_guest_group', '');
  if (!guestG) {
    const legacy = readStored('g7_group', '');
    if (legacy && legacy in GROUP_LABELS) {
      guestG = legacy;
      writeStored('g7_guest_group', legacy);
    }
  }
  if (guestG && guestG in GROUP_LABELS) {
    return guestG;
  }
  return PRIMARY_GROUP;
}

function hasExplicitGroup() {
  if (currentUser) {
    return Boolean(currentUser.user_group && currentUser.user_group in GROUP_LABELS);
  }
  const guestG = readStored('g7_guest_group', '') || readStored('g7_group', '');
  return Boolean(guestG && guestG in GROUP_LABELS);
}

let currentUser = null;
// Завжди відкриваємо головну вкладку "Сьогодні" за замовчуванням (якщо явно не передано ?view=...)
let currentView = VALID_VIEWS.includes(URL_PARAMS.get('view') || '')
  ? URL_PARAMS.get('view')
  : 'today';
let currentGroup = resolveCurrentGroup();
let collapsedMonthsState = {};

// Розклад з БД (сирі рядки schedule_lessons). null — ще не завантажено.
let dbRawRows = null;
let scheduleLoaded = false;
let scheduleFromFallback = false;

let cachedShameEntries = [];
let shameLoaded = false;
let currentShameSubView = 'new';

let cachedVisits = [];
let cachedAdminUsers = [];
let visitsLoaded = false;
let currentVisitsSubView = 'timeline';
let visitLoggedThisSession = false;

let activeAnnouncement = null;
let cachedAnnouncements = [];
let announcementExpanded = false;

let scheduleChangeMeta = null; // { changedAt: string, summaryByGroup: Record<string, string[]> }

const POPULAR_EMOJIS = ['🐳', '❤️', '😍', '😡', '😱', '🔥', '🥶', '💀', '👍', '👎'];
let userReactionsMap = {};     // entryId -> emoji

const commentsCache = {};      // entryId -> array of comments
const loadedComments = {};     // entryId -> bool (уже завантажено)

let particles = [];
let confettiLoopRunning = false;
