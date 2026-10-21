// ------------------------------------------------------------------
// Admin Visits Module (ТІЛЬКИ для адміністратора)
// Логує заходи користувачів та відображає відвідування за останні 7 днів.
// Записи, яким більше 7 днів, автоматично видаляються на сервері.
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

    await fetch(`${EDGE_FUNCTION_URL}/admin-visits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'log',
        group_code: currentGroup,
        device: detectDeviceLabel(),
        telegram_user: visitor
      })
    });
  } catch (err) {
    console.warn('Visit log skipped:', err);
  }
}

function setVisitsSubView(sub) {
  currentVisitsSubView = sub === 'users' ? 'users' : 'timeline';
  const btnTimeline = document.getElementById('btnVisitsTimeline');
  const btnUsers = document.getElementById('btnVisitsUsers');
  if (btnTimeline) btnTimeline.classList.toggle('active', currentVisitsSubView === 'timeline');
  if (btnUsers) btnUsers.classList.toggle('active', currentVisitsSubView === 'users');
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
    visitsLoaded = true;
    renderAdminVisits();
  } catch (err) {
    listEl.innerHTML = emptyState('alert', 'Не вдалося завантажити візити', err.message || 'Помилка сервера');
  }
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

function renderAdminVisits() {
  const statsEl = document.getElementById('visitsStats');
  const listEl = document.getElementById('visitsList');
  if (!listEl || !statsEl) return;

  const now = new Date();
  const totalCount = cachedVisits.length;
  const uniqueIds = new Set(cachedVisits.map(v => v.telegram_id || v.id)).size;
  const todayCount = cachedVisits.filter(v => isSameDay(new Date(v.visited_at), now)).length;

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
      <span class="visits-stat-label">Сьогодні</span>
      <strong class="visits-stat-value mono">${todayCount}</strong>
    </div>
  `;

  if (cachedVisits.length === 0) {
    listEl.innerHTML = emptyState('users', 'За останні 7 днів візитів ще немає', 'Коли хтось відкриє застосунок, запис одразу зʼявиться тут.');
    return;
  }

  if (currentVisitsSubView === 'users') {
    const byUser = new Map();
    for (const v of cachedVisits) {
      const key = v.telegram_id || v.id;
      if (!byUser.has(key)) {
        byUser.set(key, {
          latest: v,
          count: 0
        });
      }
      byUser.get(key).count++;
    }

    const rows = Array.from(byUser.values()).map(({ latest, count }) => {
      const name = formatVisitDisplayName(latest);
      const initials = formatVisitInitials(latest);
      const dt = new Date(latest.visited_at);
      const dayLabel = isSameDay(dt, now) ? 'Сьогодні' : formatDayMonth(dt);
      const timeStr = `${dayLabel}, ${formatVisitTime(latest.visited_at)}`;
      const usernameHtml = formatVisitMetaId(latest);
      const groupLabel = GROUP_LABELS[latest.group_code] || latest.group_code || '';

      return `
        <div class="visit-row">
          <div class="visit-avatar">${escapeHtml(initials)}</div>
          <div class="visit-info">
            <div class="visit-name-row">
              <span class="visit-name">${escapeHtml(name)}</span>
              ${groupLabel ? `<span class="chip chip-muted chip-xs">${escapeHtml(groupLabel)}</span>` : ''}
            </div>
            <div class="visit-meta">
              ${usernameHtml}
              ${latest.device ? `<span class="pair-dot">·</span><span>${escapeHtml(latest.device)}</span>` : ''}
            </div>
          </div>
          <div class="visit-right">
            <span class="chip chip-lime chip-xs mono">${count} ${plural(count, ['вхід', 'входи', 'входів'])}</span>
            <span class="visit-time mono">${escapeHtml(timeStr)}</span>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = `<div class="visits-card"><div class="visits-rows">${rows}</div></div>`;
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
      const groupLabel = GROUP_LABELS[v.group_code] || v.group_code || '';

      return `
        <div class="visit-row">
          <div class="visit-avatar">${escapeHtml(initials)}</div>
          <div class="visit-info">
            <div class="visit-name-row">
              <span class="visit-name">${escapeHtml(name)}</span>
              ${groupLabel ? `<span class="chip chip-muted chip-xs">${escapeHtml(groupLabel)}</span>` : ''}
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
