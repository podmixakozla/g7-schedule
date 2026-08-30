// ------------------------------------------------------------------
// Supabase Клієнт Конфігурація (renamed to avoid collisions)
// ------------------------------------------------------------------
const SUPABASE_URL = "https://fvbnnjghfiuiuulgoktn.supabase.co"; // Замініть на свій Project URL
const SUPABASE_ANON_KEY = "sb_publishable_ovn3IDEZzWj12AiyMRn1Mg_e5F-ysw7";                  // Замініть на свій Anon Key

let supabaseClient = null;
if (window.supabase && typeof window.supabase.createClient === 'function' && SUPABASE_URL.startsWith("https://")) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn("Supabase initialization skipped or failed:", e);
  }
}
