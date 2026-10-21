// ------------------------------------------------------------------
// Supabase Клієнт Конфігурація
// ------------------------------------------------------------------
const SUPABASE_URL = "https://fvbnnjghfiuiuulgoktn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ovn3IDEZzWj12AiyMRn1Mg_e5F-ysw7";
const EDGE_FUNCTION_URL = "https://fvbnnjghfiuiuulgoktn.supabase.co/functions/v1";

// ── Перевизначення часу для локального тестування ──
// Можна задати тут (new Date('2026-08-31T08:00:00')) або через URL: ?now=2026-10-21T10:00
const TEST_TIME = (() => {
  try {
    const param = new URLSearchParams(window.location.search).get('now');
    if (param) {
      const d = new Date(param);
      if (!isNaN(d)) return { fixed: d, startedAt: Date.now() };
    }
  } catch {}
  return null;
})();

// Якщо час перевизначено — годинник "іде" від заданого моменту.
function getNow() {
  if (TEST_TIME) return new Date(TEST_TIME.fixed.getTime() + (Date.now() - TEST_TIME.startedAt));
  return new Date();
}

let supabaseClient = null;
if (window.supabase && typeof window.supabase.createClient === 'function' && SUPABASE_URL.startsWith("https://")) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn("Supabase initialization skipped or failed:", e);
  }
}
