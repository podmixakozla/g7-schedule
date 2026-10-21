// ------------------------------------------------------------------
// Clock & Live Status Module
// Обраховує поточну/наступну пару для обраної групи з урахуванням
// чисельника/знаменника, вікон і навчального календаря.
// ------------------------------------------------------------------

let lastLivePairKey = null;

// Номер пари, яка триває просто зараз (напіввідкритий інтервал [start, end)).
function getCurrentPairNum(now = getNow()) {
  if (!isTeachingDay(now)) return null;
  const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  for (const [num, slot] of Object.entries(timeSlots)) {
    if (sec >= slot.start * 60 && sec < slot.end * 60) {
      return parseInt(num, 10);
    }
  }
  return null;
}

// Реальні пари обраної групи на конкретну дату (без вікон та пар іншого тижня).
function getRealPairsForDate(date, groupCode = currentGroup) {
  if (!isTeachingDay(date)) return [];
  const dayData = getScheduleForGroup(groupCode).find(d => d.dayId === date.getDay());
  if (!dayData) return [];
  return dayData.pairs.filter(p => !p.isWindow && isPairOnDate(p, date));
}

// Знаходить стан на зараз: активна пара, перерва/вікно до наступної пари сьогодні,
// або наступна пара в інший навчальний день.
function computeScheduleStatus(now = getNow(), groupCode = currentGroup) {
  const secNow = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const todayPairs = getRealPairsForDate(now, groupCode);

  for (const p of todayPairs) {
    const slot = timeSlots[p.num];
    if (!slot) continue;
    const startSec = slot.start * 60;
    const endSec = slot.end * 60;
    if (secNow >= startSec && secNow < endSec) {
      return {
        kind: 'live',
        pair: p,
        slot,
        remainingSec: endSec - secNow,
        progress: ((secNow - startSec) / (endSec - startSec)) * 100
      };
    }
    if (secNow < startSec) {
      return {
        kind: 'today-next',
        pair: p,
        slot,
        untilSec: startSec - secNow
      };
    }
  }

  const hadPairsToday = todayPairs.length > 0;

  // Наступна пара — у найближчий навчальний день після сьогодні.
  for (let add = 1; add <= 120; add++) {
    const d = addDays(startOfDay(now), add);
    const pairs = getRealPairsForDate(d, groupCode);
    if (pairs.length > 0) {
      const first = pairs[0];
      const slot = timeSlots[first.num];
      const target = new Date(d);
      target.setHours(Math.floor(slot.start / 60), slot.start % 60, 0, 0);
      return {
        kind: 'upcoming',
        todayFinished: hadPairsToday,
        todayCount: todayPairs.length,
        date: d,
        daysAhead: add,
        pair: first,
        slot,
        untilSec: Math.max(0, Math.floor((target - now) / 1000))
      };
    }
  }

  return { kind: 'none', todayFinished: hadPairsToday, todayCount: todayPairs.length };
}

function updateClockAndCountdown(forceRender = false) {
  const now = getNow();
  const liveKey = `${now.getDay()}:${getCurrentPairNum(now) || 0}`;

  if (lastLivePairKey !== null && lastLivePairKey !== liveKey && (currentView === 'today' || currentView === 'week')) {
    lastLivePairKey = liveKey;
    renderSchedule();
    return;
  }
  lastLivePairKey = liveKey;

  const card = document.getElementById('nowCard');
  if (!card) return;

  const status = computeScheduleStatus(now, currentGroup);
  const signature = `${status.kind}:${status.pair ? status.pair.num : 0}:${currentGroup}`;

  if (forceRender || card.dataset.sig !== signature) {
    card.dataset.sig = signature;
    card.className = `now-card is-${status.kind}`;
    card.innerHTML = buildNowCardHtml(status, now);
  } else {
    const timerEl = card.querySelector('[data-now-timer]');
    if (timerEl) {
      const sec = status.kind === 'live' ? status.remainingSec : status.untilSec;
      timerEl.textContent = formatCountdown(sec);
    }
    const barEl = card.querySelector('[data-now-progress]');
    if (barEl && status.kind === 'live') {
      barEl.style.width = `${status.progress.toFixed(1)}%`;
    }
    const waveEl = card.querySelector('[data-now-wave]');
    if (waveEl && status.kind === 'live') {
      const bars = waveEl.querySelectorAll('i');
      const activeCount = Math.round((status.progress / 100) * bars.length);
      bars.forEach((b, idx) => b.classList.toggle('is-filled', idx < activeCount));
    }
  }
}

function buildWaveBars(progressPct = 40, count = 28) {
  const heights = [38, 62, 48, 80, 95, 70, 52, 86, 64, 42, 74, 92, 60, 46, 82, 68, 50, 88, 96, 72, 54, 78, 62, 44, 84, 68, 52, 40];
  const activeCount = Math.round((Math.max(8, Math.min(100, progressPct)) / 100) * count);
  const bars = [];
  for (let i = 0; i < count; i++) {
    const h = heights[i % heights.length];
    const filled = i < activeCount ? 'is-filled' : '';
    bars.push(`<i class="${filled}" style="height:${h}%"></i>`);
  }
  return `<div class="now-wave" data-now-wave aria-hidden="true">${bars.join('')}</div>`;
}

