// ------------------------------------------------------------------
// Admin Visits & Starosta Management Module (ТІЛЬКИ для адміністратора)
// Логує заходи користувачів, відображає відвідування за останні 7 днів
// та дозволяє адміну призначати або знімати старост.
// ------------------------------------------------------------------

function detectDeviceLabel() {
  try {
    const tg = getTelegram();
    if (tg && isTelegramMiniApp() && tg.platform) {
      const p = String(tg.platform).toLowerCase();
      if (p === 'ios') return 'Telegram iOS';
      if (p === 'android') return 'Telegram Android';
      if (p === 'tdesktop' || p === 'macos') return 'Telegram Desktop';
      return `Telegram (${tg.platform})`;
    }
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'Браузер iOS';
    if (/Android/i.test(ua)) return 'Браузер Android';
    return 'Браузер ПК';
  } catch {
    return '';
  }
}

function getOrCreateGuestUser() {
  try {
    const host = window.location.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1') return null;
    if (navigator.webdriver) return null;
    let guestId = Number(localStorage.getItem('g7_guest_id'));
    if (!guestId || Number.isNaN(guestId)) {
      guestId = -Math.floor(100000 + Math.random() * 900000);
      localStorage.setItem('g7_guest_id', String(guestId));
    }
    return {
      id: guestId,
      telegram_id: guestId,
      first_name: 'Гість',
      last_name: '',
      username: null
    };
  } catch {
    return null;
  }
}

async function logCurrentVisit() {
  if (visitLoggedThisSession) return;
  const tg = getTelegram();
  const tgUnsafeUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;
  const visitor = currentUser || tgUnsafeUser || getOrCreateGuestUser();

  if (!visitor) return;
  visitLoggedThisSession = true;

  try {
    const token = await getFreshAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`
    };

    const res = await fetch(`${EDGE_FUNCTION_URL}/admin-visits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'log',
        group_code: currentGroup,
        device: detectDeviceLabel(),
        telegram_user: visitor
      })
    });

    if (res.ok && currentUser) {
      const data = await res.json().catch(() => ({}));
      if (typeof data.is_starosta === 'boolean' || typeof data.is_admin === 'boolean') {
        const nextAdmin = typeof data.is_admin === 'boolean' ? data.is_admin : Boolean(currentUser.is_admin);
        const nextStarosta = nextAdmin || (typeof data.is_starosta === 'boolean' ? data.is_starosta : Boolean(currentUser.is_starosta));
        if (nextAdmin !== Boolean(currentUser.is_admin) || nextStarosta !== Boolean(currentUser.is_starosta)) {
          currentUser.is_admin = nextAdmin;
          currentUser.is_starosta = nextStarosta;
          try {
            localStorage.setItem('g7_user', JSON.stringify(currentUser));
          } catch {}
          updateAuthUI();
        }
      }
    }
  } catch (err) {
    console.warn('Visit log skipped:', err);
  }
}

function setVisitsSubView(sub) {
  currentVisitsSubView = sub === 'starostas' ? 'starostas' : 'timeline';
  const btnTimeline = document.getElementById('btnVisitsTimeline');
  const btnStarostas = document.getElementById('btnVisitsStarostas');
  if (btnTimeline) btnTimeline.classList.toggle('active', currentVisitsSubView === 'timeline');
  if (btnStarostas) btnStarostas.classList.toggle('active', currentVisitsSubView === 'starostas');
  renderAdminVisits();
}

async function loadAdminVisits(force = false) {
  if (!currentUser || !currentUser.is_admin) return;
  const listEl = document.getElementById('visitsList');
  if (!listEl) return;

  if (!visitsLoaded || force) {
    listEl.innerHTML = `
      <div class="day-card skeleton-card">
        <div class="skeleton skeleton-pair"></div>
        <div class="skeleton skeleton-pair"></div>
        <div class="skeleton skeleton-pair"></div>
      </div>
    `;
  }

  try {
    const data = await callEdgeFunction('admin-visits', { action: 'list' });
    cachedVisits = Array.isArray(data.visits) ? data.visits : [];
    cachedAdminUsers = Array.isArray(data.users) ? data.users : [];
    visitsLoaded = true;
    renderAdminVisits();
  } catch (err) {
    listEl.innerHTML = emptyState('alert', 'Не вдалося завантажити дані', err.message || 'Помилка сервера');
  }
}

