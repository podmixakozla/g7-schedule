function setViewMode(mode) {
  currentView = mode;
  document.getElementById('btnWeek').classList.toggle('active', mode === 'week');
  document.getElementById('btnToday').classList.toggle('active', mode === 'today');
  document.getElementById('btnCalendar').classList.toggle('active', mode === 'calendar');
  document.getElementById('btnShame').classList.toggle('active', mode === 'shame');

  const schedEl = document.getElementById('scheduleContainer');
  const calEl = document.getElementById('calendarContainer');
  const shameEl = document.getElementById('shameContainer');

  schedEl.style.display = (mode === 'week' || mode === 'today') ? 'grid' : 'none';
  calEl.style.display = (mode === 'calendar') ? 'flex' : 'none';
  shameEl.style.display = (mode === 'shame') ? 'flex' : 'none';

  if (mode === 'week' || mode === 'today') {
    renderSchedule();
  } else if (mode === 'calendar') {
    renderCalendar();
  } else if (mode === 'shame') {
    loadShameEntries();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initFloatingBackground();
  renderSchedule();
  updateClockAndCountdown();
  setInterval(updateClockAndCountdown, 1000);
  await initAuth();
});