function buildNowCardHtml(status, now) {
  const dateHeader = `${DAY_NAMES[now.getDay()]}, ${formatDayMonth(now)}`;

  if (status.kind === 'live') {
    const p = status.pair;
    const meta = [p.teacher, p.classroom ? `ауд. ${p.classroom}` : ''].filter(Boolean).join(' · ') || `${DAY_NAMES[now.getDay()]}, ${formatDayMonth(now)}`;
    return `
      <div class="now-top">
        <div class="now-head-left">
          <div class="now-title">${escapeHtml(p.subject)}</div>
          <div class="now-sub">${escapeHtml(meta)}</div>
        </div>
        <span class="live-pill"><i></i>Зараз</span>
      </div>
      ${buildWaveBars(status.progress)}
      <div class="now-stats">
        <div class="now-stat">
          <span class="now-stat-label">Час пари</span>
          <strong class="now-stat-val mono">${escapeHtml(status.slot.from)} – ${escapeHtml(status.slot.to)}</strong>
        </div>
        <div class="now-stat">
          <span class="now-stat-label">Заняття</span>
          <strong class="now-stat-val">${p.num} пара</strong>
        </div>
        <div class="now-stat">
          <span class="now-stat-label">Залишилось</span>
          <strong class="now-stat-val mono" data-now-timer>${formatCountdown(status.remainingSec)}</strong>
        </div>
      </div>
    `;
  }

  if (status.kind === 'today-next') {
    const p = status.pair;
    const meta = [p.teacher, p.classroom ? `ауд. ${p.classroom}` : ''].filter(Boolean).join(' · ') || `${DAY_NAMES[now.getDay()]}, ${formatDayMonth(now)}`;
    return `
      <div class="now-top">
        <div class="now-head-left">
          <div class="now-title">${escapeHtml(p.subject)}</div>
          <div class="now-sub">${escapeHtml(meta)}</div>
        </div>
        <span class="now-corner-icon">${icon('arrowUpRight', 18)}</span>
      </div>
      ${buildWaveBars(22)}
      <div class="now-stats">
        <div class="now-stat">
          <span class="now-stat-label">Час пари</span>
          <strong class="now-stat-val mono">${escapeHtml(status.slot.from)} – ${escapeHtml(status.slot.to)}</strong>
        </div>
        <div class="now-stat">
          <span class="now-stat-label">Наступна</span>
          <strong class="now-stat-val">${p.num} пара</strong>
        </div>
        <div class="now-stat">
          <span class="now-stat-label">Початок через</span>
          <strong class="now-stat-val mono" data-now-timer>${formatCountdown(status.untilSec)}</strong>
        </div>
      </div>
    `;
  }

  if (status.kind === 'upcoming') {
    const p = status.pair;
    const reason = getNoClassesReason(now);
    const when = status.daysAhead === 1 ? 'Завтра' : `${DAY_SHORT[status.date.getDay()]}, ${status.date.getDate()}.${pad2(status.date.getMonth() + 1)}`;
    const mainTitle = status.todayFinished
      ? 'На сьогодні пари закінчилися'
      : 'Сьогодні занять немає';
    const subtitle = status.todayFinished
      ? `Усі заняття (${status.todayCount} ${plural(status.todayCount, ['пара', 'пари', 'пар'])}) завершено · Далі: ${p.subject}`
      : `${reason || 'Вільний від занять день'} · Далі: ${p.subject}`;
    return `
      <div class="now-top">
        <div class="now-head-left">
          <div class="now-title">${escapeHtml(mainTitle)}</div>
          <div class="now-sub">${escapeHtml(subtitle)}</div>
        </div>
        <span class="now-corner-icon">${icon('arrowUpRight', 18)}</span>
      </div>
      ${buildWaveBars(status.todayFinished ? 100 : 12)}
      <div class="now-stats">
        <div class="now-stat">
          <span class="now-stat-label">Наступна</span>
          <strong class="now-stat-val">${p.num} пара · ${escapeHtml(status.slot.from)}</strong>
        </div>
        <div class="now-stat">
          <span class="now-stat-label">Коли</span>
          <strong class="now-stat-val mono">${escapeHtml(when)}</strong>
        </div>
        <div class="now-stat">
          <span class="now-stat-label">До початку</span>
          <strong class="now-stat-val mono" data-now-timer>${formatCountdown(status.untilSec)}</strong>
        </div>
      </div>
    `;
  }

  return `
    <div class="now-top">
      <div class="now-head-left">
        <div class="now-title">${status.todayFinished ? 'На сьогодні пари закінчилися' : 'Сьогодні занять немає'}</div>
        <div class="now-sub">${escapeHtml(dateHeader)}</div>
      </div>
    </div>
  `;
}
