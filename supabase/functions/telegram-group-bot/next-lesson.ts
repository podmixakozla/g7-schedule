import { PARENT_GROUP } from '../_shared/schedule-groups.ts'

// Keep these academic-year rules aligned with js/data.js and js/academic.js.
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

const PARITY_RE = /\s*[([]\s*(?:по\s+|лише\s+|тільки\s+)?(чис(?:ельник(?:у|а)?)?|знам(?:енник(?:у|а)?)?)\.?\s*[)\]]\s*/i;

export interface Lesson {
  group_code: string
  day_of_week: number
  pair_number: number
  subject: string
  classroom: string | null
}

const kyivClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const dayLabel = new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
})

export function findNextLesson(rows: Lesson[], group: string, now = new Date()) {
  const [date, time] = kyivClock.format(now).split(' ')
  const [hours, minutes] = time.split(':').map(Number)
  const today = new Date(date + 'T00:00:00Z')
  const currentMinute = hours * 60 + minutes
  const parent = PARENT_GROUP[group]
  const slots = new Map<string, Lesson>()

  for (const row of rows.filter(row => row.group_code === parent)) {
    slots.set(`${row.day_of_week}:${row.pair_number}`, row)
  }
  for (const row of rows.filter(row => row.group_code === group)) {
    slots.set(`${row.day_of_week}:${row.pair_number}`, row)
  }

  for (let offset = 0; offset <= 120; offset++) {
    const day = new Date(today)
    day.setUTCDate(day.getUTCDate() + offset)
    const weekday = day.getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    const month = monthsData.find(item => item.year === day.getUTCFullYear() && item.monthIdx === day.getUTCMonth())
    if (!month) continue
    const number = day.getUTCDate()
    if ([month.sessionDays, month.vacationDays, month.practiceDays, month.selfStudyDays].some(days => days.includes(number))) continue
    const firstDay = new Date(Date.UTC(month.year, month.monthIdx, 1)).getUTCDay()
    const weekRow = Math.floor((number - 1 + (firstDay + 6) % 7) / 7)
    const numerator = weekRow % 2 === 0 ? month.isNumeratorStart : !month.isNumeratorStart

    for (const [key, slot] of Object.entries(timeSlots)) {
      if (offset === 0 && slot.start <= currentMinute) continue
      const row = slots.get(`${weekday}:${key}`)
      const subject = row?.subject.trim()
      if (!subject || /^[-–—]+$/.test(subject) || /^(вікно|нічого)/i.test(subject)) continue
      const parity = subject.match(PARITY_RE)
      if (parity && parity[1].toLowerCase().startsWith('чис') !== numerator) continue
      return {
        subject: subject.replace(PARITY_RE, ' ').replace(/\s{2,}/g, ' ').trim(),
        classroom: row?.classroom?.trim(),
        time: slot.from,
        date: offset === 0 ? 'Сьогодні' : offset === 1 ? 'Завтра' : dayLabel.format(day),
      }
    }
  }

  return null
}
