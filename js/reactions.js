// ------------------------------------------------------------------
// Захист від спаму реакціями - одна реакція на пост з одного браузера
// ------------------------------------------------------------------
function getUserReactionsMap() {
  try {
    return JSON.parse(localStorage.getItem('shame_user_reactions') || '{}');
  } catch (e) {
    return {};
  }
}

function getUserReaction(entryId) {
  const reactions = getUserReactionsMap();
  return reactions[String(entryId)] || null;
}

function setUserReaction(entryId, emoji) {
  const reactions = getUserReactionsMap();
  reactions[String(entryId)] = emoji;
  localStorage.setItem('shame_user_reactions', JSON.stringify(reactions));
}

function buildReactionsHtml(item) {
  const reactions = item.reactions || {};
  const userReactionKey = getUserReaction(item.id);

  // Пілюлі показуємо тільки для емодзі, які вже отримали хоча б одну реакцію
  const usedPillsHtml = POPULAR_EMOJIS
    .filter(emoji => (reactions[emoji] || 0) > 0)
    .map(emoji => {
      const count = reactions[emoji] || 0;
      const isMine = userReactionKey === emoji;
      return `
        <button class="reaction-btn ${isMine ? 'is-mine' : ''}" onclick="handleReaction(${item.id}, '${emoji}')">
          <span>${emoji}</span>
          <span class="reaction-count">${count}</span>
        </button>
      `;
    }).join('');

  const pickerEmojisHtml = POPULAR_EMOJIS.map(emoji => `
    <button class="reaction-picker-emoji" onclick="handleReaction(${item.id}, '${emoji}')">${emoji}</button>
  `).join('');

  return `
    ${usedPillsHtml}
    <div class="reaction-add-wrapper">
      <button class="reaction-add-btn" onclick="toggleReactionPicker(event, ${item.id})">+</button>
      <div class="reaction-picker" id="reaction-picker-${item.id}">${pickerEmojisHtml}</div>
    </div>
  `;
}

function toggleReactionPicker(e, entryId) {
  e.stopPropagation();
  const picker = document.getElementById(`reaction-picker-${entryId}`);
  if (!picker) return;

  const isOpen = picker.classList.contains('open');
  closeAllReactionPickers();
  if (!isOpen) {
    picker.classList.add('open');
    openReactionPickerId = entryId;
  }
}

function closeReactionPicker(entryId) {
  const picker = document.getElementById(`reaction-picker-${entryId}`);
  if (picker) picker.classList.remove('open');
  if (openReactionPickerId === entryId) openReactionPickerId = null;
}

function closeAllReactionPickers() {
  document.querySelectorAll('.reaction-picker.open').forEach(p => p.classList.remove('open'));
  openReactionPickerId = null;
}

// Закриваємо панель вибору емодзі при кліку будь-де поза нею
document.addEventListener('click', closeAllReactionPickers);

async function handleReaction(entryId, emoji) {
  const previousEmoji = getUserReaction(entryId);
  closeReactionPicker(entryId);

  if (previousEmoji === emoji) {
    // Вже поставив саме цю реакцію - ігноруємо повторний клік
    return;
  }

  const entry = cachedShameEntries.find(e => e.id === entryId);
  if (!entry) return;
  if (!entry.reactions) entry.reactions = {};

  // Якщо раніше стояла інша реакція - лічильник на сервері не зменшуємо навмисно,
  // щоб не ускладнювати - старий "голос" просто більше не позначений як "мій"
  setUserReaction(entryId, emoji);
  entry.reactions[emoji] = (entry.reactions[emoji] || 0) + 1;

  // Перемальовуємо блок реакцій цілком - працює однаково і з пілюлі, і з панелі
  const bar = document.getElementById(`reactions-bar-${entryId}`);
  if (bar) {
    bar.innerHTML = buildReactionsHtml(entry);
    const newPill = bar.querySelector('.reaction-btn.is-mine');
    if (newPill) {
      newPill.classList.add('just-reacted');
      setTimeout(() => newPill.classList.remove('just-reacted'), 300);
    }
  }

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient.rpc('increment_reaction', {
        entry_id_input: entryId,
        emoji_key: emoji
      });
      if (error) throw error;
    } catch (err) {
      console.warn("Reaction error:", err);
    }
  }
}
