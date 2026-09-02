// ------------------------------------------------------------------
// Schedule Admin Module
// Admin-only CRUD for schedule lessons, with subgroup support.
// Depends on: config.js, state.js, utils.js, schedule.js, auth.js
// ------------------------------------------------------------------

function findLessonInRows(dayOfWeek, pairNumber, groupCode) {
  if (!dbRawRows) return null;
  return dbRawRows.find(r =>
    r.day_of_week === dayOfWeek &&
    r.pair_number === pairNumber &&
    r.group_code === groupCode
  ) || null;
}

function isLessonInherited(dayOfWeek, pairNumber, groupCode) {
  if (groupCode === 'AR-26-1') return false;
  const own = findLessonInRows(dayOfWeek, pairNumber, groupCode);
  return !own;
}

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function openScheduleAdminModal(dayOfWeek, pairNumber, groupCode) {
  groupCode = groupCode || currentGroup;
  const existing = findLessonInRows(dayOfWeek, pairNumber, groupCode);
  const inherited = isLessonInherited(dayOfWeek, pairNumber, groupCode);
  const displayData = existing || findLessonInRows(dayOfWeek, pairNumber, 'AR-26-1');

  const modal = document.getElementById('scheduleAdminModal');
  if (!modal) return;

  const daySelectHtml = [1,2,3,4,5].map(d =>
    `<option value="${d}" ${d === dayOfWeek ? 'selected' : ''}>${DAY_NAMES[d]}</option>`
  ).join('');

  const pairSelectHtml = [];
  for (let p = 1; p <= 8; p++) {
    pairSelectHtml.push(`<option value="${p}" ${p === pairNumber ? 'selected' : ''}>#${p} Пара</option>`);
  }

  const groupLabel = GROUP_LABELS[groupCode] || groupCode;
  const inheritedBanner = inherited
    ? `<div class="inherited-banner">⚠️ Це пара успадкована з АР-26-1. Збереження створить окремий запис для ${groupLabel}.</div>`
    : '';

  const showDelete = existing && groupCode === 'AR-26sk-1';

  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">📚 ${existing ? 'РЕДАГУВАТИ' : 'ДОДАТИ'} ПАРУ · ${groupLabel}</span>
        <button class="btn-close" onclick="closeScheduleAdminModal()">✕</button>
      </div>

      <div class="error-banner" id="scheduleAdminError"></div>
      ${inheritedBanner}

      <form id="scheduleAdminForm" onsubmit="handleScheduleAdminSubmit(event)">
        <input type="hidden" id="schedGroupCode" value="${groupCode}" />

        <div class="form-group">
          <label class="form-label">День тижня</label>
          <select id="schedDayOfWeek" class="form-input" required>${daySelectHtml}</select>
        </div>

        <div class="form-group" style="margin-top: 0.8rem;">
          <label class="form-label">Номер пари</label>
          <select id="schedPairNumber" class="form-input" required>${pairSelectHtml.join('')}</select>
        </div>

        <div class="form-group" style="margin-top: 0.8rem;">
          <label class="form-label">Предмет</label>
          <input type="text" id="schedSubject" class="form-input" value="${escapeAttr(displayData?.subject === '-' ? '' : (displayData?.subject || ''))}" placeholder="Назва предмету або '-' для вікна" maxlength="200" />
        </div>

        <div class="form-group" style="margin-top: 0.8rem;">
          <label class="form-label">Викладач</label>
          <input type="text" id="schedTeacher" class="form-input" value="${escapeAttr(displayData?.teacher || '')}" placeholder="Прізвище викладача" maxlength="100" />
        </div>

        <div class="form-group" style="margin-top: 0.8rem;">
          <label class="form-label">Аудиторія</label>
          <input type="text" id="schedClassroom" class="form-input" value="${escapeAttr(displayData?.classroom || '')}" placeholder="Номер аудиторії (необов'язково)" maxlength="50" />
        </div>

        <div style="margin-top: 1.25rem; display: flex; gap: 0.6rem;">
          <button type="submit" class="btn-brutal" style="flex: 1; justify-content: center;">
            💾 ЗБЕРЕГТИ
          </button>
          ${showDelete ? `
            <button type="button" class="btn-brutal red-accent" onclick="handleScheduleAdminDelete(${dayOfWeek}, ${pairNumber}, '${groupCode}')" style="flex: 0 0 auto;">
              🗑️
            </button>
          ` : ''}
        </div>
      </form>
    </div>
  `;

  modal.classList.add('open');
  modal.onclick = (e) => {
    if (e.target === modal) closeScheduleAdminModal();
  };
}

function closeScheduleAdminModal() {
  const modal = document.getElementById('scheduleAdminModal');
  if (modal) {
    modal.classList.remove('open');
    modal.innerHTML = '';
    modal.onclick = null;
  }
}

function showScheduleAdminError(msg) {
  const el = document.getElementById('scheduleAdminError');
  if (el) {
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }
}

async function handleScheduleAdminSubmit(event) {
  event.preventDefault();
  showScheduleAdminError('');

  const groupCode = document.getElementById('schedGroupCode').value;
  const dayOfWeek = Number(document.getElementById('schedDayOfWeek').value);
  const pairNumber = Number(document.getElementById('schedPairNumber').value);
  let subject = document.getElementById('schedSubject').value.trim();
  const teacher = document.getElementById('schedTeacher').value.trim();
  const classroom = document.getElementById('schedClassroom').value.trim();

  if (!subject) subject = '-';

  const btn = document.getElementById('scheduleAdminForm').querySelector('button[type="submit"]');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ЗБЕРЕЖЕННЯ...';

  try {
    const token = localStorage.getItem('g7_auth_token');
    if (!token) throw new Error('Потрібна авторизація');

    const response = await fetch(`${EDGE_FUNCTION_URL}/admin-upsert-lesson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ day_of_week: dayOfWeek, pair_number: pairNumber, group_code: groupCode, subject, teacher, classroom }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Помилка збереження');

    dbRawRows = await loadScheduleFromDB();
    renderSchedule();
    closeScheduleAdminModal();
    requestAnimationFrame(makePairBlocksAdminClickable);
  } catch (err) {
    showScheduleAdminError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function handleScheduleAdminDelete(dayOfWeek, pairNumber, groupCode) {
  if (!confirm('Видалити цю пару для АР-26ск-1? Вона знову успадкує з АР-26-1.')) return;

  showScheduleAdminError('');

  try {
    const token = localStorage.getItem('g7_auth_token');
    if (!token) throw new Error('Потрібна авторизація');

    const response = await fetch(`${EDGE_FUNCTION_URL}/admin-delete-lesson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ day_of_week: dayOfWeek, pair_number: pairNumber, group_code: groupCode }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Помилка видалення');

    dbRawRows = await loadScheduleFromDB();
    renderSchedule();
    closeScheduleAdminModal();
    requestAnimationFrame(makePairBlocksAdminClickable);
  } catch (err) {
    showScheduleAdminError(err.message);
  }
}

function makePairBlocksAdminClickable() {
  if (!currentUser || !currentUser.is_admin) return;

  document.querySelectorAll('.pair-block[data-day]').forEach(block => {
    block.style.cursor = 'pointer';
    block.addEventListener('click', () => {
      const dayId = Number(block.dataset.day);
      const pairNum = Number(block.dataset.pair);
      const group = block.dataset.group || 'AR-26-1';
      openScheduleAdminModal(dayId, pairNum, group);
    });
  });
}
