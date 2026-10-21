// ------------------------------------------------------------------
// Telegram Auth Layer
// Керує сесією, оновленням JWT, викликами захищених Edge Functions
// та відображенням профілю в шапці.
// ------------------------------------------------------------------

const TELEGRAM_SVG = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.95 7.47-1.97 9.28c-.15.67-.54.83-1.09.52l-3.02-2.22-1.46 1.4c-.16.16-.3.3-.61.3l.22-3.06 5.56-5.02c.24-.22-.05-.33-.37-.14l-6.87 4.32-2.97-.93c-.64-.2-.65-.64.13-.95l11.61-4.48c.54-.2 1.01.13.83.95z"/></svg>';

function showAuthOverlay() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;

  const inTelegram = isTelegramMiniApp();
  const notice = !inTelegram
    ? `<div class="form-note">${icon('alert', 16)}<span>Сайт відкрито у звичайному браузері. Авторизація працює, коли відкрити бота у Telegram.</span></div>`
    : '';

  overlay.innerHTML = `
    <div class="sheet sheet-sm" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h2 class="sheet-title">Вхід</h2>
        <button class="btn btn-icon btn-ghost" onclick="hideAuthOverlay()" aria-label="Закрити">${icon('close', 18)}</button>
      </div>
      <div class="auth-sheet-body">
        <div class="auth-emblem">${TELEGRAM_SVG}</div>
        <h3 class="auth-heading">Увійдіть через Telegram</h3>
        <p class="auth-desc">Щоб залишати реакції, коментарі, додавати пости на дошку та редагувати розклад підгрупи.</p>
        ${notice}
        <div class="form-error" id="authError" hidden></div>
        <button class="btn btn-telegram btn-block btn-lg" id="btnTelegramAuth" onclick="authenticateWithTelegram()">
          ${TELEGRAM_SVG}<span>Увійти через Telegram</span>
        </button>
      </div>
    </div>
  `;
  overlay.onclick = (e) => { if (e.target === overlay) hideAuthOverlay(); };
  openSheet(overlay);
}

function hideAuthOverlay() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  closeSheet(overlay);
  overlay.innerHTML = '';
  overlay.onclick = null;
}

function showAuthError(msg) {
  const errEl = document.getElementById('authError');
  if (!errEl) return;
  errEl.textContent = msg || '';
  errEl.hidden = !msg;
}

function persistSession(user, session) {
  currentUser = user;
  try {
    localStorage.setItem('g7_auth_token', session.access_token);
    localStorage.setItem('g7_refresh_token', session.refresh_token || '');
    localStorage.setItem('g7_user', JSON.stringify(user));
  } catch {}
}

function clearStoredSession() {
  currentUser = null;
  try {
    localStorage.removeItem('g7_auth_token');
    localStorage.removeItem('g7_refresh_token');
    localStorage.removeItem('g7_user');
  } catch {}
}

async function authenticateWithTelegram() {
  const tg = getTelegram();
  if (!tg || !tg.initData) {
    showAuthError('Відкрийте цей сайт через Telegram-бота, щоб увійти.');
    return;
  }

  try {
    tg.ready();
    tg.expand();
  } catch {}

  const btn = document.getElementById('btnTelegramAuth');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>Входимо…</span>';
  }

  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/validate-telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ initData: tg.initData }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Помилка автентифікації');

    persistSession(data.user, data.session);
    await syncSupabaseSession(data.session.access_token, data.session.refresh_token);

    hideAuthOverlay();
    updateAuthUI();
    toast('Ви увійшли', 'success');
  } catch (err) {
    console.error('Auth error:', err);
    showAuthError(err.message || 'Помилка входу');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${TELEGRAM_SVG}<span>Увійти через Telegram</span>`;
    }
  }
}

async function restoreSession() {
  const savedToken = readStored('g7_auth_token', '');
  const savedRefresh = readStored('g7_refresh_token', '');
  const savedUser = readStored('g7_user', '');

  if (savedToken && savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      const synced = await syncSupabaseSession(savedToken, savedRefresh);
      if (synced) {
        updateAuthUI();
        return true;
      }

      // Якщо setSession не освіжив токен — перевіримо токен напряму
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${savedToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
      });
      if (response.ok) {
        updateAuthUI();
        return true;
      }
      clearStoredSession();
    } catch {
      clearStoredSession();
    }
  }

  // Авто-вхід при відкритті в Telegram Mini App
  if (isTelegramMiniApp()) {
    const tg = getTelegram();
    try {
      const response = await fetch(`${EDGE_FUNCTION_URL}/validate-telegram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ initData: tg.initData }),
      });
      const data = await response.json();
      if (response.ok && data.session) {
        persistSession(data.user, data.session);
        await syncSupabaseSession(data.session.access_token, data.session.refresh_token);
        updateAuthUI();
        return true;
      }
    } catch {}
  }

  currentUser = null;
  updateAuthUI();
  return false;
}

