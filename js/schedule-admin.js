// ------------------------------------------------------------------
// Starosta & Important Announcements Module ("Важливі новини")
// Редагування розкладу вручну вимкнено (авто-синхронізація щогодини з nmu.org.ua).
// Старости (та адмін за замовчуванням) можуть публікувати важливі новини,
// які з'являються у синьому блоці (#nowCard) та дублюються ботом у Telegram.
// ------------------------------------------------------------------

function canEditGroup() {
  return false;
}

function openScheduleAdminModal() {}
function closeScheduleAdminModal() {}
function makePairBlocksAdminClickable() {}

function isCurrentUserStarosta() {
  return Boolean(currentUser && (currentUser.is_admin || currentUser.is_starosta));
}

function isAnnouncementDismissed(id) {
  if (!id) return true;
  return readStored('g7_dismissed_news_id', '') === String(id);
}

function dismissAnnouncement(id, event) {
  if (event) event.stopPropagation();
  if (!id) return;
  writeStored('g7_dismissed_news_id', String(id));
  announcementExpanded = false;
  haptic('light');
  updateClockAndCountdown(true);
}

function toggleAnnouncementExpand(event) {
  if (event) event.stopPropagation();
  announcementExpanded = !announcementExpanded;
  haptic('light');
  updateClockAndCountdown(true);
}

function buildNowCardAnnouncementHtml() {
  const a = activeAnnouncement;
  if (!a || !a.is_active || isAnnouncementDismissed(a.id)) return '';

  const text = String(a.content || '').trim();
  if (!text) return '';

  const isLong = text.length > 140 || text.split('\n').length > 3;
  const expanded = Boolean(announcementExpanded);
  const authorLabel = a.author_username
    ? `@${a.author_username}`
    : (a.author_name || 'Староста');

  const dt = a.created_at ? new Date(a.created_at) : null;
  const timeLabel = dt && !Number.isNaN(dt.getTime())
    ? `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
    : '';

  return `
    <div class="now-news ${expanded ? 'is-expanded' : ''}">
      <div class="now-news-head">
        <div class="now-news-meta">
          <span class="now-news-badge">${icon('megaphone', 13)}<span>Важливо</span></span>
          <span class="now-news-author">від ${escapeHtml(authorLabel)}${timeLabel ? ` · ${escapeHtml(timeLabel)}` : ''}</span>
        </div>
        <button type="button" class="now-news-close" onclick="dismissAnnouncement(${Number(a.id)}, event)" title="Закрити повідомлення" aria-label="Закрити повідомлення">
          ${icon('close', 16)}
        </button>
      </div>
      <div class="now-news-body ${isLong && !expanded ? 'is-clamped' : ''} ${expanded ? 'is-scrollable' : ''}">${escapeHtml(text)}</div>
      ${isLong ? `
        <button type="button" class="now-news-toggle" onclick="toggleAnnouncementExpand(event)">
          <span>${expanded ? 'Згорнути' : 'Розгорнути повністю'}</span>
          ${icon('chevronDown', 15, expanded ? 'is-rotated' : '')}
        </button>
      ` : ''}
    </div>
  `;
}

async function loadActiveAnnouncement() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error) {
      const prevId = activeAnnouncement ? activeAnnouncement.id : null;
      activeAnnouncement = data || null;
      if (activeAnnouncement && activeAnnouncement.id !== prevId) {
        announcementExpanded = false;
      }
      updateClockAndCountdown(true);
    }
    return activeAnnouncement;
  } catch (e) {
    console.warn('Failed to load active announcement:', e);
    return null;
  }
}

async function loadStarostaAnnouncements() {
  if (!supabaseClient) return;
  const listEl = document.getElementById('starostaNewsList');
  if (listEl && cachedAnnouncements.length === 0) {
    listEl.innerHTML = `
      <div class="day-card skeleton-card">
        <div class="skeleton skeleton-pair"></div>
        <div class="skeleton skeleton-pair"></div>
      </div>
    `;
  }

  try {
    const { data, error } = await supabaseClient
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) throw error;
    cachedAnnouncements = Array.isArray(data) ? data : [];
    activeAnnouncement = cachedAnnouncements.find(x => x.is_active) || null;
    renderStarostaView();
    updateClockAndCountdown(true);
  } catch (err) {
    if (listEl) {
      listEl.innerHTML = emptyState('alert', 'Не вдалося завантажити новини', err.message || 'Помилка бази даних');
    }
  }
}

function renderStarostaView() {
  const listEl = document.getElementById('starostaNewsList');
  if (!listEl) return;

  if (cachedAnnouncements.length === 0) {
    listEl.innerHTML = emptyState('megaphone', 'Важливих новин поки немає', 'Опублікуйте перше оголошення вище — воно зʼявиться у синьому блоці та прийде всім у бот.');
    return;
  }

  const now = new Date();
  const cards = cachedAnnouncements.map(item => {
    const dt = new Date(item.created_at);
    const dayStr = isSameDay(dt, now) ? 'Сьогодні' : formatDayMonth(dt);
    const timeStr = `${dayStr}, ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    const authorStr = item.author_username
      ? `@${item.author_username} (${item.author_name || ''})`
      : (item.author_name || 'Староста');

    return `
      <article class="visits-card starosta-news-card ${item.is_active ? 'is-active-news' : ''}">
        <header class="visits-card-head">
          <div class="visit-name-row">
            ${item.is_active
              ? '<span class="chip chip-lime chip-xs">Активна у синьому блоці</span>'
              : '<span class="chip chip-muted chip-xs">В архіві</span>'}
            <span class="visit-time mono">${escapeHtml(timeStr)}</span>
          </div>
          <button type="button" class="btn btn-icon btn-danger-ghost btn-sm" onclick="handleAnnouncementDelete(${Number(item.id)})" title="Видалити новину" aria-label="Видалити новину">
            ${icon('trash', 16)}
          </button>
        </header>
        <div class="starosta-news-content">${escapeHtml(item.content)}</div>
        <div class="visit-meta">
          <span>Автор: <strong>${escapeHtml(authorStr)}</strong></span>
        </div>
      </article>
    `;
  }).join('');

  listEl.innerHTML = cards;
}

