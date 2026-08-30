// ------------------------------------------------------------------
// Reactions — server-side via upsert_reaction RPC (auth required)
// One reaction per user per post. Toggle: same emoji removes, different replaces.
// After every RPC call, re-fetch ALL state from DB. No optimistic counter manipulation.
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

    requestAnimationFrame(() => {
      const rect = picker.getBoundingClientRect();
      const vw = window.innerWidth;

      if (rect.top < 0) {
        picker.classList.add('open-below');
      }
      if (rect.left < 8) {
        picker.style.left = '0';
        picker.style.transform = 'none';
      } else if (rect.right > vw - 8) {
        picker.style.left = 'auto';
        picker.style.right = '0';
        picker.style.transform = 'none';
      }
    });
  }
}

function closeReactionPicker(entryId) {
  const picker = document.getElementById(`reaction-picker-${entryId}`);
  if (picker) {
    picker.classList.remove('open', 'open-below');
    picker.style.left = '';
    picker.style.right = '';
    picker.style.transform = '';
  }
  if (openReactionPickerId === entryId) openReactionPickerId = null;
}

function closeAllReactionPickers() {
  document.querySelectorAll('.reaction-picker.open').forEach(p => {
    p.classList.remove('open', 'open-below');
    p.style.left = '';
    p.style.right = '';
    p.style.transform = '';
  });
  openReactionPickerId = null;
}

document.addEventListener('click', closeAllReactionPickers);

// ── DEBUG: query DB state after each reaction operation ──
async function debugReactionState(entryId, label) {
  if (!supabaseClient || !currentUser) return;
  console.group(`%c[REACTION DEBUG] ${label}`, 'color: #ff6fd8; font-weight: bold');
  try {
    // 1. Query reactions table for this user + entry
    const { data: myRows, error: e1 } = await supabaseClient
      .from('reactions')
      .select('id, entry_id, user_id, emoji, created_at')
      .eq('user_id', currentUser.id)
      .eq('entry_id', entryId);
    if (e1) console.error('reactions query error:', e1);
    else console.log('reactions table rows:', myRows);

    // 2. Query reaction_counts for this entry
    const { data: counts, error: e2 } = await supabaseClient
      .from('reaction_counts')
      .select('*')
      .eq('entry_id', entryId);
    if (e2) console.error('reaction_counts query error:', e2);
    else console.log('reaction_counts view:', counts);

    // 3. Log userReactionsMap state
    console.log('userReactionsMap[entryId]:', userReactionsMap[String(entryId)] || null);

    // 4. Log entry.reactions from cache
    const entry = cachedShameEntries.find(e => e.id === entryId);
    console.log('entry.reactions (cache):', entry ? entry.reactions : 'NOT FOUND');
  } catch (err) {
    console.error('debug query failed:', err);
  }
  console.groupEnd();
}

async function handleReaction(entryId, emoji) {
  if (!currentUser) {
    showAuthOverlay();
    return;
  }

  closeReactionPicker(entryId);

  const previousEmoji = getUserReaction(entryId);
  const togglingOff = previousEmoji === emoji;

  console.log(`[REACTION] click emoji="${emoji}" previous="${previousEmoji}" togglingOff=${togglingOff}`);

  // Call RPC — same emoji = toggle off (delete), different = upsert
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.rpc('upsert_reaction', {
        p_entry_id: entryId,
        p_emoji: togglingOff ? previousEmoji : emoji,
      });
      if (error) throw error;
      console.log('[REACTION] RPC succeeded, data:', data);

      // DEBUG: log DB state BEFORE refresh
      await debugReactionState(entryId, 'AFTER RPC, BEFORE refresh');

      // Re-fetch BOTH user reactions AND global counts from DB
      await refreshUserReactions();
      await refreshReactionCounts();

      // DEBUG: log DB state AFTER refresh
      await debugReactionState(entryId, 'AFTER refresh');

      // Re-render the specific post's reactions bar
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

      // DEBUG: log rendered DOM
      const barFinal = document.getElementById(`reactions-bar-${entryId}`);
      if (barFinal) {
        const pills = barFinal.querySelectorAll('.reaction-btn');
        console.log('[REACTION] rendered pills:', Array.from(pills).map(p => ({
          text: p.textContent.trim(),
          isMine: p.classList.contains('is-mine'),
        })));
      }
    } catch (err) {
      console.warn("Reaction error:", err);
    }
  }
}
