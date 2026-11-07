export const GROUP_LABELS: Readonly<Record<string, string>> = {
  'AR-26-1': 'АР-26-1',
  'AR-26-2': 'АР-26-2',
  'AR-26sk-1': 'АР-26ск-1',
}

export const PARENT_GROUP: Readonly<Record<string, string>> = {
  'AR-26sk-1': 'AR-26-1',
}

export const SCHEDULE_URL = 'https://podmixakozla.github.io/g7-schedule/'

export function scheduleKeyboard(group: string) {
  const url = new URL(SCHEDULE_URL)
  url.searchParams.set('group', group)
  return { inline_keyboard: [[{ text: 'Відкрити розклад', url: url.href }]] }
}
