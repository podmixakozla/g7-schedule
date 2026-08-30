function getCurrentPairNum() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const [num, slot] of Object.entries(timeSlots)) {
    if (currentMinutes >= slot.start && currentMinutes <= slot.end) {
      return parseInt(num, 10);
    }
  }
  return null;
}

function updateClockAndCountdown() {
  const now = new Date();
  const clockEl = document.getElementById('liveClock');
  const dayOfWeek = now.getDay(); // 0 = Нд, 1 = Пн, ... 6 = Сб
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentSeconds = now.getSeconds();

  let statusText = "";

  const todayData = scheduleData.find(d => d.dayId === dayOfWeek);

  if (todayData) {
    let activePair = null;
    let nextPair = null;

    for (const p of todayData.pairs) {
      const slot = timeSlots[p.num];
      if (!slot) continue;

      if (currentMinutes >= slot.start && currentMinutes < slot.end) {
        activePair = p;
        break;
      }
      if (currentMinutes < slot.start && !nextPair) {
        nextPair = p;
      }
    }

    if (activePair) {
      const slot = timeSlots[activePair.num];
      const remainingSec = (slot.end * 60) - (currentMinutes * 60 + currentSeconds);
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      statusText = `⏳ До кінця #${activePair.num} пари: ${formatted}`;
    } else if (nextPair) {
      const slot = timeSlots[nextPair.num];
      const untilSec = (slot.start * 60) - (currentMinutes * 60 + currentSeconds);
      const mins = Math.floor(untilSec / 60);
      const secs = untilSec % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      statusText = `⏰ До #${nextPair.num} пари: ${formatted}`;
    }
  }

  if (!statusText) {
    let daysToAdd = 1;
    let targetDayId = (dayOfWeek + 1) % 7;
    
    while (targetDayId === 0 || targetDayId === 6 || !scheduleData.some(d => d.dayId === targetDayId)) {
      daysToAdd++;
      targetDayId = (targetDayId + 1) % 7;
    }

    const nextDayData = scheduleData.find(d => d.dayId === targetDayId);
    const firstPairNum = nextDayData.pairs[0].num;
    const firstSlot = timeSlots[firstPairNum];

    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysToAdd);
    targetDate.setHours(Math.floor(firstSlot.start / 60), firstSlot.start % 60, 0, 0);

    const diffMs = targetDate - now;
    const totalSec = Math.floor(diffMs / 1000);
    const d = Math.floor(totalSec / (3600 * 24));
    const h = Math.floor((totalSec % (3600 * 24)) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    const timeStr = `${d > 0 ? d + 'д ' : ''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    statusText = `⏰ До #${firstPairNum} пари (${nextDayData.dayName}): ${timeStr}`;
  }

  if (clockEl) {
    clockEl.textContent = statusText;
  }
}
