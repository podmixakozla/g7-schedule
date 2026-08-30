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

      if (data && data.length > 0) {
        cachedShameEntries = data;
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
          <input type="text" class="comment-author-input" placeholder="Ім'я" required maxlength="40" />
          <textarea class="comment-text-input" placeholder="Написати коментар..." required maxlength="300"></textarea>
          <button type="submit" class="comment-submit-btn">Надіслати</button>
        </form>
      </div>
    `;

    grid.appendChild(card);
  });
}

async function clearBoard() {
  const password = prompt("Введи адмін-пароль:");
  if (password === null) return;

  if (password !== "kaceta") {
    showModalError("Невірний пароль 🚫");
    openShameModal();
    return;
  }

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('board_entries')
        .delete()
        .neq('id', 0);

      if (error) {
        console.error("Помилка видалення Supabase:", error);
        showModalError("Не вдалося очистити дошку в Supabase 💥");
        openShameModal();
        return;
      }
    } catch (err) {
      console.error("Clear error:", err);
    }
  }

  cachedShameEntries = [];
  renderShameGrid(cachedShameEntries);
  spawnConfettiBurst(20);
}