async function logout() {
  clearStoredSession();
  if (supabaseClient) {
    try { await supabaseClient.auth.signOut(); } catch {}
  }
  updateAuthUI();
  toast('Ви вийшли з облікового запису');
}

function getUserDisplayName(user = currentUser) {
  if (!user) return '';
  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();
  if (first && last) return `${first} ${last}`;
  return first || user.username || 'Користувач';
}

function getUserInitials(user = currentUser) {
  const name = getUserDisplayName(user);
  if (!name) return '?';
  const parts = name.split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function renderUserSlot() {
  const slot = document.getElementById('userSlot');
  if (!slot) return;

  if (!currentUser) {
    slot.innerHTML = `
      <button class="btn btn-secondary btn-sm user-login-btn" onclick="showAuthOverlay()" title="Увійти через Telegram" aria-label="Увійти через Telegram">
        ${TELEGRAM_SVG}<span class="user-login-text">Увійти</span>
      </button>
    `;
    return;
  }

  const name = getUserDisplayName();
  const initials = getUserInitials();
  const isAdmin = !!currentUser.is_admin;

  slot.innerHTML = `
    <div class="user-box">
      <button class="user-btn" type="button" onclick="toggleUserMenu(event)" aria-label="Профіль">
        <span class="user-avatar">${escapeHtml(initials)}</span>
        <span class="user-name">${escapeHtml(name)}</span>
        ${isAdmin ? '<span class="user-badge" title="Адміністратор">Admin</span>' : ''}
      </button>
      <div class="user-menu" id="userMenu">
        <div class="user-menu-head">
          <div class="user-menu-name">${escapeHtml(name)}</div>
          <div class="user-menu-role">${isAdmin ? 'Адміністратор' : 'Студент'}</div>
        </div>
        <button type="button" class="user-menu-item is-danger" onclick="logout()">
          ${icon('logout', 16)}<span>Вийти</span>
        </button>
      </div>
    </div>
  `;
}

function toggleUserMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('userMenu');
  if (menu) menu.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenu');
  if (menu && !e.target.closest('.user-box')) menu.classList.remove('open');
});

function updateAuthUI() {
  renderUserSlot();

  const btnClearBoard = document.getElementById('btnClearBoard');
  if (btnClearBoard) {
    btnClearBoard.hidden = !(currentUser && currentUser.is_admin);
  }

  if (currentUser) {
    refreshUserReactions().then(() => {
      if (shameLoaded) renderShameGrid(getFilteredShameEntries(cachedShameEntries));
    });
  } else {
    userReactionsMap = {};
    if (shameLoaded) renderShameGrid(getFilteredShameEntries(cachedShameEntries));
  }

  if (currentView === 'week' || currentView === 'today') {
    renderSchedule();
  }
}

async function initAuth() {
  if (supabaseClient && supabaseClient.auth && supabaseClient.auth.onAuthStateChange) {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session && session.access_token) {
        try {
          localStorage.setItem('g7_auth_token', session.access_token);
          if (session.refresh_token) localStorage.setItem('g7_refresh_token', session.refresh_token);
        } catch {}
      }
    });
  }
  await restoreSession();
}

async function syncSupabaseSession(accessToken, refreshToken) {
  if (!supabaseClient || !accessToken) return false;
  try {
    const { data, error } = await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken || '',
    });
    if (error || !data || !data.session) return false;
    try {
      localStorage.setItem('g7_auth_token', data.session.access_token);
      if (data.session.refresh_token) localStorage.setItem('g7_refresh_token', data.session.refresh_token);
    } catch {}
    return true;
  } catch {
    return false;
  }
}

// Повертає свіжий access_token (оновлюючи сесію через Supabase при потребі).
async function getFreshAccessToken() {
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session && data.session.access_token) {
        return data.session.access_token;
      }
    } catch {}
  }
  return readStored('g7_auth_token', '');
}

function getAuthHeaders() {
  const token = readStored('g7_auth_token', '');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Виклик захищеної Edge Function з автоматичним оновленням токена.
async function callEdgeFunction(name, payload = {}) {
  const token = await getFreshAccessToken();
  if (!token) {
    showAuthOverlay();
    throw new Error('Потрібна авторизація');
  }

  const response = await fetch(`${EDGE_FUNCTION_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let data = {};
  try { data = await response.json(); } catch {}

  if (!response.ok) {
    throw new Error(data.error || `Помилка (${response.status})`);
  }
  return data;
}
