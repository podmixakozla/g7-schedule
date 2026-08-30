function openShameModal() {
  if (!currentUser) {
    showAuthOverlay();
    return;
  }
  document.getElementById('modalError').style.display = 'none';
  document.getElementById('shameForm').reset();
  document.getElementById('fileLabel').textContent = '📁 Тисни сюди для вибору фото';
  document.getElementById('shameModal').classList.add('open');
}

function closeShameModal() {
  document.getElementById('shameModal').classList.remove('open');
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  const label = document.getElementById('fileLabel');
  if (file) {
    if (file.size > 15 * 1024 * 1024) {
      showModalError("Файл занадто великий! Максимум 15 МБ 💥");
      e.target.value = '';
      label.textContent = '📁 Тисни сюди для вибору фото';
      return;
    }
    label.textContent = `📸 Обрано: ${file.name} (${(file.size / (1024*1024)).toFixed(1)} МБ)`;
  }
}

function showModalError(msg) {
  const errBox = document.getElementById('modalError');
  errBox.textContent = msg;
  errBox.style.display = 'block';
}

async function handleShameSubmit(e) {
  e.preventDefault();

  if (!currentUser) {
    showAuthOverlay();
    return;
  }

  const nameVal = (function() {
    const first = currentUser.first_name || '';
    const last = currentUser.last_name || '';
    return (first && last) ? first + ' ' + last : first || currentUser.username || 'Анонім';
  })();
  const reasonVal = document.getElementById('shameReason').value.trim();
  const photoInput = document.getElementById('shamePhoto');

  const submitBtn = document.getElementById('btnSubmitShame');
  const submitText = document.getElementById('submitBtnText');

  // Verify file
  const file = photoInput.files[0];
  if (!file) {
    showModalError("Будь ласка, завантажте фото-доказ! 📸");
    return;
  }

  if (!file.type.startsWith('image/')) {
    showModalError("Приймаються тільки зображення! 🖼️");
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    showModalError("Файл перевищує 15 МБ! 💥");
    return;
  }

  submitBtn.disabled = true;
  submitText.innerHTML = '<span class="spinner"></span> ВАНТАЖИМО...';

  try {
    let photoUrl = "";

    if (supabaseClient) {
      const fileExt = file.name.split('.').pop();
      const filePath = `public/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

      const { data: uploadData, error: uploadErr } = await supabaseClient.storage
        .from('board-photos')
        .upload(filePath, file);

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabaseClient.storage
        .from('board-photos')
        .getPublicUrl(filePath);

      photoUrl = urlData.publicUrl;

      const { error: insertErr } = await supabaseClient
        .from('board_entries')
        .insert([
          { name: nameVal, reason: reasonVal, photo_url: photoUrl, creator_id: currentUser.id }
        ]);

      if (insertErr) throw insertErr;
    } else {
      photoUrl = URL.createObjectURL(file);
      const newEntry = {
        id: Date.now(),
        name: nameVal,
        reason: reasonVal,
        photo_url: photoUrl,
        created_at: new Date().toISOString()
      };
      cachedShameEntries.unshift(newEntry);
    }

    spawnConfettiBurst(40);
    closeShameModal();
    loadShameEntries();

  } catch (err) {
    console.error("Submission error:", err);
    showModalError(`Помилка: ${err.message || 'Не вдалося завантажити'}`);
  } finally {
    submitBtn.disabled = false;
    submitText.textContent = '🔥 ОПУБЛІКУВАТИ';
  }
}
