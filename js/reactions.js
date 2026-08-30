// ------------------------------------------------------------------
// Reactions — server-side via upsert_reaction RPC (auth required)
// One reaction per user per post. Toggle: same emoji removes, different replaces.
// After every RPC call, re-fetch ALL state from DB. No optimistic counter manipulation.
// Picker is portaled to <body> so card transforms/animations don't affect its position.
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

let userReactionsMap = {};

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
        <button class="reaction-btn ${isMine ? 'is-mine' : ''}" onclick="handleReaction(${item.id}, '${emoji}')">
          <span>${emoji}</span>
          <span class="reaction-count">${count}</span>
        </button>
      `;
    }).join('');

  return `
    ${usedPillsHtml}
    <button class="reaction-add-btn" onclick="toggleReactionPicker(event, ${item.id})">+</button>
  `;
}

// ── Portal picker ──
let activePickerEntryId = null;
let activePickerEl = null;

function toggleReactionPicker(e, entryId) {
  e.stopPropagation();

  // If clicking + on the same post that's already open, close it
  if (activePickerEntryId === entryId && activePickerEl) {
    closeReactionPicker();
    return;
  }

  // Close any existing picker
  closeReactionPicker();

  if (!currentUser) {
    showAuthOverlay();
    return;
  }

  // Build picker element
  const userReactionKey = getUserReaction(entryId);
  const picker = document.createElement('div');
  picker.className = 'reaction-picker open';
  picker.innerHTML = POPULAR_EMOJIS.map(emoji => {
    const isMine = userReactionKey === emoji;
    return `<button class="reaction-picker-emoji ${isMine ? 'is-mine' : ''}" data-emoji="${emoji}">${emoji}</button>`;
  }).join('');

  // Wire up click handlers
  picker.querySelectorAll('.reaction-picker-emoji').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      handleReaction(entryId, btn.dataset.emoji);
    });
  });

  // Append to body (portal)
  document.body.appendChild(picker);
  activePickerEntryId = entryId;
  activePickerEl = picker;

  // Position after render
  const btn = e.currentTarget;
  requestAnimationFrame(() => {
    positionPortalPicker(picker, btn);
  });

  // Recalculate on scroll/resize while open
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

  // Center on the + button, below it
  let left = btnRect.left + btnRect.width / 2 - pickerRect.width / 2;
  let top = btnRect.bottom + 6;

  // Clamp within viewport
  if (left + pickerRect.width > vw - 8) left = vw - pickerRect.width - 8;
  if (left < 8) left = 8;

  // If below viewport, show above the button
  if (top + pickerRect.height > vh - 8) {
    top = btnRect.top - pickerRect.height - 6;
  }
  if (top < 8) top = btnRect.bottom + 6;

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

document.addEventListener('click', closeReactionPicker);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReactionPicker(); });

async function handleReaction(entryId, emoji) {
  if (!currentUser) {
    showAuthOverlay();
    return;
  }

  closeReactionPicker();

  const previousEmoji = getUserReaction(entryId);
  const togglingOff = previousEmoji === emoji;

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.rpc('upsert_reaction', {
        p_entry_id: entryId,
        p_emoji: togglingOff ? previousEmoji : emoji,
      });
      if (error) throw error;

      await refreshUserReactions();
      await refreshReactionCounts();

      const entry = cachedShameEntries.find(e => e.id === entryId);
      if (entry) {
        const bar = document.getElementById(`reactions-bar-${entryId}`);
        if (bar) {
          bar.innerHTML = buildReactionsHtml(entry);
          if (!togglingOff) {
            const pill = bar.querySelector('.reaction-btn.is-mine');
            if (pill) {
              pill.classList.add('just-reacted');
              setTimeout(() => pill.classList.remove('just-reacted'), 300);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Reaction error:", err);
    }
  }
}
