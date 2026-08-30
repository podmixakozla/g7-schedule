// ------------------------------------------------------------------
// Надійний фікс мерехтіння при швидкому наведенні (z-index race)
// Замінює ненадійний CSS transition-delay трюк на JS з відміною таймера
// ------------------------------------------------------------------
function initHoverZIndexFix(selector, baseZIndex, releaseDelayMs) {
  const pendingTimers = new WeakMap();
  let zCounter = baseZIndex;

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest(selector);
    if (!el) return;

    if (pendingTimers.has(el)) {
      clearTimeout(pendingTimers.get(el));
      pendingTimers.delete(el);
    }
    zCounter += 1;
    el.style.zIndex = zCounter;
  }, true);

  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest(selector);
    if (!el) return;
    if (el.contains(e.relatedTarget)) return; // йдемо всередину дочірнього елемента, не рахується

    const timerId = setTimeout(() => {
      el.style.zIndex = '';
      pendingTimers.delete(el);
    }, releaseDelayMs);
    pendingTimers.set(el, timerId);
  }, true);
}

initHoverZIndexFix('.cal-cell', 50, 140);
initHoverZIndexFix('.shame-card', 20, 220);

function initFloatingBackground() {
  // Прибрано за проханням користувача - мультяшний плаваючий фон
  // виглядав занадто "іграшково" для серйозного проєкту.
  const container = document.getElementById('floatingBg');
  if (!container) return;
  container.innerHTML = '';
}

function escapeHtml(str) {
  if (!str) return '';
  const p = document.createElement('p');
  p.textContent = str;
  return p.innerHTML;
}
