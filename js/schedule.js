function renderSchedule() {
  const container = document.getElementById('scheduleContainer');
  const now = new Date();
  const today = now.getDay();
  const currentPairNum = getCurrentPairNum();

  container.innerHTML = '';

  if (currentView === 'today') {
    container.classList.add('today-only');

    if (today === 0 || today === 6) {
      container.innerHTML = `
        <div class="weekend-card">
          <div style="font-size: 4rem;">🏖️🍕🎮</div>
          <h2>ВИХІДНИЙ! СПИ ДАЛІ</h2>
          <p style="font-size: 1.1rem; font-weight: 800; max-width: 450px;">
            Сьогодні ніяких пар!
          </p>
        </div>
      `;
      return;
    }

    const todayData = scheduleData.find(d => d.dayId === today);
    if (todayData) {
      container.appendChild(createDayCard(todayData, true, currentPairNum));
    }
  } else {
    container.classList.remove('today-only');
    scheduleData.forEach((dayData) => {
      const isToday = dayData.dayId === today;
      container.appendChild(createDayCard(dayData, isToday, isToday ? currentPairNum : null));
    });
  }
}

function createDayCard(dayData, isToday, currentPairNum) {
  const card = document.createElement('div');
  card.className = `day-card ${isToday ? 'is-today' : ''}`;

  let pairsHtml = '';
  dayData.pairs.forEach((pair) => {
    const timeObj = timeSlots[pair.num] || { text: "" };
    const time = timeObj.text;
    const isEmpty = pair.subject === "-";
    const isCurrent = (isToday && pair.num === currentPairNum);

    if (isEmpty) {
      pairsHtml += `
        <div class="pair-block is-window ${isCurrent ? 'is-current-pair' : ''}">
          <div class="pair-top-row">
            <span class="pair-number">#${pair.num} ПАРА</span>
            <span class="pair-hours">⏰ ${time}</span>
            ${isCurrent ? `<span class="live-badge">🔴 ЗАРАЗ</span>` : ''}
          </div>
          <div class="window-title">ВІКНО 🎉</div>
          <div class="window-subtitle">🎉🎉🎉🎉🎉🎉🎉</div>
        </div>
      `;
    } else {
      pairsHtml += `
        <div class="pair-block ${isCurrent ? 'is-current-pair' : ''}">
          <div class="pair-top-row">
            <span class="pair-number">#${pair.num} ПАРА</span>
            <span class="pair-hours">⏰ ${time}</span>
            ${isCurrent ? `<span class="live-badge">🔴 LIVE</span>` : ''}
          </div>
          <div class="pair-name">${escapeHtml(pair.subject)}</div>
          <div class="pair-footer">
            <span class="teacher-tag">👨‍🏫 ${escapeHtml(pair.teacher || 'Поки невідомо 🤷‍♂️')}</span>
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
