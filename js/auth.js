// ------------------------------------------------------------------
// Telegram Auth Layer
// Uses global `currentUser` from state.js
// ------------------------------------------------------------------

const TELEGRAM_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.95 7.47l-1.97 9.28c-.15.67-.54.83-1.09.52l-3.02-2.22-1.46 1.4c-.16.16-.3.3-.61.3l.22-3.06 5.56-5.02c.24-.22-.05-.33-.37-.14l-6.87 4.32-2.97-.93c-.64-.2-.65-.64.13-.95l11.61-4.48c.54-.2 1.01.13.83.95z"/></svg>';

function isTelegramMiniApp() {
  return !!(window.Telegram && window.Telegram.WebApp);
}

function showAuthOverlay() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;

  const inTelegram = isTelegramMiniApp();

  let noticeHtml = '';
  if (!inTelegram) {
    noticeHtml = `
      <div class="auth-notice">
        <strong>🌐 Відкрито у браузері</strong><br>
        Авторизація через Telegram доступна, коли сайт відкритий у Telegram-боті. Ви можете закрити це вікно та продовжити перегляд.
      </div>
    `;
  }

  overlay.innerHTML = `
    <div class="auth-box" onclick="event.stopPropagation()">
      <div class="auth-header-strip">
        <span class="auth-modal-title">🔐 Авторизація</span>
        <button class="auth-close-btn" onclick="hideAuthOverlay()" title="Закрити">✕</button>
      </div>
      <div class="auth-body">
        <div class="auth-telegram-icon">${TELEGRAM_SVG}</div>
        <h2 class="auth-title">ВХІД ЧЕРЕЗ TELEGRAM</h2>
        <p class="auth-subtitle">Щоб реагувати, коментувати та додавати записи на дошку ганьби</p>
        <div class="auth-divider"></div>
        ${noticeHtml}
        <button class="auth-telegram-btn" onclick="authenticateWithTelegram()">
          ${TELEGRAM_SVG} УВІЙТИ ЧЕРЕЗ TELEGRAM
        </button>
      </div>
    </div>
  `;
  overlay.classList.add('open');
  overlay.onclick = hideAuthOverlay;
}

function hideAuthOverlay() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.innerHTML = '';
  overlay.onclick = null;
}

function showAuthError(msg) {
  const box = document.querySelector('.auth-box');
  if (!box) return;
  let errEl = box.querySelector('.auth-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'auth-error';
    const btn = box.querySelector('.auth-telegram-btn');
    if (btn) {
      btn.parentNode.insertBefore(errEl, btn);
    } else {
      box.querySelector('.auth-body').appendChild(errEl);
    }
  }
  errEl.textContent = msg;
}

async function authenticateWithTelegram() {
  if (!window.Telegram || !window.Telegram.WebApp) {
    showAuthError('Відкрийте цей сайт через Telegram-бот, щоб увійти.');
    console.warn('authenticateWithTelegram: Telegram WebApp SDK not available');
    return;
  }

  const tg = window.Telegram.WebApp;

  try {
    tg.ready();
    tg.expand();
  } catch (e) {
    console.error('Telegram WebApp init failed:', e);
    showAuthError('Помилка ініціалізації Telegram SDK.');
    return;
  }

  const initData = tg.initData;

  if (!initData) {
    showAuthError('Не вдалося отримати дані Telegram. Спробуйте ще раз.');
    console.warn('authenticateWithTelegram: initData is empty');
    return;
  }

  try {
    const btn = document.querySelector('.auth-telegram-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> ЗАЧЕКАЙТЕ...';
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/validate-telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ initData }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Помилка автентифікації");
    }

    currentUser = data.user;
    localStorage.setItem('g7_auth_token', data.session.access_token);
    localStorage.setItem('g7_refresh_token', data.session.refresh_token || '');
    localStorage.setItem('g7_user', JSON.stringify(data.user));

    await syncSupabaseSession(data.session.access_token, data.session.refresh_token);

    hideAuthOverlay();
    updateAuthUI();
  } catch (err) {
    console.error("Auth error:", err);
    showAuthError("Помилка входу: " + err.message);
    const btn = document.querySelector('.auth-telegram-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${TELEGRAM_SVG} УВІЙТИ ЧЕРЕЗ TELEGRAM`;
    }
  }
}

// Called on page load — silently restore session or auto-auth from Telegram.
// NEVER shows the auth overlay.
async function restoreSession() {
  const savedToken = localStorage.getItem('g7_auth_token');
  const savedRefresh = localStorage.getItem('g7_refresh_token');
  const savedUser = localStorage.getItem('g7_user');

  // 1. Try restoring from localStorage
  if (savedToken && savedUser) {
    try {
      currentUser = JSON.parse(savedUser);

      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${savedToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
      });

      if (response.ok) {
        await syncSupabaseSession(savedToken, savedRefresh);
        updateAuthUI();
        return true;
      }

      // Token expired — clear silently, try auto-auth below
      localStorage.removeItem('g7_auth_token');
      localStorage.removeItem('g7_refresh_token');
      localStorage.removeItem('g7_user');
      currentUser = null;
    } catch {
      localStorage.removeItem('g7_auth_token');
      localStorage.removeItem('g7_refresh_token');
      localStorage.removeItem('g7_user');
      currentUser = null;
    }
  }

  // 2. No valid saved session — try auto-auth from Telegram initData
  if (isTelegramMiniApp()) {
    const tg = window.Telegram.WebApp;
    const initData = tg.initData;

    if (initData) {
      try {
        tg.ready();

        const response = await fetch(`${EDGE_FUNCTION_URL}/validate-telegram`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ initData }),
        });

        const data = await response.json();

        if (response.ok && data.session) {
          currentUser = data.user;
          localStorage.setItem('g7_auth_token', data.session.access_token);
          localStorage.setItem('g7_refresh_token', data.session.refresh_token || '');
          localStorage.setItem('g7_user', JSON.stringify(data.user));
          await syncSupabaseSession(data.session.access_token, data.session.refresh_token);
          updateAuthUI();
          return true;
        }
      } catch {
        // Auto-auth failed — silently continue as unauthenticated
      }
    }
  }

  // 3. Not authenticated — site remains fully browsable
  currentUser = null;
  updateAuthUI();
  return false;
}

function logout() {
  localStorage.removeItem('g7_auth_token');
  localStorage.removeItem('g7_refresh_token');
  localStorage.removeItem('g7_user');
  currentUser = null;
  updateAuthUI();
}

function updateAuthUI() {
  const btnClearBoard = document.getElementById('btnClearBoard');
  if (btnClearBoard) {
    btnClearBoard.style.display = (currentUser && currentUser.is_admin) ? '' : 'none';
  }

  const shameSubmitArea = document.querySelector('.shame-header-box .btn-brutal');
  if (shameSubmitArea) {
    shameSubmitArea.style.opacity = currentUser ? '1' : '0.5';
  }

  if (currentUser) {
    refreshUserReactions().then(() => {
      renderShameGrid(getFilteredShameEntries(cachedShameEntries));
    });
  } else {
    userReactionsMap = {};
    renderShameGrid(getFilteredShameEntries(cachedShameEntries));
  }
}

async function initAuth() {
  await restoreSession();
}

async function syncSupabaseSession(accessToken, refreshToken) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken || '',
    });
  } catch {
    // Ignore — token may still work for RPC calls
  }
}

function getAuthHeaders() {
  const token = localStorage.getItem('g7_auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}
