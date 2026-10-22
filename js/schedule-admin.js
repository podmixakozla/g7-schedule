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
  if (!a || !a.is_active || isAnnouncementDismissed(a.id)) return '';

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
      photo_urls: photoUrls
    });

    input.value = '';
    resetStarostaPhotos();
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