async function handleAnnouncementSubmit(event) {
  event.preventDefault();
  if (!isCurrentUserStarosta()) {
    toast('Доступ дозволено лише старостам та адміністратору', 'error');
    return;
  }

  const input = document.getElementById('starostaNewsText');
  const btn = document.getElementById('btnSubmitStarostaNews');
  if (!input || !btn) return;

  const content = input.value.trim();
  if (!content) {
    toast('Введіть текст важливої новини', 'error');
    return;
  }

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>Публікуємо та розсилаємо в ТГ…</span>';

  try {
    const res = await callEdgeFunction('starosta-announcements', {
      action: 'create',
      content
    });

    input.value = '';
    writeStored('g7_dismissed_news_id', '');
    announcementExpanded = false;

    if (res && res.announcement) {
      activeAnnouncement = res.announcement;
    }
    await loadStarostaAnnouncements();

    const sentCount = res?.notify?.sent ?? 0;
    toast(`Опубліковано! Розіслано в Telegram (${sentCount} одерж.)`, 'success');
  } catch (err) {
    toast(err.message || 'Помилка публікації', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function handleAnnouncementDelete(id) {
  if (!isCurrentUserStarosta()) return;
  if (!(await uiConfirm('Видалити цю новину? Вона зникне із синього блоку на головній сторінці.'))) return;

  try {
    await callEdgeFunction('starosta-announcements', {
      action: 'delete',
      id: Number(id)
    });
    await loadStarostaAnnouncements();
    toast('Новину видалено', 'success');
  } catch (err) {
    toast(err.message || 'Не вдалося видалити новину', 'error');
  }
}
