// ------------------------------------------------------------------
// Schedule Module
// Loads schedule from Supabase; falls back to hardcoded data.
// Supports АР-26-1 and АР-26ск-1 subgroups with fallback.
// ------------------------------------------------------------------

let dbRawRows = null;

const GROUP_LABELS = {
  'AR-26-1': 'АР-26-1',
  'AR-26sk-1': 'АР-26ск-1'
};

const DAY_NAMES = {
  1: 'Понеділок',
  2: 'Вівторок',
  3: 'Середа',
  4: 'Четвер',
  5: "П'ятниця"
};

const DAY_BADGES = {
  1: 'Початок пекла 💀',
  2: 'Спорт + Фізика ⚡',
  3: 'Екватор 🧠',
  4: 'Кодинг + Матан 💻',
  5: 'Майже свобода 🎉'
};

const DAY_STICKERS = {
  1: 'ТРЕБА ВИЖИТИ',
  2: 'ХАРДКОР',
  3: 'ВИШМАТ ТАЙМ',
  4: 'КОДИНГ 🚀',
  5: 'ФІНІШ 🏁'
};

function buildScheduleForGroup(rows, groupCode) {
  const primary = {};
  const overrides = {};

  for (const row of rows) {
    if (row.group_code === 'AR-26-1') {
      primary[row.day_of_week] = primary[row.day_of_week] || {};
      primary[row.day_of_week][row.pair_number] = row;
    }
    if (row.group_code === groupCode) {
      overrides[row.day_of_week] = overrides[row.day_of_week] || {};
      overrides[row.day_of_week][row.pair_number] = row;
    }
  }

  const days = {};
  for (let d = 1; d <= 5; d++) {
    days[d] = {
      dayId: d,
      dayName: DAY_NAMES[d],
      badge: DAY_BADGES[d],
      sticker: DAY_STICKERS[d],
      pairs: []
    };

    for (let p = 1; p <= 8; p++) {
      const row = (overrides[d] && overrides[d][p]) || (primary[d] && primary[d][p]);
      if (row) {
        days[d].pairs.push({
          num: row.pair_number,
          subject: row.subject,
          teacher: row.teacher,
          classroom: row.classroom || ''
        });
      }
    }

    days[d].pairs.sort((a, b) => a.num - b.num);
  }

  return Object.values(days);
}

function buildAllSchedules(rows) {
  const result = {};
  for (const code of Object.keys(GROUP_LABELS)) {
    result[code] = buildScheduleForGroup(rows, code);
  }
  return result;
}

