// ------------------------------------------------------------------
// Comments — auth required, admin can delete any comment
// Author name is always derived from the authenticated Telegram profile.
// ------------------------------------------------------------------

function getCommentAuthorName() {
  if (!currentUser) return 'Анонім';
  const first = currentUser.first_name || '';
  const last = currentUser.last_name || '';
  if (first && last) return first + ' ' + last;
  return first || currentUser.username || 'Анонім';
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
    console.warn("Load comments error:", err);
    return [];
  }
}

async function toggleComments(entryId, btn) {
  const section = document.getElementById(`comments-section-${entryId}`);
  if (!section) return;

  const isOpen = section.classList.contains('open');
  section.classList.toggle('open');

  // Show who the comment will be posted as
  const authorEl = document.getElementById(`comment-author-${entryId}`);
  if (authorEl) {
    if (currentUser) {
      authorEl.textContent = 'Коментує: ' + getCommentAuthorName();
      authorEl.style.display = '';
    } else {
      authorEl.style.display = 'none';
    }
  }

  if (!isOpen) {
    const cached = commentsCache[entryId];
    const alreadyLoaded = loadedComments[entryId] && cached;

    if (!alreadyLoaded) {
      const listEl = document.getElementById(`comments-list-${entryId}`);
      if (listEl) listEl.innerHTML = '<div class="comment-empty">⏳ Завантаження...</div>';

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
    listEl.innerHTML = `<div class="comment-empty">${escapeHtml(demoCommentsFallback.text)}</div>`;
    return;
  }

  listEl.innerHTML = comments.map(c => {
    const isAdmin = currentUser && currentUser.is_admin;
    const adminDeleteHtml = isAdmin
      ? `<button class="btn-clear-tiny" onclick="adminDeleteComment(${c.id}, ${entryId})" title="Видалити коментар" style="float: right; opacity: 0.5;">🗑️</button>`
      : '';
    return `
      <div class="comment-item">
        ${adminDeleteHtml}
        <div class="comment-author">${escapeHtml(c.author || c.user_id || 'Анонім')}</div>
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
  const textInput = form.querySelector('.comment-text-input');
  const submitBtn = form.querySelector('.comment-submit-btn');

  const text = textInput.value.trim();
  if (!text) return;

  submitBtn.disabled = true;
  submitBtn.textContent = '...';

  const authorName = getCommentAuthorName();

  try {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from('comments')
        .insert([{ entry_id: entryId, user_id: currentUser.id, author: authorName, text }]);

      if (error) throw error;
    }

    if (!commentsCache[entryId]) commentsCache[entryId] = [];
    commentsCache[entryId].push({
      author: authorName,
      text,
      user_id: currentUser.id,
      created_at: new Date().toISOString(),
    });
    renderComments(entryId);
    refreshCommentPreview(entryId);

    form.reset();
  } catch (err) {
    console.warn("Comment submit error:", err);
    alert("Не вдалося надіслати коментар 😢 Спробуй ще раз.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Надіслати';
  }
}

async function adminDeleteComment(commentId, entryId) {
  if (!currentUser || !currentUser.is_admin) return;
  if (!confirm("Видалити цей коментар?")) return;

  try {
    const token = localStorage.getItem('g7_auth_token');
    const response = await fetch(`${EDGE_FUNCTION_URL}/admin-delete-comment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment_id: commentId }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to delete comment');
    }

    if (commentsCache[entryId]) {
      commentsCache[entryId] = commentsCache[entryId].filter(c => c.id !== commentId);
    }
    renderComments(entryId);
    refreshCommentPreview(entryId);
  } catch (err) {
    console.error("Delete comment error:", err);
    alert("Не вдалося видалити коментар: " + err.message);
  }
}
