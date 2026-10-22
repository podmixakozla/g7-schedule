// ------------------------------------------------------------------
// Статичні дані: дзвінки, групи, резервний розклад, календар
// ------------------------------------------------------------------

// Точний графік дзвінків НТУ «ДП» (хвилини від початку доби)
const timeSlots = {
  1: { text: "8:00 – 9:20",   from: "8:00",  to: "9:20",  start: 8 * 60,       end: 9 * 60 + 20 },
  2: { text: "9:35 – 10:55",  from: "9:35",  to: "10:55", start: 9 * 60 + 35,  end: 10 * 60 + 55 },
  3: { text: "11:20 – 12:40", from: "11:20", to: "12:40", start: 11 * 60 + 20, end: 12 * 60 + 40 },
  4: { text: "12:55 – 14:15", from: "12:55", to: "14:15", start: 12 * 60 + 55, end: 14 * 60 + 15 },
  5: { text: "14:30 – 15:50", from: "14:30", to: "15:50", start: 14 * 60 + 30, end: 15 * 60 + 50 },
  6: { text: "16:05 – 17:25", from: "16:05", to: "17:25", start: 16 * 60 + 5,  end: 17 * 60 + 25 },
  7: { text: "17:35 – 18:55", from: "17:35", to: "18:55", start: 17 * 60 + 35, end: 18 * 60 + 55 },
  8: { text: "19:05 – 20:25", from: "19:05", to: "20:25", start: 19 * 60 + 5,  end: 20 * 60 + 25 }
};

// Групи. Основна група — джерело "успадкованих" пар для прискореної групи.
const PRIMARY_GROUP = 'AR-26-1';
const GROUP_LABELS = {
  'AR-26-1': 'АР-26-1',
  'AR-26-2': 'АР-26-2',
  'AR-26sk-1': 'АР-26ск-1'
};

const PARENT_GROUP = {
  'AR-26sk-1': 'AR-26-1'
};

const DAY_NAMES = {
  0: 'Неділя',
  1: 'Понеділок',
  2: 'Вівторок',
  3: 'Середа',
  4: 'Четвер',
  5: "П'ятниця",
  6: 'Субота'
};

const DAY_SHORT = { 0: 'Нд', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' };

const MONTH_GENITIVE = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
];

