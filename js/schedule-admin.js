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

let starostaPreviewUrls = [];

const WHEEL_ITEM_HEIGHT = 40;

const starostaTimerState = {
  enabled: false,
  day: 1,
  month: 0,
  hour: 12,
  initialized: false,
  programmaticScroll: false
};

let expiredCleanupInFlight = false;

function isAnnouncementExpired(item) {
  if (!item || !item.expires_at) return false;
  const expMs = new Date(item.expires_at).getTime();
  return !Number.isNaN(expMs) && expMs <= Date.now();
}

async function triggerExpiredAnnouncementsCleanup() {
  if (expiredCleanupInFlight) return;
  expiredCleanupInFlight = true;
  try {
    await fetch(`${EDGE_FUNCTION_URL}/starosta-announcements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ action: 'cleanup' })
    });
  } catch (e) {
    console.warn('Expired announcement cleanup failed:', e);
  } finally {
    setTimeout(() => {
      expiredCleanupInFlight = false;
    }, 10000);
  }
}

function getDaysInWheelMonth(monthIdx) {
  const now = new Date();
  const year = monthIdx < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(year, monthIdx + 1, 0).getDate();
}

function computeStarostaExpiresAtDate() {
  if (!starostaTimerState.enabled) return null;
  const now = new Date();
  const maxDay = getDaysInWheelMonth(starostaTimerState.month);
  const day = Math.min(starostaTimerState.day, maxDay);
  const month = starostaTimerState.month;
  const hour = starostaTimerState.hour;

  let year = now.getFullYear();
  let candidate = new Date(year, month, day, hour, 0, 0, 0);

  // Якщо обрано місяць/день раніше в календарі, ніж сьогодні — це наступний рік (у межах 1 року)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfChosenDay = new Date(year, month, day).getTime();
  if (startOfChosenDay < startOfToday) {
    year += 1;
    candidate = new Date(year, month, day, hour, 0, 0, 0);
  }

  return candidate;
}

function updateStarostaTimerSummary() {
  const summaryEl = document.getElementById('starostaTimerSummary');
  const toggleBtn = document.getElementById('btnToggleStarostaTimer');
  const toggleLabel = document.getElementById('starostaTimerToggleLabel');
  if (!summaryEl) return;

  if (!starostaTimerState.enabled) {
    summaryEl.textContent = 'Без таймера (вручну)';
    summaryEl.classList.remove('is-active', 'is-warning');
    if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'false');
    if (toggleLabel) toggleLabel.textContent = 'Встановити час';
    return;
  }

  if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'true');
  if (toggleLabel) toggleLabel.textContent = 'Скасувати таймер';

  const dt = computeStarostaExpiresAtDate();
  if (!dt) return;

  if (dt.getTime() <= Date.now()) {
    summaryEl.textContent = `Час ${dt.getDate()} ${MONTH_GENITIVE[dt.getMonth()]} о ${pad2(dt.getHours())}:00 вже минув — оберіть пізнішу годину`;
    summaryEl.classList.add('is-warning');
    summaryEl.classList.remove('is-active');
  } else {
    summaryEl.textContent = `Видалиться: ${dt.getDate()} ${MONTH_GENITIVE[dt.getMonth()]} о ${pad2(dt.getHours())}:00`;
    summaryEl.classList.add('is-active');
    summaryEl.classList.remove('is-warning');
  }
}

function syncWheelColumnSelection(colEl, selectedIndex) {
  if (!colEl) return;
  const items = colEl.querySelectorAll('.wheel-item');
  items.forEach((el, idx) => {
    el.classList.toggle('is-selected', idx === selectedIndex);
  });
}

function scrollWheelColumnToIndex(colEl, index, smooth = false) {
  if (!colEl) return;
  const targetTop = index * WHEEL_ITEM_HEIGHT;
  starostaTimerState.programmaticScroll = true;
  if (smooth) {
    colEl.scrollTo({ top: targetTop, behavior: 'smooth' });
  } else {
    colEl.scrollTop = targetTop;
  }
  syncWheelColumnSelection(colEl, index);
  setTimeout(() => {
    starostaTimerState.programmaticScroll = false;
  }, smooth ? 260 : 60);
}

function renderWheelDaysColumn(preserveScroll = true) {
  const dayCol = document.getElementById('wheelColDay');
  if (!dayCol) return;
  const maxDays = getDaysInWheelMonth(starostaTimerState.month);
  if (starostaTimerState.day > maxDays) {
    starostaTimerState.day = maxDays;
  }
  const items = [];
  for (let d = 1; d <= maxDays; d++) {
    const isSel = d === starostaTimerState.day;
    items.push(
      `<button type="button" class="wheel-item mono ${isSel ? 'is-selected' : ''}" onclick="selectWheelValue('day', ${d})">${pad2(d)}</button>`
    );
  }
  dayCol.innerHTML = items.join('');
  if (preserveScroll) {
    scrollWheelColumnToIndex(dayCol, starostaTimerState.day - 1, false);
  }
}

function initStarostaWheelPicker() {
  const dayCol = document.getElementById('wheelColDay');
  const monthCol = document.getElementById('wheelColMonth');
  const hourCol = document.getElementById('wheelColHour');
  if (!dayCol || !monthCol || !hourCol) return;

  renderWheelDaysColumn(false);

  monthCol.innerHTML = MONTH_GENITIVE.map((mName, idx) => {
    const isSel = idx === starostaTimerState.month;
    return `<button type="button" class="wheel-item ${isSel ? 'is-selected' : ''}" onclick="selectWheelValue('month', ${idx})">${escapeHtml(mName)}</button>`;
  }).join('');

  const hours = [];
  for (let h = 0; h <= 23; h++) {
    const isSel = h === starostaTimerState.hour;
    hours.push(
      `<button type="button" class="wheel-item mono ${isSel ? 'is-selected' : ''}" onclick="selectWheelValue('hour', ${h})">${pad2(h)}:00</button>`
    );
  }
  hourCol.innerHTML = hours.join('');

  if (!starostaTimerState.initialized) {
    starostaTimerState.initialized = true;

    const attachWheelScroll = (colEl, type) => {
      let rafId = null;
      colEl.addEventListener('scroll', () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const idx = Math.max(0, Math.round(colEl.scrollTop / WHEEL_ITEM_HEIGHT));
          if (type === 'day') {
            const maxD = getDaysInWheelMonth(starostaTimerState.month);
            const newDay = Math.min(maxD, idx + 1);
            if (starostaTimerState.day !== newDay) {
              starostaTimerState.day = newDay;
              syncWheelColumnSelection(colEl, newDay - 1);
              updateStarostaTimerSummary();
            }
          } else if (type === 'month') {
            const newMonth = Math.min(11, idx);
            if (starostaTimerState.month !== newMonth) {
              starostaTimerState.month = newMonth;
              syncWheelColumnSelection(colEl, newMonth);
              renderWheelDaysColumn(true);
              updateStarostaTimerSummary();
            }
          } else if (type === 'hour') {
            const newHour = Math.min(23, idx);
            if (starostaTimerState.hour !== newHour) {
              starostaTimerState.hour = newHour;
              syncWheelColumnSelection(colEl, newHour);
              updateStarostaTimerSummary();
            }
          }
        });
      }, { passive: true });
    };

    attachWheelScroll(dayCol, 'day');
    attachWheelScroll(monthCol, 'month');
    attachWheelScroll(hourCol, 'hour');
  }

  requestAnimationFrame(() => {
    scrollWheelColumnToIndex(dayCol, starostaTimerState.day - 1, false);
    scrollWheelColumnToIndex(monthCol, starostaTimerState.month, false);
    scrollWheelColumnToIndex(hourCol, starostaTimerState.hour, false);
  });
}

function selectWheelValue(type, value) {
  haptic('light');
  if (type === 'day') {
    starostaTimerState.day = value;
    scrollWheelColumnToIndex(document.getElementById('wheelColDay'), value - 1, true);
  } else if (type === 'month') {
    starostaTimerState.month = value;
    scrollWheelColumnToIndex(document.getElementById('wheelColMonth'), value, true);
    renderWheelDaysColumn(true);
  } else if (type === 'hour') {
    starostaTimerState.hour = value;
    scrollWheelColumnToIndex(document.getElementById('wheelColHour'), value, true);
  }
  updateStarostaTimerSummary();
}

function toggleStarostaTimer() {
  haptic('light');
  const wrap = document.getElementById('starostaWheelWrap');
  starostaTimerState.enabled = !starostaTimerState.enabled;

  if (starostaTimerState.enabled) {
    // За замовчуванням пропонуємо +24 години від поточного моменту
    const defaultTarget = new Date(Date.now() + 24 * 3600 * 1000);
    starostaTimerState.day = defaultTarget.getDate();
    starostaTimerState.month = defaultTarget.getMonth();
    starostaTimerState.hour = defaultTarget.getHours();
    if (wrap) wrap.hidden = false;
    initStarostaWheelPicker();
  } else {
    if (wrap) wrap.hidden = true;
  }

  updateStarostaTimerSummary();
}

function resetStarostaTimer() {
  starostaTimerState.enabled = false;
  const wrap = document.getElementById('starostaWheelWrap');
  if (wrap) wrap.hidden = true;
  updateStarostaTimerSummary();
}

function getAnnouncementPhotos(item) {
  if (!item) return [];
  if (Array.isArray(item.photo_urls) && item.photo_urls.length > 0) {
    return item.photo_urls.filter(u => typeof u === 'string' && u.trim());
  }
  if (typeof item.photo_url === 'string' && item.photo_url.trim()) {
    return [item.photo_url.trim()];
  }
  return [];
}

function openAnnouncementPhoto(url, event) {
  if (event) event.stopPropagation();
  if (typeof openLightbox === 'function' && url) {
    openLightbox(url, 'Фото до оголошення');
  }
}

function resetStarostaPhotos() {
  for (const u of starostaPreviewUrls) {
    try { URL.revokeObjectURL(u); } catch {}
  }
  starostaPreviewUrls = [];

  const input = document.getElementById('starostaNewsPhotos');
  const previews = document.getElementById('starostaPhotoPreviews');
  const label = document.getElementById('starostaFileLabel');
  const drop = document.getElementById('starostaFileDrop');
  const clearBtn = document.getElementById('btnClearStarostaPhotos');

  if (input) input.value = '';
  if (previews) {
    previews.innerHTML = '';
    previews.hidden = true;
  }
  if (drop) drop.classList.remove('has-file');
  if (label) label.innerHTML = `${icon('image', 18)}<span>Прикріпити фото</span>`;
  if (clearBtn) clearBtn.hidden = true;
}

function handleStarostaPhotoSelect(event) {
  const files = Array.from(event.target.files || []);
  const previews = document.getElementById('starostaPhotoPreviews');
  const label = document.getElementById('starostaFileLabel');
  const drop = document.getElementById('starostaFileDrop');
  const clearBtn = document.getElementById('btnClearStarostaPhotos');

  for (const u of starostaPreviewUrls) {
    try { URL.revokeObjectURL(u); } catch {}
  }
  starostaPreviewUrls = [];

  if (files.length === 0) {
    resetStarostaPhotos();
    return;
  }

  if (files.length > 10) {
    toast('Можна прикріпити максимум 10 фото', 'error');
    resetStarostaPhotos();
    return;
  }

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      toast('Приймаються лише зображення', 'error');
      resetStarostaPhotos();
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast(`Файл "${file.name}" перевищує 15 МБ`, 'error');
      resetStarostaPhotos();
      return;
    }
  }

  starostaPreviewUrls = files.map(f => URL.createObjectURL(f));

  if (previews) {
    previews.innerHTML = starostaPreviewUrls
      .map(u => `<img class="starosta-photo-thumb" src="${u}" alt="" />`)
      .join('');
    previews.hidden = false;
  }
  if (drop) drop.classList.add('has-file');
  if (label) {
    const totalMb = (files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1);
    const countText = files.length === 1
      ? escapeHtml(files[0].name)
      : `Обрано ${files.length} фото`;
    label.innerHTML = `${icon('image', 16)}<span>${countText} (${totalMb} МБ)</span>`;
  }
  if (clearBtn) clearBtn.hidden = false;
}

function buildNowCardAnnouncementHtml() {
  const a = activeAnnouncement;
  if (!a || !a.is_active) return '';
  if (isAnnouncementExpired(a)) {
    activeAnnouncement = null;
    triggerExpiredAnnouncementsCleanup();
    return '';
  }
  if (isAnnouncementDismissed(a.id)) return '';

  const text = String(a.content || '').trim();
  if (!text) return '';

  const photos = getAnnouncementPhotos(a);
  const hasPhotos = photos.length > 0;
  const isLong = text.length > 140 || text.split('\n').length > 3;
  const canExpand = isLong || hasPhotos;
  const expanded = Boolean(announcementExpanded);
  const authorLabel = a.author_username
    ? `@${a.author_username}`
    : (a.author_name || 'Староста');

  const dt = a.created_at ? new Date(a.created_at) : null;
  const timeLabel = dt && !Number.isNaN(dt.getTime())
    ? `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
    : '';

  let toggleLabel = 'Розгорнути повністю';
  if (expanded) {
    toggleLabel = 'Згорнути';
  } else if (hasPhotos) {
    const photoCountLabel = photos.length === 1 ? 'фото' : `${photos.length} фото`;
    toggleLabel = isLong ? `Розгорнути повністю (${photoCountLabel})` : `Розгорнути (${photoCountLabel})`;
  }

  const photosHtml = (expanded && hasPhotos)
    ? `
      <div class="now-news-photos ${photos.length > 1 ? 'is-grid' : ''}">
        ${photos.map(url => `
          <img
            class="now-news-photo"
            src="${escapeHtml(url)}"
            alt="Фото до оголошення"
            loading="lazy"
            onclick="openAnnouncementPhoto('${escapeHtml(url)}', event)"
          />
        `).join('')}
      </div>
    `
    : '';

  return `
    <div class="now-news ${expanded ? 'is-expanded' : ''}">
      <div class="now-news-head">
        <div class="now-news-meta">
          <span class="now-news-badge">${icon('megaphone', 13)}<span>Важливо</span></span>
          <span class="now-news-author">від ${escapeHtml(authorLabel)}${timeLabel ? ` · ${escapeHtml(timeLabel)}` : ''}</span>
          ${hasPhotos && !expanded ? `<span class="now-news-photo-chip">${icon('image', 12)}<span>${photos.length > 1 ? photos.length : 'Фото'}</span></span>` : ''}
        </div>
        <button type="button" class="now-news-close" onclick="dismissAnnouncement(${Number(a.id)}, event)" title="Закрити повідомлення" aria-label="Закрити повідомлення">
          ${icon('close', 16)}
        </button>
      </div>
      <div class="now-news-scroll ${expanded ? 'is-scrollable' : ''}">
        <div class="now-news-body ${isLong && !expanded ? 'is-clamped' : ''}">${escapeHtml(text)}</div>
        ${photosHtml}
      </div>
      ${canExpand ? `
        <button type="button" class="now-news-toggle" onclick="toggleAnnouncementExpand(event)">
          <span>${escapeHtml(toggleLabel)}</span>
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
      if (data && isAnnouncementExpired(data)) {
        activeAnnouncement = null;
        triggerExpiredAnnouncementsCleanup();
        updateClockAndCountdown(true);
        return null;
      }
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
    const rows = Array.isArray(data) ? data : [];
    const hasExpired = rows.some(x => isAnnouncementExpired(x));
    if (hasExpired) {
      triggerExpiredAnnouncementsCleanup();
    }
    cachedAnnouncements = rows.filter(x => !isAnnouncementExpired(x));
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
    const photos = getAnnouncementPhotos(item);
    const photosHtml = photos.length > 0
      ? `
        <div class="starosta-card-photos">
          ${photos.map(url => `
            <img
              class="starosta-card-photo"
              src="${escapeHtml(url)}"
              alt="Фото до новини"
              loading="lazy"
              onclick="openAnnouncementPhoto('${escapeHtml(url)}', event)"
            />
          `).join('')}
        </div>
      `
      : '';

    let expiresBadgeHtml = '';
    if (item.expires_at) {
      const expDt = new Date(item.expires_at);
      if (!Number.isNaN(expDt.getTime())) {
        const expStr = `${expDt.getDate()} ${MONTH_GENITIVE[expDt.getMonth()]} о ${pad2(expDt.getHours())}:00`;
        expiresBadgeHtml = `<span class="chip chip-blue chip-xs">${icon('clock', 12)}<span>Видалиться: ${escapeHtml(expStr)}</span></span>`;
      }
    }

    return `
      <article class="visits-card starosta-news-card ${item.is_active ? 'is-active-news' : ''}">
        <header class="visits-card-head">
          <div class="visit-name-row">
            ${item.is_active
              ? '<span class="chip chip-lime chip-xs">Активна у синьому блоці</span>'
              : '<span class="chip chip-muted chip-xs">В архіві</span>'}
            ${expiresBadgeHtml}
            <span class="visit-time mono">${escapeHtml(timeStr)}</span>
          </div>
          <button type="button" class="btn btn-icon btn-danger-ghost btn-sm" onclick="handleAnnouncementDelete(${Number(item.id)})" title="Видалити новину з сайту та бота" aria-label="Видалити новину">
            ${icon('trash', 16)}
          </button>
        </header>
        <div class="starosta-news-content">${escapeHtml(item.content)}</div>
        ${photosHtml}
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
  const photoInput = document.getElementById('starostaNewsPhotos');
  const btn = document.getElementById('btnSubmitStarostaNews');
  if (!input || !btn) return;

  const content = input.value.trim();
  if (!content) {
    toast('Введіть текст важливої новини', 'error');
    return;
  }

  let expiresAtIso = null;
  if (starostaTimerState.enabled) {
    const expDate = computeStarostaExpiresAtDate();
    if (!expDate || expDate.getTime() <= Date.now()) {
      toast('Оберіть майбутній час для автовидалення новини', 'error');
      return;
    }
    expiresAtIso = expDate.toISOString();
  }

  const files = photoInput ? Array.from(photoInput.files || []) : [];

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>Публікуємо та розсилаємо в ТГ…</span>';

  try {
    await getFreshAccessToken();

    const photoUrls = [];
    if (files.length > 0 && supabaseClient) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
        const filePath = `announcements/${Date.now()}_${i}_${Math.random().toString(36).substring(2, 9)}.${fileExt || 'jpg'}`;
        const { error: uploadErr } = await supabaseClient.storage
          .from('board-photos')
          .upload(filePath, file);
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabaseClient.storage
          .from('board-photos')
          .getPublicUrl(filePath);
        if (urlData && urlData.publicUrl) {
          photoUrls.push(urlData.publicUrl);
        }
      }
    }

    const res = await callEdgeFunction('starosta-announcements', {
      action: 'create',
      content,
      photo_urls: photoUrls,
      expires_at: expiresAtIso
    });

    input.value = '';
    resetStarostaPhotos();
    resetStarostaTimer();
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
  if (!(await uiConfirm('Видалити цю новину? Вона зникне із синього блоку на головній сторінці та видалиться з чату бота в Telegram.'))) return;

  try {
    const res = await callEdgeFunction('starosta-announcements', {
      action: 'delete',
      id: Number(id)
    });
    await loadStarostaAnnouncements();
    const tgCount = res?.deletedTgMessages ?? 0;
    toast(tgCount > 0 ? `Новину видалено з сайту та чату ТГ (${tgCount})` : 'Новину видалено', 'success');
  } catch (err) {
    toast(err.message || 'Не вдалося видалити новину', 'error');
  }
}
