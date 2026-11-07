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

  let prevEndSec = null;
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
        remainingSec: endSec - secNow
      };
    }
    if (secNow < startSec) {
      const firstSlotStartSec = timeSlots[1] ? timeSlots[1].start * 60 : 8 * 3600;
      const isWindow = prevEndSec !== null || (p.num > 1 && secNow >= firstSlotStartSec);
      return {
        kind: isWindow ? 'window' : 'today-next',
        pair: p,
        slot,
        untilSec: startSec - secNow
      };
    }
    prevEndSec = endSec;
  }

  const hadPairsToday = todayPairs.length > 0;

  // Наступна пара — у найближчий навчальний день після сьогодні.
  for (let add = 1; add <= 120; add++) {
    const d = addDays(startOfDay(now), add);
    const pairs = getRealPairsForDate(d, groupCode);
    if (pairs.length > 0) {
      const first = pairs[0];
      const slot = timeSlots[first.num];
      return {
        kind: 'upcoming',
        todayFinished: hadPairsToday,
        date: d,
        daysAhead: add,
        pair: first,
        slot
      };
    }
  }

  return { kind: 'none', todayFinished: hadPairsToday };
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
  const notices = document.getElementById('scheduleNotices');
  if (typeof activeAnnouncement !== 'undefined' && activeAnnouncement && typeof isAnnouncementExpired === 'function' && isAnnouncementExpired(activeAnnouncement)) {
    activeAnnouncement = null;
    if (typeof triggerExpiredAnnouncementsCleanup === 'function') {
      triggerExpiredAnnouncementsCleanup();
    }
  }
  const newsObj = (typeof activeAnnouncement !== 'undefined' && activeAnnouncement && activeAnnouncement.is_active && typeof isAnnouncementDismissed === 'function' && !isAnnouncementDismissed(activeAnnouncement.id))
    ? activeAnnouncement
    : null;
  const newsSig = newsObj ? `${newsObj.id}:${typeof activeAnnouncementIndex !== 'undefined' ? activeAnnouncementIndex : 0}:${announcementExpanded ? '1' : '0'}` : 'none';
  const changeObj = (typeof getActiveScheduleChangeForGroup === 'function')
    ? getActiveScheduleChangeForGroup(currentGroup)
    : null;
  const changeSig = changeObj ? changeObj.key : 'nochange';
  const signature = `${status.kind}:${status.pair?.num ?? 0}:${now.toDateString()}:${currentGroup}`;
  if (forceRender || card.dataset.sig !== signature) {
    card.dataset.sig = signature;
    card.innerHTML = buildNowCardHtml(status, now);
  } else {
    const statusLabel = card.querySelector('[data-now-status]');
    if (statusLabel) {
      const text = getNowStatusLabel(status);
      if (statusLabel.textContent !== text) statusLabel.textContent = text;
    }
  }

  if (notices) {
    const noticeSignature = `${newsSig}:${changeSig}`;
    if (forceRender || notices.dataset.sig !== noticeSignature) {
      notices.dataset.sig = noticeSignature;
      notices.innerHTML = buildNowCardScheduleChangeHtml(currentGroup) + buildNowCardAnnouncementHtml();
      notices.hidden = !notices.firstElementChild;
    }
  }
}

function getNowStatusLabel(status) {
  const seconds = status.kind === 'live' ? status.remainingSec : status.untilSec;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const duration = [hours ? `${hours} год` : '', remainder ? `${remainder} хв` : ''].filter(Boolean).join(' ');
  return status.kind === 'live' ? `Йде пара · ще ${duration}` : `Наступна пара · через ${duration}`;
}

function buildNowCardHtml(status, now) {
  const dayStatus = status.todayFinished ? 'Пари на сьогодні закінчилися' : (getNoClassesReason(now) || 'Сьогодні пар немає');
  if (status.kind === 'none') {
    return `
      <h2 class="now-title">${escapeHtml(dayStatus)}</h2>
      <p class="now-sub">У розкладі поки немає наступної пари</p>
    `;
  }

  const { pair, slot } = status;
  const upcoming = status.kind === 'upcoming';
  const when = upcoming
    ? (status.daysAhead === 1 ? 'Завтра' : `${DAY_SHORT[status.date.getDay()]}, ${formatDayMonth(status.date)}`)
    : '';
  const time = status.kind === 'live' ? `до ${slot.to}` : `${slot.from}–${slot.to}`;
  return `
    ${upcoming
      ? `<p class="now-status">${escapeHtml(dayStatus)} · наступна пара</p>`
      : `<p class="now-status" data-now-status>${escapeHtml(getNowStatusLabel(status))}</p>`}
    <h2 class="now-title">${escapeHtml(pair.subject)}</h2>
    <div class="now-meta">
      ${pair.classroom ? `<strong>${icon('pin', 16)} Ауд. ${escapeHtml(pair.classroom)}</strong>` : ''}
      <span>${icon('clock', 16)} ${when ? `${escapeHtml(when)} · ` : ''}${escapeHtml(time)}</span>
    </div>
    ${pair.teacher ? `<p class="now-sub">${escapeHtml(pair.teacher)}</p>` : ''}
  `;
}
