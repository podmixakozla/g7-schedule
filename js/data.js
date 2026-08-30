// Демо-дані для дошки ганьби
const initialDemoShameEntries = [
  {
    id: 1,
    name: "Петро Забувака",
    reason: "Прийшов на лабораторну з фізики без конспекту і розповів викладачу про теорію плоскої землі 🌍💀",
    photo_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80",
    created_at: new Date(Date.now() - 3600000 * 5).toISOString()
  },
  {
    id: 2,
    name: "Макс Кавоман",
    reason: "Пішов у вікно на каву о 11:20 і повернувся о 16:05 зі словами 'ой, трохи засидівся' ☕️🏃‍♂️",
    photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
    created_at: new Date(Date.now() - 3600000 * 24).toISOString()
  }
];

// Точний графік дзвінків НТУ «ДП»
const timeSlots = {
  1: { text: "8:00 – 9:20", start: 8 * 60, end: 9 * 60 + 20 },
  2: { text: "9:35 – 10:55", start: 9 * 60 + 35, end: 10 * 60 + 55 },
  3: { text: "11:20 – 12:40", start: 11 * 60 + 20, end: 12 * 60 + 40 },
  4: { text: "12:55 – 14:15", start: 12 * 60 + 55, end: 14 * 60 + 15 },
  5: { text: "14:30 – 15:50", start: 14 * 60 + 30, end: 15 * 60 + 50 },
  6: { text: "16:05 – 17:25", start: 16 * 60 + 5, end: 17 * 60 + 25 },
  7: { text: "17:35 – 18:55", start: 17 * 60 + 35, end: 18 * 60 + 55 },
  8: { text: "19:05 – 20:25", start: 19 * 60 + 5, end: 20 * 60 + 25 }
};

const scheduleData = [
  {
    dayId: 1,
    dayName: "Понеділок",
    badge: "Початок пекла 💀",
    sticker: "ТРЕБА ВИЖИТИ",
    pairs: [
      { num: 1, subject: "-", teacher: "" },
      { num: 2, subject: "Цивілізаційні процеси в укр. суспільстві", teacher: "Первий" },
      { num: 3, subject: "Вступ до фаху", teacher: "Новицький" },
      { num: 4, subject: "Вступ до фаху", teacher: "Новицький" }
    ]
  },
  {
    dayId: 2,
    dayName: "Вівторок",
    badge: "Спорт + Фізика ⚡",
    sticker: "ХАРДКОР",
    pairs: [
      { num: 1, subject: "Фізична культура і спорт", teacher: "Поки невідомо 🤷‍♂️" },
      { num: 2, subject: "Інженерна та комп'ютерна графіка", teacher: "Довгаль" },
      { num: 3, subject: "Фізика", teacher: "Куцева" },
      { num: 4, subject: "Фізика", teacher: "Куцева" }
    ]
  },
  {
    dayId: 3,
    dayName: "Середа",
    badge: "Екватор 🧠",
    sticker: "ВИШМАТ ТАЙМ",
    pairs: [
      { num: 1, subject: "-", teacher: "" },
      { num: 2, subject: "Іноземна мова", teacher: "Поки невідомо 🤷‍♂️" },
      { num: 3, subject: "Вища математика", teacher: "Уланова" },
      { num: 4, subject: "Інженерна та комп'ютерна графіка", teacher: "Довгаль" }
    ]
  },
  {
    dayId: 4,
    dayName: "Четвер",
    badge: "Кодинг + Матан 💻",
    sticker: "КОДИНГ 🚀",
    pairs: [
      { num: 1, subject: "-", teacher: "" },
      { num: 2, subject: "Вища математика", teacher: "Клименко" },
      { num: 3, subject: "Комп'ютерні технології та програмування", teacher: "Колісниченко" },
      { num: 4, subject: "Комп'ютерні технології та програмування", teacher: "Колісниченко" }
    ]
  },
  {
    dayId: 5,
    dayName: "П'ятниця",
    badge: "Майже свобода 🎉",
    sticker: "ФІНІШ 🏁",
    pairs: [
      { num: 1, subject: "Цивілізаційні процеси в укр. суспільстві", teacher: "Первий" },
      { num: 2, subject: "-", teacher: "" },
      { num: 3, subject: "-", teacher: "" },
      { num: 4, subject: "Цивілізаційні процеси в укр. суспільстві", teacher: "Первий" }
    ]
  }
];

// Опис місяців 2026/2027 н.р.
const monthsData = [
  { id: 'sep26', name: 'Вересень 2026', year: 2026, monthIdx: 8, isNumeratorStart: true, sessionDays: [], controlDays: [], vacationDays: [], practiceDays: [] },
  { id: 'oct26', name: 'Жовтень 2026', year: 2026, monthIdx: 9, isNumeratorStart: false, sessionDays: [], controlDays: [12,13,14,15,16,17,18,26,27,28,29,30,31], vacationDays: [], practiceDays: [] },
  { id: 'nov26', name: 'Листопад 2026', year: 2026, monthIdx: 10, isNumeratorStart: true, sessionDays: [], controlDays: [23,24,25,26,27,28,29,30], vacationDays: [], practiceDays: [], studentDay: 17 },
  { id: 'dec26', name: 'Грудень 2026', year: 2026, monthIdx: 11, isNumeratorStart: false, sessionDays: [1,2,3,4,5,6,7,8,9,10,11,12,13], controlDays: [], vacationDays: [14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31], practiceDays: [] },
  { id: 'jan27', name: 'Січень 2027', year: 2027, monthIdx: 0, isNumeratorStart: true, sessionDays: [18,19,20,21,22,23,24], controlDays: [], vacationDays: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,25,26,27,28,29,30,31], practiceDays: [] },
  { id: 'feb27', name: 'Лютий 2027', year: 2027, monthIdx: 1, isNumeratorStart: false, sessionDays: [], controlDays: [], vacationDays: [], practiceDays: [] },
  { id: 'mar27', name: 'Березень 2027', year: 2027, monthIdx: 2, isNumeratorStart: true, sessionDays: [], controlDays: [], vacationDays: [], practiceDays: [29,30,31] },
  { id: 'apr27', name: 'Квітень 2027', year: 2027, monthIdx: 3, isNumeratorStart: false, sessionDays: [], controlDays: [1,2,3,4,26,27,28,29,30], vacationDays: [], practiceDays: [] },
  { id: 'may27', name: 'Травень 2027', year: 2027, monthIdx: 4, isNumeratorStart: true, sessionDays: [31], controlDays: [24,25,26,27,28,29,30], vacationDays: [], practiceDays: [] },
  { id: 'jun27', name: 'Червень 2027', year: 2027, monthIdx: 5, isNumeratorStart: false, sessionDays: [1,2,3,4,5,6,7,8,9,10,11,12,13], controlDays: [], vacationDays: [28,29,30], practiceDays: [14,15,16,17,18,19,20,21,22,23,24,25,26,27] }
];
