function setShameSubView(mode) {
  currentShameSubView = mode;
  document.getElementById('btnShameNew').classList.toggle('active', mode === 'new');
  document.getElementById('btnShameTop').classList.toggle('active', mode === 'top');
  renderShameGrid(getFilteredShameEntries(cachedShameEntries));
}

function getTotalReactions(entry) {
  const reactions = entry.reactions || {};
  return Object.values(reactions).reduce((sum, n) => sum + (n || 0), 0);
}

function getFilteredShameEntries(entries) {
  if (currentShameSubView === 'top') {
    return [...entries]
      .filter(e => getTotalReactions(e) > 0)
      .sort((a, b) => getTotalReactions(b) - getTotalReactions(a));
  }
  return entries;
}

async function loadShameEntries() {
  const grid = document.getElementById('shameGrid');
  if (!grid) return;

  grid.innerHTML = '<div style="font-weight: 900; font-size: 1.2rem;">⏳ Завантажуємо героїв...</div>';

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('board_entries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load reaction counts from the new reaction_counts view
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
      } catch {
        // reaction_counts view may not exist yet — fall back to legacy
      }

      // Merge: new reaction_counts takes priority over legacy JSONB
      const entries = (data || []).map(entry => {
        const merged = { ...entry };
        if (reactionCounts[entry.id]) {
          merged.reactions = reactionCounts[entry.id];
        } else if (!merged.reactions) {
          merged.reactions = {};
        }
        return merged;
      });

      if (entries.length > 0) {
        cachedShameEntries = entries;
      } else {
        cachedShameEntries = initialDemoShameEntries;
      }
    } catch (err) {
      console.warn("Supabase load error (using fallback):", err);
      cachedShameEntries = initialDemoShameEntries;
    }
  } else {
    cachedShameEntries = initialDemoShameEntries;
  }

  renderShameGrid(getFilteredShameEntries(cachedShameEntries));
}

function renderShameGrid(entries) {
  const grid = document.getElementById('shameGrid');
  grid.innerHTML = '';

  if (entries.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--white); border: var(--border-thick); border-radius: 12px; box-shadow: var(--shadow-hard);">
        <h3 style="font-family: 'Archivo Black', sans-serif; font-size: 1.5rem;">ПОКИ ЩО ТИША 😇</h3>
        <p style="font-weight: 800; margin-top: 0.5rem;">Ніхто ще не потрапив на дошку. Будь першим, хто додасть героя!</p>
      </div>
    `;
    return;
  }

  entries.forEach(item => {
    const card = document.createElement('div');
    const isChampion = item.is_week_champion || item.is_month_champion;
    card.className = `shame-card ${isChampion ? 'is-champion' : ''}`;

    const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : 'Сьогодні';

    let ribbonHtml = '';
    if (item.is_month_champion) {
      ribbonHtml = `<div class="champion-ribbon is-month">🏆 ХІТ МІСЯЦЯ</div>`;
    } else if (item.is_week_champion) {
      ribbonHtml = `<div class="champion-ribbon">👑 ХІТ ТИЖНЯ</div>`;
    }

    const reactionsHtml = buildReactionsHtml(item);

    const isAdmin = currentUser && currentUser.is_admin;
    const adminDeleteHtml = isAdmin
      ? `<button class="btn-brutal" onclick="adminDeletePost(${item.id})" style="background: var(--red); color: var(--white); font-size: 0.75rem; padding: 0.3rem 0.6rem; align-self: flex-end;">🗑️ ВИДАЛИТИ</button>`
      : '';

    card.innerHTML = `
      ${ribbonHtml}
      <div class="shame-card-badge">💀 ГАНЬБА</div>
      <div class="shame-img-box">
        <img class="shame-img" src="${escapeHtml(item.photo_url)}" alt="${escapeHtml(item.name)}" onerror="this.src='https://placehold.co/600x400/0F0F11/FF4FD8?text=ФОТО+ВТРАЧЕНО'" />
      </div>
      <div class="shame-name">${escapeHtml(item.name)}</div>
      <div class="shame-reason">${escapeHtml(item.reason)}</div>
      <div class="shame-date">🗓️ ${dateStr}</div>

      <div class="reactions-bar" id="reactions-bar-${item.id}">${reactionsHtml}</div>

      <button class="comments-toggle-btn" onclick="toggleComments(${item.id}, this)">💬 Коментарі</button>

      <div class="comments-section" id="comments-section-${item.id}">
        <div class="comments-list" id="comments-list-${item.id}">
          <div class="comment-empty">⏳ Завантаження...</div>
        </div>
        <form class="comment-form" onsubmit="handleCommentSubmit(event, ${item.id})">
          <div class="comment-form-author" id="comment-author-${item.id}"></div>
          <textarea class="comment-text-input" placeholder="Написати коментар..." required maxlength="300"></textarea>
          <button type="submit" class="comment-submit-btn">Надіслати</button>
        </form>
      </div>
      ${adminDeleteHtml}
    `;

    grid.appendChild(card);
  });
}

async function clearBoard() {
  if (!currentUser || !currentUser.is_admin) return;
  if (!confirm("Видалити ВСІ записи з дошки ганьби? Це незворотно!")) return;

  try {
    const token = localStorage.getItem('g7_auth_token');
    const response = await fetch(`${EDGE_FUNCTION_URL}/admin-clear-board`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to clear board');
    }

    cachedShameEntries = [];
    renderShameGrid(cachedShameEntries);
    spawnConfettiBurst(20);
  } catch (err) {
    console.error("Clear board error:", err);
    alert("Не вдалося очистити дошку: " + err.message);
  }
}

async function adminDeletePost(postId) {
  if (!currentUser || !currentUser.is_admin) return;
  if (!confirm("Видалити цей запис з дошки ганьби?")) return;

  try {
    const token = localStorage.getItem('g7_auth_token');
    const response = await fetch(`${EDGE_FUNCTION_URL}/admin-delete-post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ post_id: postId }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to delete post');
    }

    cachedShameEntries = cachedShameEntries.filter(e => e.id !== postId);
    renderShameGrid(getFilteredShameEntries(cachedShameEntries));
  } catch (err) {
    console.error("Delete post error:", err);
    alert("Не вдалося видалити запис: " + err.message);
  }
}
