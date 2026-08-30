// ------------------------------------------------------------------
// Коментарі під постами дошки ганьби
// ------------------------------------------------------------------
function toggleComments(entryId, btn) {
  const section = document.getElementById(`comments-section-${entryId}`);
  if (!section) return;

  const isOpen = section.classList.contains('open');
  if (isOpen) {
    section.classList.remove('open');
    return;
  }

  section.classList.add('open');

  if (!loadedComments[entryId]) {
    loadCommentsForEntry(entryId);
  }
}

async function loadCommentsForEntry(entryId) {
  const listEl = document.getElementById(`comments-list-${entryId}`);
  if (!listEl) return;

  listEl.innerHTML = '<div class="comment-empty">⏳ Завантаження...</div>';

  let comments = [];

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('comments')
        .select('*')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      comments = data || [];
    } catch (err) {
      console.warn("Supabase comments load error:", err);
      comments = [];
    }
  }

  commentsCache[entryId] = comments;
  loadedComments[entryId] = true;
  renderComments(entryId);
}

function renderComments(entryId) {
  const listEl = document.getElementById(`comments-list-${entryId}`);
  if (!listEl) return;

  const comments = commentsCache[entryId] || [];

  if (comments.length === 0) {
    listEl.innerHTML = `<div class="comment-empty">${escapeHtml(demoCommentsFallback.text)}</div>`;
    return;
  }

  listEl.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-author">${escapeHtml(c.author)}</div>
      <div class="comment-text">${escapeHtml(c.text)}</div>
    </div>
  `).join('');

  listEl.scrollTop = listEl.scrollHeight;
}

async function handleCommentSubmit(e, entryId) {
  e.preventDefault();
  const form = e.target;
  const authorInput = form.querySelector('.comment-author-input');
  const textInput = form.querySelector('.comment-text-input');
  const submitBtn = form.querySelector('.comment-submit-btn');

  const author = authorInput.value.trim();
  const text = textInput.value.trim();
  if (!author || !text) return;

  submitBtn.disabled = true;
  submitBtn.textContent = '...';

  try {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from('comments')
        .insert([{ entry_id: entryId, author, text }]);

      if (error) throw error;
    }

    // Оптимістичне оновлення - додаємо коментар одразу у список
    if (!commentsCache[entryId]) commentsCache[entryId] = [];
    commentsCache[entryId].push({ author, text, created_at: new Date().toISOString() });
    renderComments(entryId);

    form.reset();
  } catch (err) {
    console.warn("Comment submit error:", err);
    alert("Не вдалося надіслати коментар 😢 Спробуй ще раз.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Надіслати';
  }
}
