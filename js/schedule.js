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

function normalizeTeacher(teacher, isWindow = false) {
  if (isWindow) return '';
  const t = String(teacher || '').replace(/[🤷‍♂️🤷]/gu, '').trim();
  if (!t || /^(поки\s+невідомо|невідом|вак\.?\s*\d*|вакансія|-+)$/i.test(t)) {
    return 'Викладач невідомий';
  }
  return t;
}

function buildScheduleForGroup(rows, groupCode) {
  const parentCode = (typeof PARENT_GROUP !== 'undefined' && PARENT_GROUP[groupCode]) || null;
  const parentPairs = {};
  const groupPairs = {};

  for (const row of rows) {
    const code = row.group_code || PRIMARY_GROUP;
    if (parentCode && code === parentCode) {
      parentPairs[row.day_of_week] = parentPairs[row.day_of_week] || {};
      parentPairs[row.day_of_week][row.pair_number] = row;
    }
    if (code === groupCode) {
      groupPairs[row.day_of_week] = groupPairs[row.day_of_week] || {};
      groupPairs[row.day_of_week][row.pair_number] = row;
    }
  }

  const days = [];
  for (let d = 1; d <= 5; d++) {
    const pairs = [];
    for (let p = 1; p <= 8; p++) {
      const own = groupPairs[d] && groupPairs[d][p];
      const row = own || (parentPairs[d] && parentPairs[d][p]);
      if (!row) continue;
      const { subject, parity } = parsePairParity(row.subject);
      const isWin = isWindowSubject(subject);
      pairs.push({
        num: row.pair_number,
        subject,
        parity,
        teacher: normalizeTeacher(row.teacher, isWin),
        classroom: (row.classroom || '').trim(),
        isWindow: isWin,
        inherited: !own && Boolean(parentCode)
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

const DAY_LOCATIVE_NAMES = {
  1: 'у понеділок',
  2: 'у вівторок',
  3: 'у середу',
  4: 'у четвер',
  5: 'у п’ятницю'
};

const SCHEDULE_CHANGE_TTL_MS = 48 * 60 * 60 * 1000; // 48 годин

function computeClientScheduleDiff(oldRows, newRows) {
  if (!Array.isArray(oldRows) || !Array.isArray(newRows) || oldRows.length === 0 || newRows.length === 0) {
    return null;
  }
  const summaryByGroup = {};
  let totalChanges = 0;

  for (const groupCode of Object.keys(GROUP_LABELS)) {
    const oldDays = buildScheduleForGroup(oldRows, groupCode);
    const newDays = buildScheduleForGroup(newRows, groupCode);
    const labels = [];

    for (let d = 1; d <= 5; d++) {
      const oDay = oldDays.find(x => x.dayId === d);
      const nDay = newDays.find(x => x.dayId === d);
      const dayLoc = DAY_LOCATIVE_NAMES[d] || `у ${DAY_NAMES[d].toLowerCase()}`;

      for (let p = 1; p <= 8; p++) {
        const oPair = oDay ? oDay.pairs.find(x => x.num === p && !x.isWindow) : null;
        const nPair = nDay ? nDay.pairs.find(x => x.num === p && !x.isWindow) : null;
        if (!oPair && !nPair) continue;
        if (!oPair || !nPair ||
            oPair.subject !== nPair.subject ||
            oPair.parity !== nPair.parity ||
            oPair.teacher !== nPair.teacher ||
            oPair.classroom !== nPair.classroom) {
          labels.push(`Змінилась ${p} пара ${dayLoc}`);
          totalChanges++;
        }
      }
    }
    summaryByGroup[groupCode] = labels;
  }

  return totalChanges > 0 ? summaryByGroup : null;
}

async function loadScheduleChangeMeta() {
  if (!supabaseClient) return null;
  try {
    const { data: meta, error } = await supabaseClient
      .from('schedule_sync_meta')
      .select('last_change_at, last_change_summary')
      .eq('id', 1)
      .maybeSingle();

    if (!error && meta && meta.last_change_at && meta.last_change_summary) {
      const age = Date.now() - new Date(meta.last_change_at).getTime();
      if (age >= 0 && age <= SCHEDULE_CHANGE_TTL_MS) {
        scheduleChangeMeta = {
          changedAt: String(meta.last_change_at),
          summaryByGroup: meta.last_change_summary
        };
        if (typeof updateClockAndCountdown === 'function') {
          updateClockAndCountdown(true);
        }
        return scheduleChangeMeta;
      }
    }
  } catch (e) {
    console.warn('Failed to load schedule change meta:', e);
  }
  return null;
}

function getActiveScheduleChangeForGroup(groupCode = currentGroup) {
  const paramChange = URL_PARAMS.get('change');
  if (paramChange) {
    const customText = paramChange === '1' || paramChange === 'true'
      ? 'Змінилась 3 пара у вівторок'
      : paramChange;
    return {
      key: `param:${customText}`,
      primaryText: customText,
      extraCount: 0,
      allItems: [customText]
    };
  }

  if (!scheduleChangeMeta || !scheduleChangeMeta.changedAt || !scheduleChangeMeta.summaryByGroup) {
    return null;
  }

  const dismissedKey = readStored(`g7_dismissed_change_${groupCode}`, '');
  if (dismissedKey === String(scheduleChangeMeta.changedAt)) {
    return null;
  }

  const list = (scheduleChangeMeta.summaryByGroup && scheduleChangeMeta.summaryByGroup[groupCode]) || [];
  if (!Array.isArray(list) || list.length === 0) return null;

  return {
    key: `${scheduleChangeMeta.changedAt}:${groupCode}:${list.length}`,
    primaryText: list[0],
    extraCount: Math.max(0, list.length - 1),
    allItems: list
  };
}

function dismissScheduleChange(event) {
  if (event) event.stopPropagation();
  if (scheduleChangeMeta && scheduleChangeMeta.changedAt) {
    writeStored(`g7_dismissed_change_${currentGroup}`, String(scheduleChangeMeta.changedAt));
  }
  haptic('light');
  if (typeof updateClockAndCountdown === 'function') {
    updateClockAndCountdown(true);
  }
}

function buildNowCardScheduleChangeHtml(groupCode = currentGroup) {
  const change = getActiveScheduleChangeForGroup(groupCode);
  if (!change) return '';

  const extraBadge = change.extraCount > 0
    ? `<span class="now-change-more">+${change.extraCount}</span>`
    : '';
  const tooltip = change.allItems.join(' • ');

  return `
    <div class="now-change-pill" onclick="setViewMode('week')" role="button" tabindex="0" title="${escapeHtml(tooltip)}">
      <div class="now-change-left">
        <span class="now-change-icon">${icon('sparkles', 15)}</span>
        <span class="now-change-text">${escapeHtml(change.primaryText)}</span>
        ${extraBadge}
      </div>
      <button type="button" class="now-change-close" onclick="dismissScheduleChange(event)" title="Приховати сповіщення про зміни" aria-label="Закрити">
        ${icon('close', 14)}
      </button>
    </div>
  `;
}

async function reloadSchedule() {
  const rows = await loadScheduleFromDB();
  if (rows) {
    if (dbRawRows && dbRawRows.length > 0) {
      const localDiff = computeClientScheduleDiff(dbRawRows, rows);
      if (localDiff) {
        scheduleChangeMeta = {
          changedAt: new Date().toISOString(),
          summaryByGroup: localDiff
        };
      }
    }
    dbRawRows = rows;
    scheduleFromFallback = false;
    writeStored('g7_schedule_cache', JSON.stringify(rows));
  } else if (!dbRawRows) {
    scheduleFromFallback = true;
  }
  scheduleLoaded = true;
}

function renderHeaderGroupSwitch() {
  const button = document.getElementById('headerGroupSwitch');
  if (!button) return;
  const label = GROUP_LABELS[currentGroup];
  button.innerHTML = `<span>${escapeHtml(label)}</span>${icon('chevronDown', 14)}`;
  button.setAttribute('aria-label', `Група ${label}. Змінити групу`);
}

const SCHEDULE_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 година
let scheduleSyncInFlight = false;

async function maybeAutoSyncSchedule(force = false) {
  if (!supabaseClient || scheduleSyncInFlight) return false;
  scheduleSyncInFlight = true;
  try {
    if (!force) {
      const { data: meta } = await supabaseClient
        .from('schedule_sync_meta')
        .select('last_synced_at')
        .eq('id', 1)
        .maybeSingle();

      if (meta && meta.last_synced_at) {
        const elapsed = Date.now() - new Date(meta.last_synced_at).getTime();
        if (elapsed < SCHEDULE_SYNC_INTERVAL_MS) {
          return false;
        }
      }
    }

    const res = await fetch(`${EDGE_FUNCTION_URL}/sync-schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ force: Boolean(force) })
    });
    if (!res.ok) return false;
    const payload = await res.json();
    if (payload && payload.ok && !payload.skipped) {
      await reloadSchedule();
      await loadScheduleChangeMeta();
      renderSchedule();
      return true;
    }
    return false;
  } catch (e) {
    console.warn('Auto schedule sync check failed:', e);
    return false;
  } finally {
    scheduleSyncInFlight = false;
  }
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
  await loadScheduleChangeMeta();
  renderSchedule();

  // Автоматична перевірка та синхронізація розкладу з nmu.org.ua кожну годину + оновлення новин
  if (typeof loadActiveAnnouncement === 'function') loadActiveAnnouncement();
  maybeAutoSyncSchedule(false);
  setInterval(() => {
    maybeAutoSyncSchedule(false);
    loadScheduleChangeMeta();
    if (typeof loadActiveAnnouncement === 'function') loadActiveAnnouncement();
  }, 15 * 60 * 1000);
}

let weekOffset = 0;
let selectedWeekday = null;

function getDefaultWeekMonday(now) {
  const monday = getWeekMonday(now);
  return now.getDay() === 0 || now.getDay() === 6 ? addDays(monday, 7) : monday;
}

function openScheduleDate(date) {
  const monday = getWeekMonday(date);
  // Округлення враховує перехід на літній або зимовий час.
  weekOffset = Math.round((monday - getDefaultWeekMonday(getNow())) / (7 * 86400000));
  selectedWeekday = (date.getDay() + 6) % 7;
  setViewMode('week');
  document.querySelector('.day-pill.active')?.focus();
}

function handleScheduleClick(e) {
  if (e.target.closest('[data-reset-week]')) {
    weekOffset = 0;
    selectedWeekday = null;
    haptic('light');
    renderSchedule();
    document.querySelector('.day-pill.active')?.focus({ preventScroll: true });
    return;
  }

  const weekControl = e.target.closest('[data-pick-day], [data-shift-week]');
  if (weekControl) {
    const { pickDay, shiftWeek } = weekControl.dataset;
    if (pickDay !== undefined) selectedWeekday = Number(pickDay);
    else weekOffset += Number(shiftWeek);
    const selector = pickDay !== undefined
      ? `[data-pick-day="${pickDay}"]`
      : `[data-shift-week="${shiftWeek}"]`;
    haptic('light');
    renderSchedule();
    document.querySelector(selector)?.focus({ preventScroll: true });
    return;
  }
  const tab = e.target.closest('[data-group-tab]');
  if (tab) {
    setGroup(tab.dataset.groupTab);
  }
}

function setGroup(code) {
  if (currentUser && typeof changeUserGroup === 'function') {
    changeUserGroup(code);
  } else if (typeof setGuestGroup === 'function') {
    setGuestGroup(code);
  }
}

function openGroupPicker(e) {
  if (e) e.stopPropagation();
  if (currentUser) {
    const menu = document.getElementById('userMenu');
    if (menu) menu.classList.add('open');
  } else if (typeof openGuestGroupModal === 'function') {
    openGuestGroupModal();
  }
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
  const showWeekend = activeDate.getDay() === 0 || activeDate.getDay() === 6;
  for (let i = 0; i < (showWeekend ? 7 : 5); i++) {
    const d = addDays(monday, i);
    const isSelected = activeDate && isSameDay(d, activeDate);
    const isCurrentToday = isSameDay(d, now);
    const dayObj = scheduleByDay.find(x => x.dayId === i + 1);
    const hasPairs = isTeachingDay(d) && dayObj && dayObj.pairs.some(p => !p.isWindow && isPairOnDate(p, d));
    buttons.push(`
      <button type="button" class="day-pill ${isSelected ? 'active' : ''} ${isCurrentToday ? 'is-today' : ''}" data-pick-day="${i}" aria-pressed="${Boolean(isSelected)}" aria-label="${DAY_NAMES[d.getDay()]}, ${formatDayMonth(d)}">
        <span class="day-pill-dow">${DAY_SHORT[d.getDay()]}</span>
        <span class="day-pill-num">${d.getDate()}</span>
        <i class="day-pill-dot ${hasPairs ? 'has-pairs' : ''}"></i>
      </button>
    `);
  }
  return `<div class="day-strip${showWeekend ? ' includes-weekend' : ''}" role="group" aria-label="День тижня">${buttons.join('')}</div>`;
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

  let html = '';

  if (currentView === 'today') {
    const dayData = scheduleForGroup.find(d => d.dayId === now.getDay()) || null;

    html += `<header class="today-heading">
      <p>${escapeHtml(DAY_NAMES[now.getDay()])}, ${formatDayMonth(now)}</p>
      <h1>Сьогодні</h1>
    </header><div class="now-card" id="nowCard"></div><div class="schedule-notices" id="scheduleNotices" hidden></div>`;
    html += `<div class="days days-single">${createDayCard(dayData, now, {
      isToday: true,
      livePairNum,
      editable,
      detailedHeader: true
    })}</div>`;
  } else {
    const monday = addDays(getDefaultWeekMonday(now), weekOffset * 7);
    const dayIndex = selectedWeekday ?? (isWeekend ? 0 : now.getDay() - 1);
    const date = addDays(monday, dayIndex);
    const lastDay = addDays(monday, dayIndex >= 5 ? 6 : 4);
    const range = monday.getMonth() === lastDay.getMonth()
      ? `${monday.getDate()}–${formatDayMonth(lastDay)}`
      : `${formatDayMonth(monday)} – ${formatDayMonth(lastDay)}`;
    const isToday = isSameDay(date, now);

    html += `
      <div class="week-bar">
        <button type="button" class="btn btn-icon btn-secondary" data-shift-week="-1" aria-label="Попередній тиждень">${icon('chevronLeft', 18)}</button>
        <div class="week-bar-title">
          <span class="week-bar-label">${escapeHtml(range)}, ${lastDay.getFullYear()}</span>
          ${weekTypeChip(monday, 'chip-xs')}
          ${weekOffset ? '<button type="button" class="btn btn-secondary btn-sm" data-reset-week>Цей тиждень</button>' : ''}
        </div>
        <button type="button" class="btn btn-icon btn-secondary" data-shift-week="1" aria-label="Наступний тиждень">${icon('chevronRight', 18)}</button>
      </div>
      ${renderDayStrip(monday, date, now, scheduleForGroup)}
      <div class="days days-single days-week">
        ${createDayCard(scheduleForGroup[dayIndex], date, {
          isToday,
          livePairNum: isToday ? livePairNum : null,
          editable,
          compact: true
        })}
      </div>
    `;
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
  } else if (isToday && !detailedHeader) {
    tags.push('<span class="chip chip-lime chip-xs">Сьогодні</span>');
  }
  if (detailedHeader && !isOff) tags.push(weekTypeChip(date, 'chip-xs'));
  if (dayType === 'control' && !isOff) tags.push('<span class="chip chip-blue chip-xs">Контроль</span>');

  const subParts = detailedHeader ? [] : [formatDayMonth(date)];
  if (summary) {
    subParts.push(summary.countLabel);
    if (summary.endText) {
      subParts.push(`до ${summary.endText}`);
    }
  } else if (isOff && reason) {
    subParts.push(reason);
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

  return `
    <article class="day-card ${isToday ? 'is-today' : ''} ${isOff || activePairs.length === 0 ? 'is-empty-day' : ''}">
      <header class="day-head">
        <div class="day-head-text">
          <h2 class="day-name">${detailedHeader ? 'Пари сьогодні' : escapeHtml(DAY_NAMES[date.getDay()])}</h2>
          <span class="day-date">${escapeHtml(subParts.join(' · '))}</span>
        </div>
        ${tags.length ? `<div class="day-tags">${tags.join('')}</div>` : ''}
      </header>
      <div class="pairs">${body}</div>
    </article>
  `;
}

function createPairRow(pair, dayId, date, { isLive, groupCode, compact }) {
  const slot = timeSlots[pair.num] || { from: '', to: '', text: '' };
  const baseAttrs = `data-day="${dayId}" data-pair="${pair.num}" data-group="${groupCode}"`;

  if (pair.isWindow) {
    if (compact) {
      return `
        <div class="pair is-window" ${baseAttrs}>
          <span class="pair-window-time mono">${slot.from}</span>
          <span class="pair-window-label">Вікно · ${pair.num} пара</span>
        </div>
      `;
    }
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
        </div>
      </div>
    `;
  }

  const offWeek = !isPairOnDate(pair, date);
  const badges = [];
  if (isLive && !offWeek) {
    badges.push('<span class="live-pill"><i></i>Зараз</span>');
  }
  if (pair.parity && (!compact || offWeek)) {
    const label = offWeek
      ? (pair.parity === 'num' ? 'За чисельником' : 'За знаменником')
      : (pair.parity === 'num' ? 'Чисельник' : 'Знаменник');
    badges.push(`<span class="pair-parity ${pair.parity === 'num' ? 'is-num' : 'is-den'}">${label}</span>`);
  }

  if (compact) {
    return `
      <div class="pair ${isLive && !offWeek ? 'is-live' : ''} ${offWeek ? 'is-off-week' : ''}" ${baseAttrs}>
        <div class="pair-time is-compact mono"><span class="pair-from">${slot.from}</span><span class="pair-to">${slot.to}</span></div>
        <div class="pair-body">
          <div class="pair-subject-row"><span class="pair-subject">${escapeHtml(pair.subject)}</span>${badges.join('')}</div>
          ${pair.classroom ? `<div class="week-pair-room">Ауд. ${escapeHtml(pair.classroom)}</div>` : ''}
          ${pair.teacher ? `<div class="pair-meta">${escapeHtml(pair.teacher)}</div>` : ''}
        </div>
      </div>
    `;
  }

  const metaParts = [`${pair.num} пара`];
  if (pair.classroom) metaParts.push(`<strong>Ауд. ${escapeHtml(pair.classroom)}</strong>`);
  if (pair.teacher) metaParts.push(escapeHtml(pair.teacher));

  const timeHtml = `<div class="pair-time mono"><span class="pair-from">${slot.from} – ${slot.to}</span></div>`;

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
      </div>
    </div>
  `;
}
