// ------------------------------------------------------------------
// Reactions — серверні реакції через RPC upsert_reaction
// Одна реакція на користувача на пост. Повторний клік знімає, інший — замінює.
// ------------------------------------------------------------------

async function getUserReactionsFromDB() {
  if (!supabaseClient || !currentUser) return {};
  try {
    const { data, error } = await supabaseClient
      .from('reactions')
      .select('entry_id, emoji')
      .eq('user_id', currentUser.id);
    if (error) throw error;
    const map = {};
    (data || []).forEach(r => { map[String(r.entry_id)] = r.emoji; });
    return map;
  } catch {
    return {};
  }
}

async function refreshUserReactions() {
  userReactionsMap = await getUserReactionsFromDB();
}

function getUserReaction(entryId) {
  return userReactionsMap[String(entryId)] || null;
}

async function refreshReactionCounts() {
  if (!supabaseClient) return;
  try {
    const { data: rcData } = await supabaseClient
      .from('reaction_counts')
      .select('*');
    if (!rcData) return;
    const counts = {};
    rcData.forEach(rc => {
      const eid = String(rc.entry_id);
      if (!counts[eid]) counts[eid] = {};
      counts[eid][rc.emoji] = rc.count;
    });
    cachedShameEntries.forEach(entry => {
      const eid = String(entry.id);
      entry.reactions = counts[eid] || {};
    });
  } catch {}
}

function buildReactionsHtml(item) {
  const reactions = item.reactions || {};
  const userReactionKey = getUserReaction(item.id);

  const usedPillsHtml = POPULAR_EMOJIS
    .filter(emoji => (reactions[emoji] || 0) > 0)
    .map(emoji => {
      const count = reactions[emoji] || 0;
      const isMine = userReactionKey === emoji;
      return `
        <button type="button" class="reaction-pill ${isMine ? 'is-mine' : ''}" data-react-entry="${item.id}" data-react-emoji="${escapeHtml(emoji)}">
          <span>${emoji}</span>
          <span class="reaction-count">${count}</span>
        </button>
      `;
    }).join('');

  return `
    ${usedPillsHtml}
    <button type="button" class="reaction-add" onclick="toggleReactionPicker(event, ${Number(item.id)})" aria-label="Додати реакцію">
      ${icon('smilePlus', 16)}
    </button>
  `;
}

// ── Portal picker ──
let activePickerEntryId = null;
let activePickerEl = null;

function toggleReactionPicker(e, entryId) {
  e.stopPropagation();

  if (activePickerEntryId === entryId && activePickerEl) {
    closeReactionPicker();
    return;
  }

  closeReactionPicker();

  if (!currentUser) {
    showAuthOverlay();
    return;
  }

  const userReactionKey = getUserReaction(entryId);
  const picker = document.createElement('div');
  picker.className = 'reaction-picker open';
  picker.innerHTML = POPULAR_EMOJIS.map(emoji => {
    const isMine = userReactionKey === emoji;
    return `<button type="button" class="reaction-picker-emoji ${isMine ? 'is-mine' : ''}" data-emoji="${emoji}">${emoji}</button>`;
  }).join('');

  picker.querySelectorAll('.reaction-picker-emoji').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      handleReaction(entryId, btn.dataset.emoji);
    });
  });

  document.body.appendChild(picker);
  activePickerEntryId = entryId;
  activePickerEl = picker;

  const btn = e.currentTarget;
  requestAnimationFrame(() => positionPortalPicker(picker, btn));

  const reposition = () => {
    if (activePickerEl) positionPortalPicker(picker, btn);
  };
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition, { passive: true });
  picker._repositionCleanup = () => {
    window.removeEventListener('scroll', reposition);
    window.removeEventListener('resize', reposition);
  };
}

function positionPortalPicker(picker, btn) {
  const btnRect = btn.getBoundingClientRect();
  const pickerRect = picker.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = btnRect.left + btnRect.width / 2 - pickerRect.width / 2;
  let top = btnRect.bottom + 8;

  if (left + pickerRect.width > vw - 12) left = vw - pickerRect.width - 12;
  if (left < 12) left = 12;

  if (top + pickerRect.height > vh - 12) {
    top = btnRect.top - pickerRect.height - 8;
  }
  if (top < 12) top = btnRect.bottom + 8;

  picker.style.left = left + 'px';
  picker.style.top = top + 'px';
}

function closeReactionPicker() {
  if (activePickerEl) {
    if (activePickerEl._repositionCleanup) activePickerEl._repositionCleanup();
    activePickerEl.remove();
    activePickerEl = null;
  }
  activePickerEntryId = null;
}

document.addEventListener('click', (e) => {
  const pill = e.target.closest('[data-react-entry]');
  if (pill) {
    handleReaction(Number(pill.dataset.reactEntry), pill.dataset.reactEmoji);
    return;
  }
  if (activePickerEl && !e.target.closest('.reaction-picker')) {
    closeReactionPicker();
  }
});

async function handleReaction(entryId, emoji) {
  if (!currentUser) {
    showAuthOverlay();
    return;
  }

  closeReactionPicker();
  haptic('light');

  const previousEmoji = getUserReaction(entryId);
  const togglingOff = previousEmoji === emoji;

  if (!supabaseClient) return;

  try {
    await getFreshAccessToken();
    const { error } = await supabaseClient.rpc('upsert_reaction', {
      p_entry_id: entryId,
      p_emoji: togglingOff ? previousEmoji : emoji,
    });
    if (error) throw error;

    await Promise.all([refreshUserReactions(), refreshReactionCounts()]);

    const entry = cachedShameEntries.find(e => e.id === entryId);
    if (entry) {
      const bar = document.getElementById(`reactions-bar-${entryId}`);
      if (bar) {
        bar.innerHTML = buildReactionsHtml(entry);
        if (!togglingOff) {
          const pill = bar.querySelector('.reaction-pill.is-mine');
          if (pill) {
            pill.classList.add('just-reacted');
            setTimeout(() => pill.classList.remove('just-reacted'), 300);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Reaction error:', err);
    toast('Не вдалося зберегти реакцію', 'error');
  }
}