function getIsNumerator(date) {
  const year = date.getFullYear();
  const monthIdx = date.getMonth();
  const day = date.getDate();

  const month = monthsData.find(m => m.year === year && m.monthIdx === monthIdx);
  if (!month) return true;

  const firstDayOfWeek = (new Date(year, monthIdx, 1).getDay() + 6) % 7;
  const dayOfMonth = day;

  let sundaysPassed = 0;
  if (firstDayOfWeek === 6) {
    sundaysPassed = Math.floor(dayOfMonth / 7);
  } else {
    const firstSunday = 7 - firstDayOfWeek;
    if (dayOfMonth > firstSunday) {
      sundaysPassed = 1 + Math.floor((dayOfMonth - firstSunday - 1) / 7);
    }
  }

  return sundaysPassed % 2 === 0 ? month.isNumeratorStart : !month.isNumeratorStart;
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

async function initSchedule() {
  dbRawRows = await loadScheduleFromDB();
  renderSchedule();
}

function getScheduleForGroup(groupCode) {
  if (dbRawRows) {
    return buildScheduleForGroup(dbRawRows, groupCode);
  }
  return scheduleData;
}

function renderSchedule() {
  const container = document.getElementById('scheduleContainer');
  const now = getNow();
  const today = now.getDay();
  const currentPairNum = getCurrentPairNum();

  container.innerHTML = '';
  container.classList.remove('today-only');

  if (currentView === 'today') {
    container.classList.add('today-only');

    if (today === 0 || today === 6) {
      container.innerHTML = `
        <div class="weekend-card">
          <div class="weekend-left">
            <div class="weekend-zzz">Z<small>z</small>z</div>
          </div>
          <div class="weekend-right">
            <div class="weekend-top-row">
              <span class="weekend-label">💤 ${today === 0 ? 'НЕДІЛЯ' : 'СУБОТА'}</span>
              <span class="weekend-tag"> free day</span>
            </div>
            <h2 class="weekend-heading">ВИХІДНИЙ!</h2>
            <h3 class="weekend-subheading">СПИ ДАЛІ</h3>
            <p class="weekend-desc">Сьогодні ніяких пар!</p>
          </div>
        </div>
      `;
      return;
    }

    const tabsHtml = Object.entries(GROUP_LABELS).map(([code, label]) =>
      `<button class="btn-brutal group-tab ${code === currentGroup ? 'active' : ''}" onclick="setGroup('${code}')">${label}</button>`
    ).join('');

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'group-tabs';
    tabsContainer.innerHTML = tabsHtml;
    container.appendChild(tabsContainer);

    const isNum = getIsNumerator(now);
    const weekTypeBadge = document.createElement('div');
    weekTypeBadge.className = 'week-type-badge';
    weekTypeBadge.textContent = isNum ? 'ЧИСЕЛЬНИК' : 'ЗНАМЕННИК';
    container.appendChild(weekTypeBadge);

    const scheduleForGroup = getScheduleForGroup(currentGroup);
    const todayData = scheduleForGroup.find(d => d.dayId === today);
    if (todayData) {
      container.appendChild(createDayCard(todayData, true, currentPairNum, currentGroup));
    }
  } else {
    const data = getScheduleForGroup('AR-26-1');
    data.forEach((dayData) => {
      const isToday = dayData.dayId === today;
      container.appendChild(createDayCard(dayData, isToday, isToday ? currentPairNum : null, 'AR-26-1'));
    });
  }
}

function setGroup(code) {
  currentGroup = code;
  renderSchedule();
  requestAnimationFrame(makePairBlocksAdminClickable);
}

function createDayCard(dayData, isToday, currentPairNum, groupCode) {
  const card = document.createElement('div');
  card.className = `day-card ${isToday ? 'is-today' : ''}`;

  let pairsHtml = '';
  dayData.pairs.forEach((pair) => {
    const timeObj = timeSlots[pair.num] || { text: "" };
    const time = timeObj.text;
    const isEmpty = pair.subject === "-";
    const isCurrent = (isToday && pair.num === currentPairNum);
    const classroomHtml = pair.classroom
      ? `<span class="classroom-tag">📍 ${escapeHtml(pair.classroom)}</span>`
      : '';

    if (isEmpty) {
      pairsHtml += `
        <div class="pair-block is-window ${isCurrent ? 'is-current-pair' : ''}" data-day="${dayData.dayId}" data-pair="${pair.num}" data-group="${groupCode}">
          <div class="pair-top-row">
            <span class="pair-number">#${pair.num} ПАРА</span>
            <span class="pair-hours">⏰ ${time}</span>
            ${isCurrent ? `<span class="live-badge">ЗАРАЗ</span>` : ''}
          </div>
          <div class="window-title">ВІКНО 🎉</div>
          <div class="window-subtitle">🎉🎉🎉🎉🎉🎉🎉</div>
        </div>
      `;
    } else {
      pairsHtml += `
        <div class="pair-block ${isCurrent ? 'is-current-pair' : ''}" data-day="${dayData.dayId}" data-pair="${pair.num}" data-group="${groupCode}">
          <div class="pair-top-row">
            <span class="pair-number">#${pair.num} ПАРА</span>
            <span class="pair-hours">⏰ ${time}</span>
            ${isCurrent ? `<span class="live-badge">ЗАРАЗ</span>` : ''}
          </div>
          <div class="pair-name">${escapeHtml(pair.subject)}</div>
          <div class="pair-footer">
            <span class="teacher-tag">👨‍🏫 ${escapeHtml(pair.teacher || 'Поки невідомо 🤷‍♂️')}</span>
            ${classroomHtml}
          </div>
        </div>
      `;
    }
  });

  card.innerHTML = `
    <div class="day-header">
      <span class="day-title">${dayData.dayName}</span>
      ${isToday ? `<span class="day-meta-badge">🔥 СЬОГОДНІ</span>` : ''}
    </div>
    <div class="pairs-body">
      ${pairsHtml}
    </div>
  `;

  return card;
}
