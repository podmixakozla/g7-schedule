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

const VALID_VIEWS = ['today', 'week', 'calendar', 'shame', 'visits'];

const URL_PARAMS = (() => {
  try { return new URLSearchParams(window.location.search); }
  catch { return new URLSearchParams(); }
})();

let currentUser = null;
// Завжди відкриваємо головну вкладку "Сьогодні" за замовчуванням (якщо явно не передано ?view=...)
let currentView = VALID_VIEWS.includes(URL_PARAMS.get('view') || '')
  ? URL_PARAMS.get('view')
  : 'today';
let currentGroup = ((URL_PARAMS.get('group') || '') in GROUP_LABELS)
  ? URL_PARAMS.get('group')
  : ((readStored('g7_group', '') in GROUP_LABELS) ? readStored('g7_group', '') : PRIMARY_GROUP);
let collapsedMonthsState = {};

// Розклад з БД (сирі рядки schedule_lessons). null — ще не завантажено.
let dbRawRows = null;
let scheduleLoaded = false;
let scheduleFromFallback = false;

let cachedShameEntries = [];
let shameLoaded = false;
let currentShameSubView = 'new';

let cachedVisits = [];
let visitsLoaded = false;
let currentVisitsSubView = 'timeline';
let visitLoggedThisSession = false;

const POPULAR_EMOJIS = ['🐳', '❤️', '😍', '😡', '😱', '🔥', '🥶', '💀', '👍', '👎'];
let userReactionsMap = {};     // entryId -> emoji

const commentsCache = {};      // entryId -> array of comments
const loadedComments = {};     // entryId -> bool (уже завантажено)

let particles = [];
let confettiLoopRunning = false;
