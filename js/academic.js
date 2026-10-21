// ------------------------------------------------------------------
// Навчальний календар: чисельник/знаменник, тип дня, парність пар
// Єдине джерело логіки для календаря, розкладу та таймера.
// ------------------------------------------------------------------

function findMonthData(date) {
  return monthsData.find(m => m.year === date.getFullYear() && m.monthIdx === date.getMonth()) || null;
}

// Індекс тижневого рядка в календарній сітці місяця (0 — перший, можливо неповний, тиждень).
function getMonthWeekRow(date) {
  const firstDow = (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7; // 0 = Пн
  return Math.floor((date.getDate() - 1 + firstDow) / 7);
}

// Чисельник чи знаменник. Рахується так само, як у сітці календаря:
// перший тиждень місяця = isNumeratorStart, далі чергування щопонеділка.
function getIsNumerator(date) {
  const month = findMonthData(date);
  if (!month) return true;
  const row = getMonthWeekRow(date);
  return row % 2 === 0 ? month.isNumeratorStart : !month.isNumeratorStart;
}

// 'theory' | 'control' | 'session' | 'vacation' | 'practice' | 'selfstudy' | null (поза навчальним роком)
function getDayType(date) {
  const month = findMonthData(date);
  if (!month) return null;
  const d = date.getDate();
  if (month.sessionDays && month.sessionDays.includes(d)) return 'session';
  if (month.controlDays && month.controlDays.includes(d)) return 'control';
  if (month.vacationDays && month.vacationDays.includes(d)) return 'vacation';
  if (month.practiceDays && month.practiceDays.includes(d)) return 'practice';
  if (month.selfStudyDays && month.selfStudyDays.includes(d)) return 'selfstudy';
  return 'theory';
}

const DAY_TYPE_LABELS = {
  theory: 'Теоретичне навчання',
  control: 'Контрольні заходи (КЗ/Т)',
  session: 'Сесія (С)',
  vacation: 'Канікули (К)',
  practice: 'Практика (П)',
  selfstudy: 'Самостійна робота (СР)'
};

// День, у який проходять звичайні пари за розкладом.
function isTeachingDay(date) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  const type = getDayType(date);
  return type !== 'session' && type !== 'vacation' && type !== 'practice' && type !== 'selfstudy';
}

// Чому сьогодні немає пар (або null, якщо день навчальний).
function getNoClassesReason(date) {
  const dow = date.getDay();
  const type = getDayType(date);
  if (type === 'vacation') return 'Канікули';
  if (type === 'session') return 'Сесія';
  if (type === 'practice') return 'Практика';
  if (type === 'selfstudy') return 'Самостійна робота (СР)';
  if (dow === 0 || dow === 6) return 'Вихідний';
  return null;
}

// "Вступ до фаху (чисельник)" → { subject: "Вступ до фаху", parity: 'num' }
// Підтримує варіанти: (чисельник), (по знаменнику), [знам.], тощо.
const PARITY_RE = /\s*[([]\s*(?:по\s+|лише\s+|тільки\s+)?(чис(?:ельник(?:у|а)?)?|знам(?:енник(?:у|а)?)?)\.?\s*[)\]]\s*/i;

function parsePairParity(subject) {
  const text = String(subject || '');
  const match = text.match(PARITY_RE);
  if (!match) return { subject: text.trim(), parity: null };
  const parity = match[1].toLowerCase().startsWith('чис') ? 'num' : 'den';
  return { subject: text.replace(PARITY_RE, ' ').replace(/\s{2,}/g, ' ').trim(), parity };
}

// Чи проходить пара в цю дату з урахуванням чисельника/знаменника.
function isPairOnDate(pair, date) {
  if (!pair.parity) return true;
  return (pair.parity === 'num') === getIsNumerator(date);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Понеділок поточного тижня
function getWeekMonday(date) {
  const d = startOfDay(date);
  const dow = (d.getDay() + 6) % 7;
  return addDays(d, -dow);
}
