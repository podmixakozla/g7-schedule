function renderCalendar() {
  const grid = document.getElementById('monthsGrid');
  if (!grid) return;

  grid.innerHTML = '';

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const currentDayDate = now.getDate();

  monthsData.forEach((m, idx) => {
    // Dynamic ISO day-of-week calculation (0 = Mon, 6 = Sun)
    const startDayOfWeek = (new Date(m.year, m.monthIdx, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(m.year, m.monthIdx + 1, 0).getDate();

    const isCurrentMonth = (m.year === currentYear && m.monthIdx === currentMonthIdx);
    const isNextMonth = (idx > 0 && monthsData[idx - 1].year === currentYear && monthsData[idx - 1].monthIdx === currentMonthIdx);

    if (!(m.id in collapsedMonthsState)) {
      collapsedMonthsState[m.id] = !(isCurrentMonth || isNextMonth);
    }

    const isCollapsed = collapsedMonthsState[m.id];

    if (isCollapsed) {
      const strip = document.createElement('div');
      strip.className = 'month-strip';
      strip.onclick = () => toggleMonth(m.id);
      strip.innerHTML = `
        <span style="font-family: 'Archivo Black', sans-serif; text-transform: uppercase;">
          ${m.name} ${isCurrentMonth ? '🔥 [ПОТОЧНИЙ]' : ''}
        </span>
        <span class="btn-brutal" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;">РОЗГОРНУТИ ➕</span>
      `;
      grid.appendChild(strip);
      return;
    }

    const card = document.createElement('div');
    card.className = `month-card ${isCurrentMonth ? 'is-current-month' : 'is-other-month'}`;

    let stickerHtml = isCurrentMonth ? `<div class="current-month-sticker">🔥 ЗАРАЗ 👈</div>` : '';

    let tableHtml = `
      <table class="cal-table">
        <thead>
          <tr>
            <th>Пн</th><th>Вт</th><th>Ср</th><th>Чт</th><th>Пт</th><th>Сб</th><th>Нд</th>
          </tr>
        </thead>
        <tbody>
    `;

    let cellCounter = 0;
    let dayCounter = 1;
    let isNumerator = m.isNumeratorStart;

    for (let row = 0; row < 6; row++) {
      let rowHtml = '<tr>';
      let hasDaysInRow = false;

      for (let col = 0; col < 7; col++) {
        if (cellCounter < startDayOfWeek || dayCounter > daysInMonth) {
          rowHtml += `<td class="cal-cell empty"></td>`;
        } else {
          hasDaysInRow = true;
          const dNum = dayCounter;
          const isTodayCell = (isCurrentMonth && dNum === currentDayDate);

          let cellClass = 'cal-cell';
          let emojiIcon = '';

          if (m.sessionDays.includes(dNum)) {
            cellClass += ' type-session';
            emojiIcon = '<span class="cell-sticker-icon">💀</span>';
          } else if (m.controlDays.includes(dNum)) {
            cellClass += ' type-control';
          } else if (m.vacationDays.includes(dNum)) {
            cellClass += ' type-vacation';
          } else if (m.practiceDays.includes(dNum)) {
            cellClass += ' type-practice';
          } else {
            cellClass += ' type-theory';
          }

          if (isNumerator) cellClass += ' is-numerator';
          if (isTodayCell) cellClass += ' is-today-cell';

          let onClickAttr = '';
          if (m.studentDay === dNum) {
            cellClass += ' student-day-ring';
            emojiIcon = '<span class="cell-sticker-icon">🎉</span>';
            onClickAttr = `onclick="triggerStudentDayEasterEgg(event)" title="День студента! Натисни для салюту"`;
          }

          rowHtml += `
            <td class="${cellClass}" ${onClickAttr}>
              ${dNum}
              ${emojiIcon}
            </td>
          `;
          dayCounter++;
        }

        cellCounter++;

        if (col === 6 && dayCounter <= daysInMonth) {
          isNumerator = !isNumerator;
        }
      }

      rowHtml += '</tr>';
      if (hasDaysInRow) tableHtml += rowHtml;
    }

    tableHtml += `</tbody></table>`;

    card.innerHTML = `
      ${stickerHtml}
      <div class="month-name">
        <span>${m.name}</span>
        <button class="btn-brutal" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;" onclick="toggleMonth('${m.id}')">
          ЗГОРНУТИ ✕
        </button>
      </div>
      ${tableHtml}
    `;

    grid.appendChild(card);
  });
}

function toggleMonth(monthId) {
  collapsedMonthsState[monthId] = !collapsedMonthsState[monthId];
  renderCalendar();
}

function toggleAllMonths() {
  const allCollapsed = Object.values(collapsedMonthsState).every(val => val);
  monthsData.forEach(m => {
    collapsedMonthsState[m.id] = !allCollapsed;
  });
  renderCalendar();
}

function triggerStudentDayEasterEgg(e) {
  e.stopPropagation();
  spawnConfettiBurst(50);
  alert("🎉 ДЕНЬ СТУДЕНТА (17 Листопада)! Відривайся на повну! 🥳");
}
