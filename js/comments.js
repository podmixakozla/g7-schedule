// ------------------------------------------------------------------
// Comments — коментарі до постів на дошці (потрібна авторизація)
// ------------------------------------------------------------------

function getCommentAuthorName() {
  return getUserDisplayName(currentUser) || 'Анонім';
}

async function loadComments(entryId) {
  if (!supabaseClient) return [];
  try {
    const { data, error } = await supabaseClient
      .from('comments')
      .select('*')
      .eq('entry_id', entryId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Load comments error:', err);
    return [];
  }
}

async function toggleComments(entryId) {
  const section = document.getElementById(`comments-section-${entryId}`);
  if (!section) return;

  const isOpen = section.classList.contains('open');
  section.classList.toggle('open');

  if (!isOpen) {
    const cached = commentsCache[entryId];
    const alreadyLoaded = loadedComments[entryId] && cached;

    if (!alreadyLoaded) {
      const listEl = document.getElementById(`comments-list-${entryId}`);
      if (listEl) listEl.innerHTML = '<div class="comment-empty">Завантаження…</div>';

      try {
        const comments = await loadComments(entryId);
        commentsCache[entryId] = comments;
        loadedComments[entryId] = true;
      } catch {
        commentsCache[entryId] = [];
        loadedComments[entryId] = true;
      }
    }

    renderComments(entryId);
    refreshCommentPreview(entryId);
  }
}

function renderComments(entryId) {
  const listEl = document.getElementById(`comments-list-${entryId}`);
  if (!listEl) return;

  const comments = commentsCache[entryId] || [];

  if (comments.length === 0) {
    listEl.innerHTML = '<div class="comment-empty">Коментарів поки немає</div>';
    return;
  }

  const isAdmin = currentUser && currentUser.is_admin;
  listEl.innerHTML = comments.map(c => {
    const delBtn = (isAdmin && c.id)
      ? `<button type="button" class="comment-delete" onclick="adminDeleteComment(${Number(c.id)}, ${Number(entryId)})" title="Видалити коментар" aria-label="Видалити">${icon('trash', 14)}</button>`
      : '';
    return `
      <div class="comment-item">
        <div class="comment-head">
          <span class="comment-author">${escapeHtml(c.author || 'Анонім')}</span>
          ${delBtn}
        </div>
        <div class="comment-text">${escapeHtml(c.text)}</div>
      </div>
    `;
  }).join('');

  listEl.scrollTop = listEl.scrollHeight;
}

function refreshCommentPreview(entryId) {
  const section = document.getElementById(`comments-section-${entryId}`);
  if (!section) return;
  const previewEl = section.previousElementSibling;
  if (previewEl && previewEl.classList.contains('comment-preview')) {
    previewEl.outerHTML = buildCommentPreviewHtml(entryId);
  }
}

async function handleCommentSubmit(e, entryId) {
  e.preventDefault();
  if (!currentUser) {
    showAuthOverlay();
    return;
  }

  const form = e.target;
  const textInput = form.querySelector('.comment-input');
  const submitBtn = form.querySelector('.comment-send');

  const text = textInput.value.trim();
  if (!text) return;

  submitBtn.disabled = true;
  const authorName = getCommentAuthorName();

  try {
    await getFreshAccessToken();
    let inserted = null;
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('comments')
        .insert([{ entry_id: entryId, user_id: currentUser.id, author: authorName, text }])
        .select()
        .single();
      if (error) throw error;
      inserted = data;
    }

    if (!commentsCache[entryId]) commentsCache[entryId] = [];
    commentsCache[entryId].push(inserted || {
      author: authorName,
      text,
      user_id: currentUser.id,
      created_at: new Date().toISOString(),
    });

    renderComments(entryId);
    refreshCommentPreview(entryId);
    form.reset();
    haptic('light');
  } catch (err) {
    console.warn('Comment submit error:', err);
    toast('Не вдалося надіслати коментар', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

async function adminDeleteComment(commentId, entryId) {
  if (!currentUser || !currentUser.is_admin) return;
  if (!(await uiConfirm('Видалити цей коментар?'))) return;

  try {
    await callEdgeFunction('admin-delete-comment', { comment_id: commentId });
    if (commentsCache[entryId]) {
      commentsCache[entryId] = commentsCache[entryId].filter(c => c.id !== commentId);
    }
    renderComments(entryId);
    refreshCommentPreview(entryId);
    toast('Коментар видалено');
  } catch (err) {
    console.error('Delete comment error:', err);
    toast(err.message || 'Не вдалося видалити коментар', 'error');
  }
}