// Резервний розклад (формат як у таблиці schedule_lessons).
// Використовується для миттєвого першого рендеру та якщо Supabase недоступний.
const fallbackScheduleRows = [
  { group_code: 'AR-26sk-1', day_of_week: 1, pair_number: 1, subject: "ТЙНМ", teacher: "Викладач невідомий", classroom: "3/14" },
  { group_code: 'AR-26-1', day_of_week: 1, pair_number: 2, subject: "ЦПУС(знаменник)", teacher: "Первий Г.Л.", classroom: "1/64" },
  { group_code: 'AR-26sk-1', day_of_week: 1, pair_number: 2, subject: "ТЙНМ", teacher: "Викладач невідомий", classroom: "3/14" },
  { group_code: 'AR-26-1', day_of_week: 1, pair_number: 3, subject: "Вступ до фаху", teacher: "Новицький І.В.", classroom: "3/14" },
  { group_code: 'AR-26sk-1', day_of_week: 1, pair_number: 3, subject: "Вступ до фаху", teacher: "Новицький І.В.", classroom: "3/14" },
  { group_code: 'AR-26-1', day_of_week: 1, pair_number: 4, subject: "Вступ до фаху", teacher: "Новицький І.В.", classroom: "3/14" },
  { group_code: 'AR-26sk-1', day_of_week: 1, pair_number: 4, subject: "Вступ до фаху", teacher: "Новицький І.В.", classroom: "3/14" },
  { group_code: 'AR-26-1', day_of_week: 2, pair_number: 1, subject: "Фізична культура і спорт", teacher: "Викладач невідомий", classroom: "" },
  { group_code: 'AR-26sk-1', day_of_week: 2, pair_number: 1, subject: "-", teacher: "", classroom: "" },
  { group_code: 'AR-26-1', day_of_week: 2, pair_number: 2, subject: "Інженерна та комп'ютерна графіка", teacher: "Довгаль Д.О.", classroom: "1/129" },
  { group_code: 'AR-26sk-1', day_of_week: 2, pair_number: 2, subject: "-", teacher: "", classroom: "" },
  { group_code: 'AR-26-1', day_of_week: 2, pair_number: 3, subject: "Фізика", teacher: "Куцева Н.О.", classroom: "2/30" },
  { group_code: 'AR-26sk-1', day_of_week: 2, pair_number: 3, subject: "ІМТОА", teacher: "Новицький І.В.", classroom: "3/14" },
  { group_code: 'AR-26sk-1', day_of_week: 2, pair_number: 4, subject: "ІМТОА", teacher: "Новицький І.В.", classroom: "3/14" },
  { group_code: 'AR-26-1', day_of_week: 3, pair_number: 1, subject: "Фізика", teacher: "Викладач невідомий", classroom: "2/27" },
  { group_code: 'AR-26sk-1', day_of_week: 3, pair_number: 1, subject: "-", teacher: "", classroom: "" },
  { group_code: 'AR-26-1', day_of_week: 3, pair_number: 2, subject: "Іноземна мова", teacher: "Викладач невідомий", classroom: "" },
  { group_code: 'AR-26sk-1', day_of_week: 3, pair_number: 2, subject: "-", teacher: "", classroom: "" },
  { group_code: 'AR-26-1', day_of_week: 3, pair_number: 3, subject: "Вища математика", teacher: "Уланова Н.П.", classroom: "10/611" },
  { group_code: 'AR-26sk-1', day_of_week: 3, pair_number: 3, subject: "Вища математика", teacher: "Уланова Н.П.", classroom: "10/611" },
  { group_code: 'AR-26-1', day_of_week: 3, pair_number: 4, subject: "Інженерна та комп'ютерна графіка", teacher: "Довгаль Д.О.", classroom: "1/123" },
  { group_code: 'AR-26sk-1', day_of_week: 3, pair_number: 4, subject: "БДКСА", teacher: "Славінський Д.В.", classroom: "3/14" },
  { group_code: 'AR-26-1', day_of_week: 4, pair_number: 2, subject: "Вища математика", teacher: "Клименко Д.В.", classroom: "5/32" },
  { group_code: 'AR-26sk-1', day_of_week: 4, pair_number: 2, subject: "Вища математика", teacher: "Клименко Д.В.", classroom: "5/32" },
  { group_code: 'AR-26-1', day_of_week: 4, pair_number: 3, subject: "Комп'ютерні технології та програмування", teacher: "Колісниченко І.Ю.", classroom: "3/14" },
  { group_code: 'AR-26sk-1', day_of_week: 4, pair_number: 3, subject: "Комп'ютерні технології та програмування", teacher: "Колісниченко І.Ю.", classroom: "3/14" },
  { group_code: 'AR-26-1', day_of_week: 4, pair_number: 4, subject: "Комп'ютерні технології та програмування(знаменник)", teacher: "Колісниченко І.Ю.", classroom: "3/14" },
  { group_code: 'AR-26sk-1', day_of_week: 4, pair_number: 4, subject: "Комп'ютерні технології та програмування(знаменник)", teacher: "Колісниченко І.Ю.", classroom: "3/14" },
  { group_code: 'AR-26sk-1', day_of_week: 5, pair_number: 2, subject: "БДКСА", teacher: "Славінський Д.В.", classroom: "3/14" },
  { group_code: 'AR-26sk-1', day_of_week: 5, pair_number: 3, subject: "ОКІК", teacher: "Воскобойник Є.К.", classroom: "3/14" },
  { group_code: 'AR-26-1', day_of_week: 5, pair_number: 4, subject: "ЦП в УС", teacher: "Первий Г.Л.", classroom: "1/69" },
  { group_code: 'AR-26sk-1', day_of_week: 5, pair_number: 4, subject: "ОКІК(чисельник)", teacher: "Воскобойник Є.К.", classroom: "3/14" },
  { group_code: 'AR-26-1', day_of_week: 5, pair_number: 5, subject: "ЦП в УС", teacher: "Перший Г.Л.", classroom: "1/69" },
  { group_code: 'AR-26sk-1', day_of_week: 5, pair_number: 5, subject: "-", teacher: "", classroom: "" },
  // AR-26-2 (резервний розклад)
  { group_code: 'AR-26-2', day_of_week: 1, pair_number: 2, subject: "ЦПУС д.Первий Г.Л. +ЕТФ, ММФ(знаменник)", teacher: "Викладач невідомий", classroom: "1/64" },
  { group_code: 'AR-26-2', day_of_week: 1, pair_number: 3, subject: "Всуп до фаху", teacher: "Новицький І.В.", classroom: "3/14" },
  { group_code: 'AR-26-2', day_of_week: 1, pair_number: 4, subject: "Вища математика", teacher: "иходько В.В.", classroom: "5/32" },
  { group_code: 'AR-26-2', day_of_week: 2, pair_number: 1, subject: "Фізична культура і спорт", teacher: "Викладач невідомий", classroom: "" },
  { group_code: 'AR-26-2', day_of_week: 2, pair_number: 2, subject: "Інженерна та комп'ютерна графіка", teacher: "Довгаль Д.О.", classroom: "1/129" },
  { group_code: 'AR-26-2', day_of_week: 2, pair_number: 3, subject: "Фізика д.Куцева Н.О. ЕТФ, ММФ", teacher: "Викладач невідомий", classroom: "2/30" },
  { group_code: 'AR-26-2', day_of_week: 2, pair_number: 4, subject: "ФІЗИКА 2/37", teacher: "Викладач невідомий", classroom: "" },
  { group_code: 'AR-26-2', day_of_week: 3, pair_number: 2, subject: "Іноземна мова", teacher: "Викладач невідомий", classroom: "" },
  { group_code: 'AR-26-2', day_of_week: 3, pair_number: 3, subject: "Вища математика д.Уланова Н.П. +ЕТФ", teacher: "Викладач невідомий", classroom: "10/611" },
  { group_code: 'AR-26-2', day_of_week: 4, pair_number: 2, subject: "ЦПУС д.Первий Г.Л. +ЕТФ, ММФ", teacher: "Викладач невідомий", classroom: "1/64" },
  { group_code: 'AR-26-2', day_of_week: 4, pair_number: 3, subject: "КТ та П", teacher: "Колисниченко І.Ю.", classroom: "3/14" },
  { group_code: 'AR-26-2', day_of_week: 4, pair_number: 4, subject: "КТ та П(чисельник)", teacher: "Колисниченко І.Ю.", classroom: "3/14" },
  { group_code: 'AR-26-2', day_of_week: 5, pair_number: 4, subject: "ЦПУС д.Первий Г.Л. +ЕТФ, ММФ", teacher: "Викладач невідомий", classroom: "1/64" }
];

