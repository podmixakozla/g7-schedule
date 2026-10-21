// ------------------------------------------------------------------
// Shame Form Module — форма додавання запису на дошку
// ------------------------------------------------------------------

let previewObjectUrl = null;

function resetFileDrop() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  const preview = document.getElementById('filePreview');
  const label = document.getElementById('fileLabel');
  const drop = document.getElementById('fileDrop');
  if (preview) { preview.src = ''; preview.hidden = true; }
  if (drop) drop.classList.remove('has-file');
  if (label) label.innerHTML = `${icon('image', 18)}<span>Обрати фото</span>`;
}

function openShameModal() {
  if (!currentUser) {
    showAuthOverlay();
    return;
  }
  const errBox = document.getElementById('modalError');
  if (errBox) errBox.hidden = true;
  document.getElementById('shameForm').reset();
  resetFileDrop();

  const modal = document.getElementById('shameModal');
  modal.onclick = (e) => { if (e.target === modal) closeShameModal(); };
  openSheet(modal);
}

function closeShameModal() {
  resetFileDrop();
  closeSheet(document.getElementById('shameModal'));
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  const label = document.getElementById('fileLabel');
  const preview = document.getElementById('filePreview');
  const drop = document.getElementById('fileDrop');
  const errBox = document.getElementById('modalError');
  if (errBox) errBox.hidden = true;

  if (!file) {
    resetFileDrop();
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    showModalError('Файл перевищує 15 МБ. Оберіть менше фото.');
    e.target.value = '';
    resetFileDrop();
    return;
  }

  if (!file.type.startsWith('image/')) {
    showModalError('Приймаються лише зображення.');
    e.target.value = '';
    resetFileDrop();
    return;
  }

  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);

  if (preview) {
    preview.src = previewObjectUrl;
    preview.hidden = false;
  }
  if (drop) drop.classList.add('has-file');
  if (label) {
    label.innerHTML = `${icon('image', 16)}<span>${escapeHtml(file.name)} (${(file.size / (1024 * 1024)).toFixed(1)} МБ)</span>`;
  }
}

function showModalError(msg) {
  const errBox = document.getElementById('modalError');
  if (!errBox) return;
  errBox.textContent = msg || '';
  errBox.hidden = !msg;
}

async function handleShameSubmit(e) {
  e.preventDefault();

  if (!currentUser) {
    showAuthOverlay();
    return;
  }

  const nameVal = document.getElementById('shameName').value.trim();
  const reasonVal = document.getElementById('shameReason').value.trim();
  const photoInput = document.getElementById('shamePhoto');
  const submitBtn = document.getElementById('btnSubmitShame');
  const submitText = document.getElementById('submitBtnText');

  if (!nameVal) {
    showModalError("Введіть ім'я або нікнейм.");
    return;
  }

  const file = photoInput.files[0];
  if (!file) {
    showModalError('Завантажте фото-доказ.');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showModalError('Приймаються лише зображення.');
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showModalError('Файл перевищує 15 МБ.');
    return;
  }

  submitBtn.disabled = true;
  submitText.innerHTML = '<span class="spinner"></span> Завантаження…';

  try {
    await getFreshAccessToken();

    if (supabaseClient) {
      const fileExt = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
      const filePath = `public/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt || 'jpg'}`;

      const { error: uploadErr } = await supabaseClient.storage
        .from('board-photos')
        .upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabaseClient.storage
        .from('board-photos')
        .getPublicUrl(filePath);

      const { error: insertErr } = await supabaseClient
        .from('board_entries')
        .insert([{
          name: nameVal,
          reason: reasonVal,
          photo_url: urlData.publicUrl,
          creator_id: currentUser.id
        }]);
      if (insertErr) throw insertErr;
    }

    spawnConfettiBurst(35);
    haptic('success');
    closeShameModal();
    toast('Запис опубліковано', 'success');
    loadShameEntries();
  } catch (err) {
    console.error('Submission error:', err);
    showModalError(err.message || 'Не вдалося опублікувати запис');
  } finally {
    submitBtn.disabled = false;
    submitText.textContent = 'Опублікувати';
  }
}
