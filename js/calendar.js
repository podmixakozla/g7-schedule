// ------------------------------------------------------------------
// Calendar Module
// Відображає навчальний календар 2026/2027.
// ------------------------------------------------------------------

function ensureMonthsInitialized(now) {
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  monthsData.forEach((m, idx) => {
    if (m.id in collapsedMonthsState) return;
    const isCurrent = m.year === currentYear && m.monthIdx === currentMonthIdx;
    const isNext = idx > 0 && monthsData[idx - 1].year === currentYear && monthsData[idx - 1].monthIdx === currentMonthIdx;
    collapsedMonthsState[m.id] = !(isCurrent || isNext);
  });
}

function updateToggleAllLabel() {
  const btn = document.getElementById('btnToggleAllMonths');
  if (!btn) return;
  const allCollapsed = monthsData.every(m => collapsedMonthsState[m.id]);
  btn.textContent = allCollapsed ? 'Розгорнути всі' : 'Згорнути всі';
}

function summarizeMonth(m) {
  const parts = [];
  if (m.controlDays.length) parts.push('Контроль');
  if (m.sessionDays.length) parts.push('Сесія');
  if (m.vacationDays.length) parts.push('Канікули');
  if (m.practiceDays.length) parts.push('Практика');
  return parts.join(' · ');
}

function renderCalendar() {
  const grid = document.getElementById('monthsGrid');
  if (!grid) return;

  const now = getNow();
  ensureMonthsInitialized(now);
  updateToggleAllLabel();

  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const currentDayDate = now.getDate();

  grid.innerHTML = '';

  monthsData.forEach((m) => {
    const startDayOfWeek = (new Date(m.year, m.monthIdx, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(m.year, m.monthIdx + 1, 0).getDate();
    const isCurrentMonth = m.year === currentYear && m.monthIdx === currentMonthIdx;
    const isCollapsed = collapsedMonthsState[m.id];
    const summary = summarizeMonth(m);

    if (isCollapsed) {
      const strip = document.createElement('button');
      strip.type = 'button';
      strip.className = `month-strip ${isCurrentMonth ? 'is-current' : ''}`;
      strip.onclick = () => toggleMonth(m.id);
      strip.innerHTML = `
        <div class="month-strip-main">
          <span class="month-strip-name">${escapeHtml(m.name)}</span>
          ${isCurrentMonth ? '<span class="chip chip-accent chip-xs">Зараз</span>' : ''}
          ${summary ? `<span class="month-strip-meta">${escapeHtml(summary)}</span>` : ''}
        </div>
        <span class="month-strip-chevron">${icon('chevronRight', 18)}</span>
      `;
      grid.appendChild(strip);
      return;
    }

    const card = document.createElement('div');
    card.className = `month-card ${isCurrentMonth ? 'is-current' : ''}`;

    let rowsHtml = '';
    let cellCounter = 0;
    let dayCounter = 1;
    let isNumerator = m.isNumeratorStart;

    for (let row = 0; row < 6; row++) {
      let cells = `<td class="cal-week ${isNumerator ? 'is-num' : 'is-den'}" title="${isNumerator ? 'Чисельник' : 'Знаменник'}">${isNumerator ? 'Ч' : 'З'}</td>`;
      let hasDaysInRow = false;

      for (let col = 0; col < 7; col++) {
        if (cellCounter < startDayOfWeek || dayCounter > daysInMonth) {
          cells += '<td class="cal-cell is-empty"></td>';
        } else {
          hasDaysInRow = true;
          const dNum = dayCounter;
          const isTodayCell = isCurrentMonth && dNum === currentDayDate;

          let type = 'theory';
          if (m.sessionDays.includes(dNum)) type = 'session';
          else if (m.controlDays.includes(dNum)) type = 'control';
          else if (m.vacationDays.includes(dNum)) type = 'vacation';
          else if (m.practiceDays.includes(dNum)) type = 'practice';

          let cls = `cal-cell type-${type}`;
          if (col >= 5) cls += ' is-weekend';
          if (isTodayCell) cls += ' is-today';

          let attrs = `title="${dNum} ${MONTH_GENITIVE[m.monthIdx]} · ${DAY_TYPE_LABELS[type]} · ${isNumerator ? 'Чисельник' : 'Знаменник'}"`;
          if (m.studentDay === dNum) {
            cls += ' is-student-day';
            attrs = `onclick="triggerStudentDayEasterEgg(event)" title="17 листопада — День студента"`;
          }

          cells += `<td class="${cls}" ${attrs}><span>${dNum}</span></td>`;
          dayCounter++;
        }

        cellCounter++;
        if (col === 6 && dayCounter <= daysInMonth) {
          isNumerator = !isNumerator;
        }
      }

      if (hasDaysInRow) rowsHtml += `<tr>${cells}</tr>`;
    }

    card.innerHTML = `
      <button type="button" class="month-head" onclick="toggleMonth('${m.id}')">
        <div class="month-head-title">
          <span>${escapeHtml(m.name)}</span>
          ${isCurrentMonth ? '<span class="chip chip-accent chip-xs">Зараз</span>' : ''}
        </div>
        <span class="month-head-action">${icon('chevronDown', 18)}</span>
      </button>
      <div class="cal-table-wrap">
        <table class="cal-table">
          <thead>
            <tr>
              <th class="cal-week-head" title="Чисельник / Знаменник">Т</th>
              <th>Пн</th><th>Вт</th><th>Ср</th><th>Чт</th><th>Пт</th><th class="is-weekend">Сб</th><th class="is-weekend">Нд</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    grid.appendChild(card);
  });
}

function toggleMonth(monthId) {
  ensureMonthsInitialized(getNow());
  collapsedMonthsState[monthId] = !collapsedMonthsState[monthId];
  haptic('light');
  renderCalendar();
}

function toggleAllMonths() {
  ensureMonthsInitialized(getNow());
  const allCollapsed = monthsData.every(m => collapsedMonthsState[m.id]);
  monthsData.forEach(m => {
    collapsedMonthsState[m.id] = !allCollapsed;
  });
  haptic('light');
  renderCalendar();
}

function triggerStudentDayEasterEgg(e) {
  e.stopPropagation();
  const rect = e.currentTarget.getBoundingClientRect();
  spawnConfettiBurst(45, rect.left + rect.width / 2, rect.top + rect.height / 2);
  haptic('success');
  toast('17 листопада — День студента!', 'success');
}