async function toggleUserStarosta(telegramId, makeStarosta) {
  if (!currentUser || !currentUser.is_admin) return;
  const tgId = Number(telegramId);
  if (!tgId || Number.isNaN(tgId) || tgId <= 0) return;

  haptic('light');
  try {
    await callEdgeFunction('admin-visits', {
      action: 'set_starosta',
      telegram_id: tgId,
      is_starosta: Boolean(makeStarosta)
    });

    for (const u of cachedAdminUsers) {
      if (Number(u.telegram_id) === tgId) {
        u.is_starosta = Boolean(makeStarosta);
      }
    }
    renderAdminVisits();
    toast(makeStarosta ? 'Старосту призначено' : 'Старосту знято', 'success');
  } catch (err) {
    toast(err.message || 'Не вдалося змінити роль', 'error');
  }
}

function isTelegramIdStarosta(telegramId) {
  const tgId = Number(telegramId);
  if (!tgId || Number.isNaN(tgId) || tgId <= 0) return false;
  const found = cachedAdminUsers.find(u => Number(u.telegram_id) === tgId);
  return Boolean(found && (found.is_admin || found.is_starosta));
}

function isTelegramIdAdmin(telegramId) {
  const tgId = Number(telegramId);
  if (!tgId || Number.isNaN(tgId) || tgId <= 0) return false;
  const found = cachedAdminUsers.find(u => Number(u.telegram_id) === tgId);
  return Boolean(found && found.is_admin);
}

function formatVisitDisplayName(v) {
  const first = (v.first_name || '').trim();
  const last = (v.last_name || '').trim();
  if (first && last) return `${first} ${last}`;
  return first || v.username || `ID ${v.telegram_id || '?'}`;
}

