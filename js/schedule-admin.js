// ------------------------------------------------------------------
// Schedule Admin Module
// Редагування розкладу (AR-26-1 — тільки адмін, AR-26sk-1 — будь-який авторизований).
// ------------------------------------------------------------------

function findLessonInRows(dayOfWeek, pairNumber, groupCode) {
  const rows = dbRawRows || fallbackScheduleRows;
  return rows.find(r =>
    r.day_of_week === dayOfWeek &&
    r.pair_number === pairNumber &&
    (r.group_code || PRIMARY_GROUP) === groupCode
  ) || null;
}

function isLessonInherited(dayOfWeek, pairNumber, groupCode) {
  if (groupCode === PRIMARY_GROUP) return false;
  return !findLessonInRows(dayOfWeek, pairNumber, groupCode);
}

function canEditGroup(groupCode) {
  if (!currentUser) return false;
  if (currentUser.is_admin) return true;
  if (groupCode === 'AR-26sk-1') return true;
  return false;
}

function openScheduleAdminModal(dayOfWeek, pairNumber, groupCode) {
  groupCode = groupCode || currentGroup;
  if (!canEditGroup(groupCode)) return;

  const existing = findLessonInRows(dayOfWeek, pairNumber, groupCode);
  const inherited = isLessonInherited(dayOfWeek, pairNumber, groupCode);
  const displayData = existing || findLessonInRows(dayOfWeek, pairNumber, PRIMARY_GROUP);

  const modal = document.getElementById('scheduleAdminModal');
  if (!modal) return;

  const daySelectHtml = [1, 2, 3, 4, 5].map(d =>
    `<option value="${d}" ${d === dayOfWeek ? 'selected' : ''}>${escapeHtml(DAY_NAMES[d])}</option>`
  ).join('');

  const pairSelectHtml = [];
  for (let p = 1; p <= 8; p++) {
    const slot = timeSlots[p];
    pairSelectHtml.push(`<option value="${p}" ${p === pairNumber ? 'selected' : ''}>${p} пара (${slot ? slot.text : ''})</option>`);
  }

  const groupLabel = GROUP_LABELS[groupCode] || groupCode;
  const primaryLabel = GROUP_LABELS[PRIMARY_GROUP] || PRIMARY_GROUP;
  const inheritedBanner = inherited
    ? `<div class="form-note">${icon('alert', 16)}<span>Пара успадкована з ${escapeHtml(primaryLabel)}. Збереження створить окремий запис для ${escapeHtml(groupLabel)}.</span></div>`
    : '';

  const rawSubject = displayData && !isWindowSubject(displayData.subject) ? displayData.subject : '';
  const { subject: cleanSubject, parity: currentParity } = parsePairParity(rawSubject);
  const cleanTeacher = normalizeTeacher(displayData && displayData.teacher);
  const cleanClassroom = (displayData && displayData.classroom) || '';

  const showDelete = existing && canEditGroup(groupCode);

  modal.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div>
          <h2 class="sheet-title">${existing ? 'Редагувати пару' : 'Додати пару'}</h2>
          <p class="sheet-sub">${escapeHtml(groupLabel)}</p>
        </div>
        <button class="btn btn-icon btn-ghost" onclick="closeScheduleAdminModal()" aria-label="Закрити">${icon('close', 18)}</button>
      </div>

      <div class="form-error" id="scheduleAdminError" hidden></div>
      ${inheritedBanner}

      <form id="scheduleAdminForm" class="form" onsubmit="handleScheduleAdminSubmit(event)">
        <input type="hidden" id="schedGroupCode" value="${escapeHtml(groupCode)}" />

        <div class="form-row">
          <label class="field">
            <span class="field-label">День тижня</span>
            <select id="schedDayOfWeek" class="input" required>${daySelectHtml}</select>
          </label>
          <label class="field">
            <span class="field-label">Пара</span>
            <select id="schedPairNumber" class="input" required>${pairSelectHtml.join('')}</select>
          </label>
        </div>

        <label class="field">
          <span class="field-label">Предмет <span class="field-hint">залиште порожнім для вікна</span></span>
          <input type="text" id="schedSubject" class="input" value="${escapeHtml(cleanSubject)}" placeholder="Наприклад: Вища математика" maxlength="200" autocomplete="off" />
        </label>

        <div class="field">
          <span class="field-label">Тиждень</span>
          <div class="segmented segmented-sm" role="radiogroup">
            <button type="button" class="segmented-item ${!currentParity ? 'active' : ''}" data-parity="">Щотижня</button>
            <button type="button" class="segmented-item ${currentParity === 'num' ? 'active' : ''}" data-parity="num">Чисельник</button>
            <button type="button" class="segmented-item ${currentParity === 'den' ? 'active' : ''}" data-parity="den">Знаменник</button>
          </div>
          <input type="hidden" id="schedParity" value="${currentParity || ''}" />
        </div>

        <div class="form-row">
          <label class="field">
            <span class="field-label">Викладач</span>
            <input type="text" id="schedTeacher" class="input" value="${escapeHtml(cleanTeacher)}" placeholder="Прізвище" maxlength="100" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">Аудиторія</span>
            <input type="text" id="schedClassroom" class="input" value="${escapeHtml(cleanClassroom)}" placeholder="3/14" maxlength="50" autocomplete="off" />
          </label>
        </div>

        <div class="form-actions">
          ${showDelete ? `
            <button type="button" class="btn btn-danger-ghost" id="btnDeleteLesson">
              ${icon('trash', 16)} ${groupCode === PRIMARY_GROUP ? 'Видалити' : 'Скинути'}
            </button>
          ` : ''}
          <button type="submit" class="btn btn-primary" style="flex:1">Зберегти</button>
        </div>
      </form>
    </div>
  `;

  modal.querySelectorAll('[data-parity]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('[data-parity]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('schedParity').value = btn.dataset.parity;
    });
  });

  const delBtn = document.getElementById('btnDeleteLesson');
  if (delBtn) {
    delBtn.addEventListener('click', () => handleScheduleAdminDelete(dayOfWeek, pairNumber, groupCode));
  }

  modal.onclick = (e) => { if (e.target === modal) closeScheduleAdminModal(); };
  openSheet(modal);
}

function closeScheduleAdminModal() {
  const modal = document.getElementById('scheduleAdminModal');
  if (!modal) return;
  closeSheet(modal);
  modal.innerHTML = '';
  modal.onclick = null;
}

function showScheduleAdminError(msg) {
  const el = document.getElementById('scheduleAdminError');
  if (!el) return;
  el.textContent = msg || '';
  el.hidden = !msg;
}

async function handleScheduleAdminSubmit(event) {
  event.preventDefault();
  showScheduleAdminError('');

  const groupCode = document.getElementById('schedGroupCode').value;
  const dayOfWeek = Number(document.getElementById('schedDayOfWeek').value);
  const pairNumber = Number(document.getElementById('schedPairNumber').value);
  const rawSubject = document.getElementById('schedSubject').value.trim();
  const parity = document.getElementById('schedParity').value;
  const teacher = document.getElementById('schedTeacher').value.trim();
  const classroom = document.getElementById('schedClassroom').value.trim();

  // Якщо кориcтувач вже не додав позначку в дужках — додаємо обраний тиждень.
  const { subject: baseSubject } = parsePairParity(rawSubject);
  let subject = baseSubject || '-';
  if (subject !== '-' && parity) {
    subject += parity === 'num' ? ' (чисельник)' : ' (знаменник)';
  }

  const btn = document.getElementById('scheduleAdminForm').querySelector('button[type="submit"]');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Збереження…';

  try {
    await callEdgeFunction('admin-upsert-lesson', {
      day_of_week: dayOfWeek,
      pair_number: pairNumber,
      group_code: groupCode,
      subject,
      teacher,
      classroom
    });

    await reloadSchedule();
    renderSchedule();
    closeScheduleAdminModal();
    toast('Розклад оновлено', 'success');
  } catch (err) {
    showScheduleAdminError(err.message || 'Помилка збереження');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function handleScheduleAdminDelete(dayOfWeek, pairNumber, groupCode) {
  const groupLabel = GROUP_LABELS[groupCode] || groupCode;
  const primaryLabel = GROUP_LABELS[PRIMARY_GROUP] || PRIMARY_GROUP;
  const msg = groupCode === PRIMARY_GROUP
    ? `Видалити цю пару для ${groupLabel}?`
    : `Скинути окремий запис для ${groupLabel}? Пара знову успадковуватиметься з ${primaryLabel}.`;

  if (!(await uiConfirm(msg))) return;
  showScheduleAdminError('');

  try {
    await callEdgeFunction('admin-delete-lesson', {
      day_of_week: dayOfWeek,
      pair_number: pairNumber,
      group_code: groupCode
    });

    await reloadSchedule();
    renderSchedule();
    closeScheduleAdminModal();
    toast('Запис видалено', 'success');
  } catch (err) {
    showScheduleAdminError(err.message || 'Помилка видалення');
  }
}

// Зворотна сумісність: якщо десь викликається старий хелпер, він більше не потрібен
// (використовується делегування кліків у initSchedule).
function makePairBlocksAdminClickable() {}