// Опис місяців 2026/2027 н.р. за офіційним графіком освітнього процесу НТУ «ДП» (рядок 1Б).
// isNumeratorStart — чи є перший (неповний) тиждень місяця чисельником.
const monthsData = [
  { id: 'sep26', name: 'Вересень 2026', year: 2026, monthIdx: 8,  isNumeratorStart: true,  sessionDays: [], controlDays: [], vacationDays: [], practiceDays: [], selfStudyDays: [] },
  { id: 'oct26', name: 'Жовтень 2026',  year: 2026, monthIdx: 9,  isNumeratorStart: true,  sessionDays: [], controlDays: [12,13,14,15,16,17,18], vacationDays: [], practiceDays: [], selfStudyDays: [] },
  { id: 'nov26', name: 'Листопад 2026', year: 2026, monthIdx: 10, isNumeratorStart: true,  sessionDays: [30], controlDays: [23,24,25,26,27,28,29], vacationDays: [], practiceDays: [], selfStudyDays: [], studentDay: 17 },
  { id: 'dec26', name: 'Грудень 2026',  year: 2026, monthIdx: 11, isNumeratorStart: false, sessionDays: [1,2,3,4,5,6,7,8,9,10,11,12,13], controlDays: [], vacationDays: [14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31], practiceDays: [], selfStudyDays: [] },
  { id: 'jan27', name: 'Січень 2027',   year: 2027, monthIdx: 0,  isNumeratorStart: false, sessionDays: [], controlDays: [], vacationDays: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17], practiceDays: [], selfStudyDays: [18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  { id: 'feb27', name: 'Лютий 2027',    year: 2027, monthIdx: 1,  isNumeratorStart: true,  sessionDays: [], controlDays: [], vacationDays: [], practiceDays: [], selfStudyDays: [] },
  { id: 'mar27', name: 'Березень 2027', year: 2027, monthIdx: 2,  isNumeratorStart: true,  sessionDays: [], controlDays: [29,30,31], vacationDays: [], practiceDays: [], selfStudyDays: [] },
  { id: 'apr27', name: 'Квітень 2027',  year: 2027, monthIdx: 3,  isNumeratorStart: true,  sessionDays: [], controlDays: [1,2,3,4], vacationDays: [], practiceDays: [], selfStudyDays: [] },
  { id: 'may27', name: 'Травень 2027',  year: 2027, monthIdx: 4,  isNumeratorStart: true,  sessionDays: [31], controlDays: [24,25,26,27,28,29,30], vacationDays: [], practiceDays: [], selfStudyDays: [] },
  { id: 'jun27', name: 'Червень 2027',  year: 2027, monthIdx: 5,  isNumeratorStart: false, sessionDays: [1,2,3,4,5,6,7,8,9,10,11,12,13], controlDays: [], vacationDays: [], practiceDays: [14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30], selfStudyDays: [] },
  { id: 'jul27', name: 'Липень 2027',   year: 2027, monthIdx: 6,  isNumeratorStart: false, sessionDays: [], controlDays: [], vacationDays: [12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31], practiceDays: [1,2,3,4,5,6,7,8,9,10,11], selfStudyDays: [] },
  { id: 'aug27', name: 'Серпень 2027',  year: 2027, monthIdx: 7,  isNumeratorStart: false, sessionDays: [], controlDays: [], vacationDays: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31], practiceDays: [], selfStudyDays: [] }
];
