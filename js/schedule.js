// ------------------------------------------------------------------
// Schedule Module
// Завантажує розклад із Supabase (резерв — fallbackScheduleRows).
// Підгрупи успадковують пари основної групи, якщо немає власного запису.
// ------------------------------------------------------------------

// "-", порожньо, "Вікно", "Нічого (спати)" — вільна пара.
function isWindowSubject(subject) {
  const t = String(subject || '').trim();
  return !t || /^[-–—]+$/.test(t) || /^(вікно|нічого)/i.test(t);
}

function normalizeTeacher(teacher) {
  const t = String(teacher || '').replace(/[🤷‍♂️🤷]/gu, '').trim();
  if (!t || /^поки\s+невідомо/i.test(t)) return '';
  return t;
}

function buildScheduleForGroup(rows, groupCode) {
  const primary = {};
  const overrides = {};

  for (const row of rows) {
    const code = row.group_code || PRIMARY_GROUP;
    if (code === PRIMARY_GROUP) {
      primary[row.day_of_week] = primary[row.day_of_week] || {};
      primary[row.day_of_week][row.pair_number] = row;
    }
    if (code === groupCode) {
      overrides[row.day_of_week] = overrides[row.day_of_week] || {};
      overrides[row.day_of_week][row.pair_number] = row;
    }
  }

  const days = [];
  for (let d = 1; d <= 5; d++) {
    const pairs = [];
    for (let p = 1; p <= 8; p++) {
      const own = overrides[d] && overrides[d][p];
      const row = own || (primary[d] && primary[d][p]);
      if (!row) continue;
      const { subject, parity } = parsePairParity(row.subject);
      pairs.push({
        num: row.pair_number,
        subject,
        parity,
        teacher: normalizeTeacher(row.teacher),
        classroom: (row.classroom || '').trim(),
        isWindow: isWindowSubject(subject),
        inherited: !own && groupCode !== PRIMARY_GROUP
      });
    }
    pairs.sort((a, b) => a.num - b.num);
    days.push({ dayId: d, dayName: DAY_NAMES[d], pairs });
  }
  return days;
}

function getScheduleForGroup(groupCode) {
  return buildScheduleForGroup(dbRawRows || fallbackScheduleRows, groupCode);
}

// Пари для показу: без вікон на початку/в кінці дня, з "дірками" між парами як вікнами.
function getVisiblePairs(dayData) {
  const real = dayData.pairs.filter(p => !p.isWindow);
  if (real.length === 0) return [];
  const first = real[0].num;
  const last = real[real.length - 1].num;
  const result = [];
  for (let n = first; n <= last; n++) {
    const found = dayData.pairs.find(p => p.num === n);
    result.push(found && !found.isWindow ? found : { num: n, isWindow: true });
  }
  return result;
}

// Підсумок навчального дня: кількість активних пар та час закінчення.
function summarizeDaySchedule(dayData, date) {
  if (!dayData || !isTeachingDay(date)) return null;
  const active = dayData.pairs.filter(p => !p.isWindow && isPairOnDate(p, date));
  if (active.length === 0) return null;
  const firstSlot = timeSlots[active[0].num];
  const lastSlot = timeSlots[active[active.length - 1].num];
  const countLabel = `${active.length} ${plural(active.length, ['пара', 'пари', 'пар'])}`;
  const rangeLabel = firstSlot && lastSlot ? `${firstSlot.from} – ${lastSlot.to}` : '';
  return { count: active.length, countLabel, rangeLabel, endText: lastSlot ? lastSlot.to : '' };
}

async function loadScheduleFromDB() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from('schedule_lessons')
      .select('*')
      .order('day_of_week')
      .order('pair_number');
    if (error) {
      console.warn('Failed to load schedule from DB:', error);
      return null;
    }
    return data && data.length > 0 ? data : null;
  } catch (e) {
    console.warn('Schedule DB load failed:', e);
    return null;
  }
}

async function reloadSchedule() {
  const rows = await loadScheduleFromDB();
  if (rows) {
    dbRawRows = rows;
    scheduleFromFallback = false;
    writeStored('g7_schedule_cache', JSON.stringify(rows));
  } else if (!dbRawRows) {
    scheduleFromFallback = true;
  }
  scheduleLoaded = true;
}