function formatVisitInitials(v) {
  const name = formatVisitDisplayName(v);
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function formatVisitMetaId(v) {
  if (v.username) {
    return `<a class="visit-username" href="https://t.me/${encodeURIComponent(v.username)}" target="_blank" rel="noopener">@${escapeHtml(v.username)}</a>`;
  }
  if (v.telegram_id && Number(v.telegram_id) > 0) {
    return `<span class="visit-id mono">ID ${escapeHtml(v.telegram_id)}</span>`;
  }
  return `<span class="visit-id">Без авторизації</span>`;
}

function formatVisitTime(isoStr) {
  const d = new Date(isoStr);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatVisitDayHeading(date, now) {
  if (isSameDay(date, now)) return `Сьогодні · ${formatDayMonth(date)}`;
  const yesterday = addDays(startOfDay(now), -1);
  if (isSameDay(date, yesterday)) return `Учора · ${formatDayMonth(date)}`;
  return `${DAY_NAMES[date.getDay()]} · ${formatDayMonth(date)}`;
}

function buildStarostaToggleButton(tgId, isAdminUser, isStarostaUser) {
  const numId = Number(tgId);
  if (!numId || Number.isNaN(numId) || numId <= 0) return '';
  if (isAdminUser) {
    return `<span class="chip chip-lime chip-xs">Адмін · Староста</span>`;
  }
  if (isStarostaUser) {
    return `
      <button type="button" class="btn btn-secondary btn-sm starosta-toggle-btn is-active" onclick="toggleUserStarosta(${numId}, false)">
        <span>Зняти старосту</span>
      </button>
    `;
  }
  return `
    <button type="button" class="btn btn-primary btn-sm starosta-toggle-btn" onclick="toggleUserStarosta(${numId}, true)">
      <span>Призначити старостою</span>
    </button>
  `;
}

function renderAdminVisits() {
  const statsEl = document.getElementById('visitsStats');
  const listEl = document.getElementById('visitsList');
  if (!listEl || !statsEl) return;

  const now = new Date();
  const totalCount = cachedVisits.length;
  const uniqueIds = new Set(cachedVisits.map(v => v.telegram_id || v.id)).size;
  const starostaCount = cachedAdminUsers.filter(u => u.is_admin || u.is_starosta).length || 1;

  statsEl.innerHTML = `
    <div class="visits-stat-card is-featured">
      <span class="visits-stat-label">Заходів за 7 днів</span>
      <strong class="visits-stat-value mono">${totalCount}</strong>
    </div>
    <div class="visits-stat-card">
      <span class="visits-stat-label">Унікальних людей</span>
      <strong class="visits-stat-value mono">${uniqueIds}</strong>
    </div>
    <div class="visits-stat-card">
      <span class="visits-stat-label">Старост</span>
      <strong class="visits-stat-value mono">${starostaCount}</strong>
    </div>
  `;

  // Режим "starostas" — призначення та зняття старост
  if (currentVisitsSubView === 'starostas') {
    if (cachedAdminUsers.length === 0) {
      listEl.innerHTML = emptyState('users', 'Користувачів Telegram ще немає', 'Коли студенти відкриють бота в Telegram, тут можна буде призначити старосту.');
      return;
    }

    const rows = cachedAdminUsers.map(u => {
      const name = formatVisitDisplayName(u);
      const initials = formatVisitInitials(u);
      const usernameHtml = formatVisitMetaId(u);
      const isAdminUser = Boolean(u.is_admin);
      const isStarostaUser = isAdminUser || Boolean(u.is_starosta);

      return `
        <div class="visit-row">
          <div class="visit-avatar">${escapeHtml(initials)}</div>
          <div class="visit-info">
            <div class="visit-name-row">
              <span class="visit-name">${escapeHtml(name)}</span>
              ${isStarostaUser && !isAdminUser ? '<span class="chip chip-lime chip-xs">Староста</span>' : ''}
            </div>
            <div class="visit-meta">
              ${usernameHtml}
            </div>
          </div>
          <div class="visit-right">
            ${buildStarostaToggleButton(u.telegram_id, isAdminUser, isStarostaUser)}
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = `
      <article class="visits-card">
        <header class="visits-card-head">
          <h2 class="visits-card-title">Керування старостами</h2>
          <span class="chip chip-blue chip-xs">${cachedAdminUsers.length} корист.</span>
        </header>
        <div class="visits-rows">${rows}</div>
      </article>
    `;
    return;
  }

  if (cachedVisits.length === 0) {
    listEl.innerHTML = emptyState('users', 'За останні 7 днів візитів ще немає', 'Коли хтось відкриє застосунок, запис одразу зʼявиться тут.');
    return;
  }

  // Режим "timeline" — хронологія за днями
  const groups = [];
  for (const v of cachedVisits) {
    const d = new Date(v.visited_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, date: d, items: [] };
      groups.push(g);
    }
    g.items.push(v);
  }

  listEl.innerHTML = groups.map(g => {
    const heading = formatVisitDayHeading(g.date, now);
    const countLabel = `${g.items.length} ${plural(g.items.length, ['вхід', 'входи', 'входів'])}`;
    const rows = g.items.map(v => {
      const name = formatVisitDisplayName(v);
      const initials = formatVisitInitials(v);
      const usernameHtml = formatVisitMetaId(v);
      const tgId = Number(v.telegram_id);
      const isStarostaUser = isTelegramIdStarosta(tgId);

      return `
        <div class="visit-row">
          <div class="visit-avatar">${escapeHtml(initials)}</div>
          <div class="visit-info">
            <div class="visit-name-row">
              <span class="visit-name">${escapeHtml(name)}</span>
              ${isStarostaUser ? '<span class="chip chip-lime chip-xs">Староста</span>' : ''}
            </div>
            <div class="visit-meta">
              ${usernameHtml}
              ${v.device ? `<span class="pair-dot">·</span><span>${escapeHtml(v.device)}</span>` : ''}
            </div>
          </div>
          <div class="visit-right">
            <span class="visit-time mono">${formatVisitTime(v.visited_at)}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <article class="visits-card">
        <header class="visits-card-head">
          <h2 class="visits-card-title">${escapeHtml(heading)}</h2>
          <span class="chip chip-blue chip-xs">${escapeHtml(countLabel)}</span>
        </header>
        <div class="visits-rows">${rows}</div>
      </article>
    `;
  }).join('');
}
