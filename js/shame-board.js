// ------------------------------------------------------------------
// Shame Board Module — дошка ганьби
// ------------------------------------------------------------------

function setShameSubView(mode) {
  currentShameSubView = mode;
  document.getElementById('btnShameNew').classList.toggle('active', mode === 'new');
  document.getElementById('btnShameTop').classList.toggle('active', mode === 'top');
  haptic('light');
  renderShameGrid(getFilteredShameEntries(cachedShameEntries));
}

function getTotalReactions(entry) {
  const reactions = entry.reactions || {};
  return Object.values(reactions).reduce((sum, n) => sum + (n || 0), 0);
}

function getFilteredShameEntries(entries) {
  if (currentShameSubView === 'top') {
    const champs = entries.filter(e => e.is_week_champion || e.is_month_champion);
    if (champs.length > 0) return champs;
    // Якщо чемпіони ще не визначені — показуємо записи з найбільшою кількістю реакцій.
    return [...entries]
      .filter(e => getTotalReactions(e) > 0)
      .sort((a, b) => getTotalReactions(b) - getTotalReactions(a));
  }
  return entries;
}

async function loadShameEntries() {
  const grid = document.getElementById('shameGrid');
  if (!grid) return;

  if (!shameLoaded) {
    grid.innerHTML = `
      <div class="shame-card"><div class="skeleton skeleton-photo"></div><div class="shame-body"><div class="skeleton skeleton-line w60"></div><div class="skeleton skeleton-line w80"></div></div></div>
      <div class="shame-card"><div class="skeleton skeleton-photo"></div><div class="shame-body"><div class="skeleton skeleton-line w60"></div><div class="skeleton skeleton-line w80"></div></div></div>
    `;
  }

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('board_entries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      let reactionCounts = {};
      try {
        const { data: rcData } = await supabaseClient
          .from('reaction_counts')
          .select('*');
        if (rcData) {
          rcData.forEach(rc => {
            if (!reactionCounts[rc.entry_id]) reactionCounts[rc.entry_id] = {};
            reactionCounts[rc.entry_id][rc.emoji] = rc.count;
          });
        }
      } catch {}

      cachedShameEntries = (data || []).map(entry => ({
        ...entry,
        reactions: reactionCounts[entry.id] || entry.reactions || {}
      }));

      if (cachedShameEntries.length > 0) {
        const entryIds = cachedShameEntries.map(e => e.id);
        try {
          const { data: allComments } = await supabaseClient
            .from('comments')
            .select('*')
            .in('entry_id', entryIds)
            .order('created_at', { ascending: true });
          if (allComments) {
            entryIds.forEach(id => { commentsCache[id] = []; loadedComments[id] = true; });
            allComments.forEach(c => {
              if (!commentsCache[c.entry_id]) commentsCache[c.entry_id] = [];
              commentsCache[c.entry_id].push(c);
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn('Supabase load error:', err);
      cachedShameEntries = [];
    }
  } else {
    cachedShameEntries = [];
  }

  shameLoaded = true;
  renderShameGrid(getFilteredShameEntries(cachedShameEntries));
}

function renderShameGrid(entries) {
  const grid = document.getElementById('shameGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (entries.length === 0) {
    const isTop = currentShameSubView === 'top';
    grid.innerHTML = `
      <div class="shame-empty">
        ${emptyState(
          isTop ? 'trophy' : 'board',
          isTop ? 'Топ поки не сформовано' : 'На дошці поки порожньо',
          isTop ? 'Постів з реакціями ще немає.' : 'Ще ніхто сюди не потрапив — можете додати перший запис.'
        )}
      </div>
    `;
    return;
  }

  const isAdmin = currentUser && currentUser.is_admin;

  entries.forEach(item => {
    const card = document.createElement('article');
    const isChampion = item.is_week_champion || item.is_month_champion;
    card.className = `shame-card ${isChampion ? 'is-champion' : ''}`;

    const dateStr = item.created_at
      ? new Date(item.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
      : 'Сьогодні';

    const badges = [];
    if (item.is_month_champion) badges.push(`<span class="chip chip-amber chip-xs">${icon('trophy', 12)} Топ місяця</span>`);
    if (item.is_week_champion) badges.push(`<span class="chip chip-accent chip-xs">${icon('trophy', 12)} Топ тижня</span>`);

    const adminDeleteHtml = isAdmin
      ? `<button type="button" class="btn btn-icon btn-ghost btn-sm shame-delete" onclick="adminDeletePost(${Number(item.id)})" title="Видалити запис" aria-label="Видалити запис">${icon('trash', 16)}</button>`
      : '';

    card.innerHTML = `
      <div class="shame-media" data-lightbox-src="${escapeHtml(item.photo_url)}" data-lightbox-alt="${escapeHtml(item.name)}">
        <img class="shame-img" loading="lazy" src="${escapeHtml(item.photo_url)}" alt="${escapeHtml(item.name)}" />
        ${badges.length ? `<div class="shame-badges">${badges.join('')}</div>` : ''}
      </div>
      <div class="shame-body">
        <div class="shame-head">
          <h3 class="shame-name">${escapeHtml(item.name)}</h3>
          <div class="shame-meta">
            <span class="shame-date">${escapeHtml(dateStr)}</span>
            ${adminDeleteHtml}
          </div>
        </div>
        <p class="shame-reason">${escapeHtml(item.reason)}</p>

        <div class="reactions-bar" id="reactions-bar-${item.id}">${buildReactionsHtml(item)}</div>

        ${buildCommentPreviewHtml(item.id)}

        <div class="comments-section" id="comments-section-${item.id}">
          <div class="comments-list" id="comments-list-${item.id}"></div>
          <form class="comment-form" onsubmit="handleCommentSubmit(event, ${Number(item.id)})">
            <input type="text" class="input comment-input" placeholder="Написати коментар…" required maxlength="300" autocomplete="off" />
            <button type="submit" class="btn btn-primary btn-icon comment-send" aria-label="Надіслати">${icon('send', 16)}</button>
          </form>
        </div>
      </div>
    `;

    const img = card.querySelector('.shame-img');
    img.addEventListener('error', () => {
      img.closest('.shame-media').classList.add('is-broken');
    }, { once: true });

    const media = card.querySelector('.shame-media');
    media.addEventListener('click', () => {
      if (!media.classList.contains('is-broken')) {
        openLightbox(media.dataset.lightboxSrc, media.dataset.lightboxAlt);
      }
    });

    grid.appendChild(card);
  });
}

async function clearBoard() {
  if (!currentUser || !currentUser.is_admin) return;
  if (!(await uiConfirm('Видалити всі записи з дошки ганьби? Це незворотна дія.'))) return;

  try {
    await callEdgeFunction('admin-clear-board');
    cachedShameEntries = [];
    renderShameGrid(cachedShameEntries);
    toast('Дошку очищено');
  } catch (err) {
    console.error('Clear board error:', err);
    toast(err.message || 'Не вдалося очистити дошку', 'error');
  }
}

async function adminDeletePost(postId) {
  if (!currentUser || !currentUser.is_admin) return;
  if (!(await uiConfirm('Видалити цей запис з дошки?'))) return;

  try {
    await callEdgeFunction('admin-delete-post', { post_id: postId });
    cachedShameEntries = cachedShameEntries.filter(e => e.id !== postId);
    renderShameGrid(getFilteredShameEntries(cachedShameEntries));
    toast('Запис видалено');
  } catch (err) {
    console.error('Delete post error:', err);
    toast(err.message || 'Не вдалося видалити запис', 'error');
  }
}

function buildCommentPreviewHtml(entryId) {
  const comments = commentsCache[entryId] || [];
  const count = comments.length;
  const id = Number(entryId);

  if (count === 0) {
    return `
      <button type="button" class="comment-preview is-empty" onclick="toggleComments(${id})">
        ${icon('message', 15)}<span>Прокоментувати</span>
      </button>
    `;
  }

  const last = comments[comments.length - 1];
  const author = escapeHtml(last.author || 'Анонім');
  const raw = String(last.text || '');
  const truncated = escapeHtml(raw.length > 70 ? raw.slice(0, 70) + '…' : raw);
  const countLabel = `${count} ${plural(count, ['коментар', 'коментарі', 'коментарів'])}`;

  return `
    <button type="button" class="comment-preview" onclick="toggleComments(${id})">
      <div class="comment-preview-line">
        <span class="comment-preview-author">${author}:</span>
        <span class="comment-preview-text">${truncated}</span>
      </div>
      <span class="comment-preview-count">${icon('message', 14)}${countLabel}</span>
    </button>
  `;
}

function openLightbox(src, alt) {
  const existing = document.getElementById('photoLightbox');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'photoLightbox';
  overlay.className = 'lightbox-overlay';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'lightbox-close';
  closeBtn.setAttribute('aria-label', 'Закрити');
  closeBtn.innerHTML = icon('close', 20);
  closeBtn.onclick = closeLightbox;

  const img = document.createElement('img');
  img.className = 'lightbox-img';
  img.src = src;
  img.alt = alt || '';

  overlay.append(closeBtn, img);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLightbox();
  });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  syncTelegramBackButton();
}

function closeLightbox() {
  const overlay = document.getElementById('photoLightbox');
  if (overlay) {
    overlay.classList.remove('open');
    setTimeout(() => {
      overlay.remove();
      syncTelegramBackButton();
    }, 200);
  }
}