function renderHeaderGroupSwitch() {
  const el = document.getElementById('headerGroupSwitch');
  if (!el) return;
  el.innerHTML = Object.entries(GROUP_LABELS).map(([code, label]) =>
    `<button type="button" class="group-switch-btn ${code === currentGroup ? 'active' : ''}" onclick="setGroup('${code}')">${escapeHtml(label)}</button>`
  ).join('');
}

async function initSchedule() {
  const cached = readStored('g7_schedule_cache', '');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) dbRawRows = parsed;
    } catch {}
  }
  scheduleLoaded = true;

  const container = document.getElementById('scheduleContainer');
  container.addEventListener('click', handleScheduleClick);
  renderHeaderGroupSwitch();
  renderSchedule();
  await reloadSchedule();
  renderSchedule();
}

function handleScheduleClick(e) {
  const tab = e.target.closest('[data-group-tab]');
  if (tab) {
    setGroup(tab.dataset.groupTab);
    return;
  }

  const add = e.target.closest('[data-action="add-pair"]');
  if (add) {
    const dayId = Number(add.dataset.day);
    const day = getScheduleForGroup(currentGroup).find(d => d.dayId === dayId);
    const taken = new Set((day ? day.pairs : []).filter(p => !p.isWindow).map(p => p.num));
    let free = 1;
    while (taken.has(free) && taken.size < 8 && free < 8) free++;
    openScheduleAdminModal(dayId, free, currentGroup);
    return;
  }

  const pair = e.target.closest('.pair[data-editable]');
  if (pair) {
    openScheduleAdminModal(Number(pair.dataset.day), Number(pair.dataset.pair), pair.dataset.group);
  }
}

function setGroup(code) {
  if (!(code in GROUP_LABELS) || code === currentGroup) return;
  currentGroup = code;
  writeStored('g7_group', code);
  haptic('light');
  renderHeaderGroupSwitch();
  renderSchedule();
}

// Знаходить найближчий навчальний день, починаючи з `from` (включно).
function findNextTeachingDay(from, maxDays = 120) {
  for (let i = 0; i <= maxDays; i++) {
    const d = addDays(startOfDay(from), i);
    if (isTeachingDay(d)) return d;
  }
  return null;
}

function renderScheduleSkeleton() {
  const block = '<div class="skeleton skeleton-pair"></div>';
  return `
    ${currentView === 'today' ? '<div class="now-card skeleton-card"><div class="skeleton skeleton-line w40"></div><div class="skeleton skeleton-line w80 lg"></div></div>' : ''}
    <div class="day-card">${block}${block}${block}</div>
  `;
}

function weekTypeChip(date, extraClass = '') {
  const isNum = getIsNumerator(date);
  return `<span class="chip ${isNum ? 'chip-num' : 'chip-den'} ${extraClass}">${isNum ? 'Чисельник' : 'Знаменник'}</span>`;
}

function renderDayStrip(monday, activeDate, now, scheduleByDay) {
  const buttons = [];
  for (let i = 0; i < 5; i++) {
    const d = addDays(monday, i);
    const isSelected = activeDate && isSameDay(d, activeDate);
    const isCurrentToday = isSameDay(d, now);
    const dayObj = scheduleByDay.find(x => x.dayId === i + 1);
    const hasPairs = isTeachingDay(d) && dayObj && dayObj.pairs.some(p => !p.isWindow && isPairOnDate(p, d));
    buttons.push(`
      <button type="button" class="day-pill ${isSelected ? 'active' : ''} ${isCurrentToday ? 'is-today' : ''}" data-pick-day="${i}">
        <span class="day-pill-dow">${DAY_SHORT[d.getDay()]}</span>
        <span class="day-pill-num">${d.getDate()}</span>
        <i class="day-pill-dot ${hasPairs ? 'has-pairs' : ''}"></i>
      </button>
    `);
  }
  return `<div class="day-strip" role="tablist" aria-label="День тижня">${buttons.join('')}</div>`;
}

function renderSchedule() {
  const container = document.getElementById('scheduleContainer');
  if (!container) return;

  if (!scheduleLoaded) {
    container.innerHTML = renderScheduleSkeleton();
    return;
  }

  const now = getNow();
  const editable = canEditGroup(currentGroup);
  const livePairNum = getCurrentPairNum(now);
  const scheduleForGroup = getScheduleForGroup(currentGroup);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const monday = isWeekend ? addDays(getWeekMonday(now), 7) : getWeekMonday(now);

  let html = '';

  if (currentView === 'today') {
    const dayData = scheduleForGroup.find(d => d.dayId === now.getDay()) || null;

    html += `<div class="now-card" id="nowCard"></div>`;
    html += `<div class="days days-single">${createDayCard(dayData, now, {
      isToday: true,
      livePairNum,
      editable,
      detailedHeader: true
    })}</div>`;
  } else {
    const friday = addDays(monday, 4);
    const rangeStr = monday.getMonth() === friday.getMonth()
      ? `${monday.getDate()} – ${formatDayMonth(friday)}`
      : `${formatDayMonth(monday)} – ${formatDayMonth(friday)}`;

    html += `
      <div class="week-bar">
        <div class="week-bar-title">
          <span class="week-bar-label">${isWeekend ? 'Наступний тиждень' : 'Поточний тиждень'}</span>
          <span class="week-bar-dates">${rangeStr}</span>
        </div>
        ${weekTypeChip(monday)}
      </div>
    `;

    const days = scheduleForGroup.map(dayData => {
      const date = addDays(monday, dayData.dayId - 1);
      const isToday = isSameDay(date, now);
      return createDayCard(dayData, date, {
        isToday,
        livePairNum: isToday ? livePairNum : null,
        editable,
        compact: true
      });
    }).join('');
    html += `<div class="days days-week">${days}</div>`;
  }

  if (scheduleFromFallback) {
    html += `<p class="schedule-note is-warning">${icon('alert', 15)} Показано резервну копію розкладу.</p>`;
  }

  container.innerHTML = html;
  if (currentView === 'today') updateClockAndCountdown(true);
}

function emptyState(iconName, title, text) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName, 24)}</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      ${text ? `<div class="empty-text">${escapeHtml(text)}</div>` : ''}
    </div>
  `;
}

function createDayCard(dayData, date, opts = {}) {
  const { isToday = false, livePairNum = null, editable = false, compact = false, detailedHeader = false } = opts;
  const reason = getNoClassesReason(date);
  const dayType = getDayType(date);
  const isOff = !isTeachingDay(date);
  const pairs = dayData ? getVisiblePairs(dayData) : [];
  const activePairs = (!isOff && dayData)
    ? dayData.pairs.filter(p => !p.isWindow && isPairOnDate(p, date))
    : [];
  const groupCode = currentGroup;
  const summary = summarizeDaySchedule(dayData, date);

  // Перевіряємо, чи всі сьогоднішні пари вже закінчилися
  let isTodayFinished = false;
  if (isToday && activePairs.length > 0) {
    const now = getNow();
    const secNow = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const lastPair = activePairs[activePairs.length - 1];
    const lastSlot = timeSlots[lastPair.num];
    if (lastSlot && secNow >= lastSlot.end * 60) {
      isTodayFinished = true;
    }
  }

  const tags = [];
  if (isTodayFinished) {
    tags.push('<span class="chip chip-lime chip-xs">Завершено</span>');
  } else if (isToday) {
    tags.push('<span class="chip chip-lime chip-xs">Сьогодні</span>');
  }
  if (detailedHeader && !isOff) tags.push(weekTypeChip(date, 'chip-xs'));
  if (dayType === 'control' && !isOff) tags.push('<span class="chip chip-blue chip-xs">Контроль</span>');

  const subParts = [formatDayMonth(date)];
  if (summary) {
    subParts.push(summary.countLabel);
    if (detailedHeader && summary.endText) {
      subParts.push(`до ${summary.endText}`);
    }
  } else if (isOff && reason) {
    subParts.push(reason);
  }

  let finishedNotice = '';
  if (detailedHeader && isTodayFinished) {
    finishedNotice = `<div class="day-status-banner">${icon('check', 16)}<span>На сьогодні пари вже закінчилися</span></div>`;
  }

  let body = '';
  if (isOff || activePairs.length === 0) {
    if (detailedHeader) {
      const emptySub = reason
        ? `${reason} — сьогодні можна відпочивати`
        : 'За розкладом на сьогодні пар немає';
      body = `
        <div class="day-empty is-detailed">
          <div class="day-empty-title">Сьогодні занять немає</div>
          <div class="day-empty-sub">${escapeHtml(emptySub)}</div>
        </div>
      `;
    } else {
      body = `<div class="day-empty"><span>${escapeHtml(isOff ? (reason || 'Вихідний') : 'Пар немає')}</span></div>`;
    }
  } else {
    body = pairs.map((p, idx) => createPairRow(p, dayData.dayId, date, {
      isLive: isToday && p.num === livePairNum,
      editable,
      groupCode,
      compact,
      isLast: idx === pairs.length - 1
    })).join('');
  }

  const addBtn = editable && !isOff && dayData
    ? `<button class="day-add" data-action="add-pair" data-day="${dayData.dayId}">${icon('plus', 15)} Додати пару</button>`
    : '';

  return `
    <article class="day-card ${isToday ? 'is-today' : ''} ${isOff || activePairs.length === 0 ? 'is-empty-day' : ''}">
      <header class="day-head">
        <div class="day-head-text">
          <h2 class="day-name">${escapeHtml(DAY_NAMES[date.getDay()])}</h2>
          <span class="day-date">${escapeHtml(subParts.join(' · '))}</span>
        </div>
        ${tags.length ? `<div class="day-tags">${tags.join('')}</div>` : ''}
      </header>
      ${finishedNotice}
      <div class="pairs">${body}</div>
      ${addBtn}
    </article>
  `;
}

function createPairRow(pair, dayId, date, { isLive, editable, groupCode, compact }) {
  const slot = timeSlots[pair.num] || { from: '', to: '', text: '' };
  const editAttrs = editable ? `data-editable="1" tabindex="0" role="button" aria-label="Редагувати ${pair.num} пару"` : '';
  const baseAttrs = `data-day="${dayId}" data-pair="${pair.num}" data-group="${groupCode}" ${editAttrs}`;

  if (pair.isWindow) {
    return `
      <div class="pair is-window" ${baseAttrs}>
        <div class="pair-rail" aria-hidden="true">
          <i class="pair-node is-hollow"></i>
        </div>
        <div class="pair-body">
          <span class="pair-window-label">Вікно · ${pair.num} пара</span>
        </div>
        <div class="pair-right">
          <span class="pair-window-time mono">${slot.from}</span>
          ${editable ? `<span class="pair-edit">${icon('plus', 14)}</span>` : ''}
        </div>
      </div>
    `;
  }

  const offWeek = !isPairOnDate(pair, date);
  const badges = [];
  if (isLive && !offWeek) {
    badges.push('<span class="live-pill"><i></i>Зараз</span>');
  }
  if (pair.parity) {
    const label = offWeek
      ? (pair.parity === 'num' ? 'За чисельником' : 'За знаменником')
      : (pair.parity === 'num' ? 'Чисельник' : 'Знаменник');
    badges.push(`<span class="pair-parity ${pair.parity === 'num' ? 'is-num' : 'is-den'}">${label}</span>`);
  }

  const metaParts = [`${pair.num} пара`];
  if (pair.teacher) metaParts.push(escapeHtml(pair.teacher));
  if (pair.classroom) metaParts.push(`ауд. ${escapeHtml(pair.classroom)}`);

  const timeHtml = compact
    ? `<div class="pair-time is-compact mono"><span class="pair-from">${slot.from}</span><span class="pair-to">${slot.to}</span></div>`
    : `<div class="pair-time mono"><span class="pair-from">${slot.from} – ${slot.to}</span></div>`;

  return `
    <div class="pair ${isLive && !offWeek ? 'is-live' : ''} ${offWeek ? 'is-off-week' : ''}" ${baseAttrs}>
      <div class="pair-rail" aria-hidden="true">
        <i class="pair-node ${isLive && !offWeek ? 'is-live' : ''}"></i>
      </div>
      <div class="pair-body">
        <div class="pair-subject-row">
          <span class="pair-subject">${escapeHtml(pair.subject)}</span>
          ${badges.join('')}
        </div>
        <div class="pair-meta">${metaParts.join(' <span class="pair-dot">·</span> ')}</div>
      </div>
      <div class="pair-right">
        ${timeHtml}
        ${editable ? `<span class="pair-edit">${icon('pencil', 14)}</span>` : ''}
      </div>
    </div>
  `;
}
