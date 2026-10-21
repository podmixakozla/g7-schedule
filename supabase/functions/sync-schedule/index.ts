import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { unzipSync, strFromU8 } from 'https://esm.sh/fflate@0.8.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SCHEDULE_PAGE_URL = 'https://nmu.org.ua/main/students/schedule/'
const SCHEDULE_WP_JSON_URL = 'https://nmu.org.ua/main/wp-json/wp/v2/pages/6834'
const SYNC_COOLDOWN_MS = 2 * 60 * 60 * 1000 // 2 hours
const UNKNOWN_TEACHER = 'Викладач невідомий'

const SUBJECT_EXPANSIONS: Record<string, string> = {
  'ІКГ': "Інженерна та комп'ютерна графіка",
  'Інж.та комп.графіка': "Інженерна та комп'ютерна графіка",
  "Інж.та комп'ютерна графіка": "Інженерна та комп'ютерна графіка",
  'І та КГ': "Інженерна та комп'ютерна графіка",
  'ЦПУС': 'ЦП в УС',
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function colToIdx(col: string): number {
  let n = 0
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64)
  }
  return n
}

function idxToCol(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * Determine current academic quarter (1 or 2) in Europe/Kyiv time.
 * Autumn semester:
 *   Quarter 1 (І Чв): Sep 1 – Oct 25
 *   Quarter 2 (ІІ Чв): Oct 26 – Jan 31
 * Spring semester:
 *   Quarter 1 (І Чв): Feb 1 – Apr 4
 *   Quarter 2 (ІІ Чв): Apr 5 – Aug 31
 */
function detectCurrentQuarter(now = new Date()): 1 | 2 {
  const kyivStr = now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })
  const kyiv = new Date(kyivStr)
  const month = kyiv.getMonth() + 1 // 1..12
  const day = kyiv.getDate()

  if (month === 9) return 1
  if (month === 10) return day <= 25 ? 1 : 2
  if (month === 11 || month === 12 || month === 1) return 2
  if (month === 2 || month === 3) return 1
  if (month === 4) return day <= 4 ? 1 : 2
  return 2
}

/**
 * Discover the ЕТФ Excel URL from nmu.org.ua (tries WordPress REST API first, then HTML page).
 */
async function discoverEtfExcelUrl(): Promise<string> {
  const extractFromHtml = (html: string): string | null => {
    const anchorRegex = /<a\b[^>]*href=["']([^"']+\.xlsx[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null
    while ((match = anchorRegex.exec(html)) !== null) {
      const href = match[1].trim()
      const inner = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (
        /електротехнічн/i.test(inner) ||
        /\bетф\b/i.test(inner) ||
        /етф/i.test(decodeURIComponent(href))
      ) {
        return new URL(href, SCHEDULE_PAGE_URL).toString()
      }
    }
    return null
  }

  try {
    const wpRes = await fetch(SCHEDULE_WP_JSON_URL, {
      headers: { 'User-Agent': 'G7-Schedule-Sync/1.0 (+https://nmu.org.ua)' },
    })
    if (wpRes.ok) {
      const data = await wpRes.json()
      const rendered = data?.content?.rendered || ''
      const found = extractFromHtml(rendered)
      if (found) return found
    }
  } catch (e) {
    console.warn('WP JSON discovery failed, falling back to HTML page:', e)
  }

  const pageRes = await fetch(SCHEDULE_PAGE_URL, {
    headers: { 'User-Agent': 'G7-Schedule-Sync/1.0 (+https://nmu.org.ua)' },
  })
  if (!pageRes.ok) {
    throw new Error(`Failed to fetch schedule page: HTTP ${pageRes.status}`)
  }
  const html = await pageRes.text()
  const found = extractFromHtml(html)
  if (!found) {
    throw new Error('Could not find ЕТФ .xlsx link on nmu.org.ua schedule page')
  }
  return found
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = []
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let m: RegExpExecArray | null
  while ((m = siRegex.exec(xml)) !== null) {
    const siBody = m[1]
    const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g
    let tm: RegExpExecArray | null
    let text = ''
    while ((tm = tRegex.exec(siBody)) !== null) {
      text += decodeXmlEntities(tm[1])
    }
    strings.push(text)
  }
  return strings
}

interface ParsedSheet {
  cells: Map<string, string>
  merges: string[]
}

function parseWorksheet(xml: string, sharedStrings: string[]): ParsedSheet {
  const cells = new Map<string, string>()
  const cRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  let m: RegExpExecArray | null
  while ((m = cRegex.exec(xml)) !== null) {
    const attrs = m[1]
    const body = m[2] || ''
    const rMatch = /\br=["']([A-Z]+\d+)["']/.exec(attrs)
    if (!rMatch) continue
    const ref = rMatch[1]
    const tMatch = /\bt=["']([^"']+)["']/.exec(attrs)
    const type = tMatch ? tMatch[1] : ''

    let val = ''
    if (type === 's') {
      const vMatch = /<v>(\d+)<\/v>/.exec(body)
      if (vMatch) {
        val = sharedStrings[parseInt(vMatch[1], 10)] ?? ''
      }
    } else if (type === 'inlineStr') {
      const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g
      let tm: RegExpExecArray | null
      while ((tm = tRegex.exec(body)) !== null) {
        val += decodeXmlEntities(tm[1])
      }
    } else {
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(body)
      if (vMatch) val = decodeXmlEntities(vMatch[1])
    }

    const trimmed = val.replace(/\s+/g, ' ').trim()
    if (trimmed) {
      cells.set(ref, trimmed)
    }
  }

  const merges: string[] = []
  const mRegex = /<mergeCell\b[^>]*\bref=["']([A-Z]+\d+:[A-Z]+\d+)["']/g
  while ((m = mRegex.exec(xml)) !== null) {
    merges.push(m[1])
  }

  return { cells, merges }
}

interface ParsedLessonCell {
  pairOverride: number | null
  activeInQuarter: boolean
  parity: 'чисельник' | 'знаменник' | null
  classroom: string
  subject: string
  teacher: string
}

function parseLessonText(raw: string, quarter: 1 | 2): ParsedLessonCell | null {
  let s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return null

  // 1. Optional pair override at start: e.g. "5п ІІ Чв 1/69 ЦП в УС Перший Г.Л."
  let pairOverride: number | null = null
  const pairMatch = /^([1-8])\s*п(?:\.|\s)+/iu.exec(s)
  if (pairMatch) {
    pairOverride = parseInt(pairMatch[1], 10)
    s = s.slice(pairMatch[0].length).trim()
  }

  // 2. Quarter & parity prefix
  let activeInQuarter = true
  let parity: 'чисельник' | 'знаменник' | null = null

  const dualQ1 = /^[ІI]\s*Чв\s*(чис\.?|знам\.?|щот\.?)?\s*,\s*[ІI]{2}\s*Чв\s*(чис\.?|знам\.?|щот\.?)?\s*/iu.exec(s)
  const bothQuarters = /^[ІI]\s*[-–—]\s*[ІI]{2}\s*Чв\s*(чис\.?|знам\.?|щот\.?)?\s*/iu.exec(s)
  const singleQ2 = /^[ІI]{2}\s*Чв\s*(чис\.?|знам\.?|щот\.?)?\s*/iu.exec(s)
  const singleQ1 = /^[ІI]\s*Чв\s*(чис\.?|знам\.?|щот\.?)?\s*/iu.exec(s)

  const mapParityToken = (tok?: string): 'чисельник' | 'знаменник' | null => {
    if (!tok) return null
    if (/^чис/i.test(tok)) return 'чисельник'
    if (/^знам/i.test(tok)) return 'знаменник'
    return null
  }

  if (dualQ1) {
    const p1 = mapParityToken(dualQ1[1])
    const p2 = mapParityToken(dualQ1[2])
    parity = quarter === 1 ? p1 : p2
    s = s.slice(dualQ1[0].length).trim()
  } else if (bothQuarters) {
    parity = mapParityToken(bothQuarters[1])
    s = s.slice(bothQuarters[0].length).trim()
  } else if (singleQ2) {
    activeInQuarter = quarter === 2
    parity = mapParityToken(singleQ2[1])
    s = s.slice(singleQ2[0].length).trim()
  } else if (singleQ1) {
    activeInQuarter = quarter === 1
    parity = mapParityToken(singleQ1[1])
    s = s.slice(singleQ1[0].length).trim()
  }

  // 3. Classroom token (e.g. "3/14", "10/611", "1/129", "каф.")
  let classroom = ''
  const roomMatch = /^(\d{1,2}\/[0-9а-яіїєґА-ЯІЇЄҐa-zA-Z-]+|каф\.?)\s+/i.exec(s)
  if (roomMatch) {
    classroom = roomMatch[1].replace(/\.$/, '')
    s = s.slice(roomMatch[0].length).trim()
  }

  // 4. Teacher at end of string
  let teacher = ''

  // Case A: Quarter-specific teacher suffix: "І Чв - д.Бойко О.О., ІІ Чв - д.Воскобойник Є.К."
  const dualTeacherMatch = /\s+[ІI]\s*Чв\s*[-–—]\s*([^,]+),\s*[ІI]{2}\s*Чв\s*[-–—]\s*(.+)$/iu.exec(s)
  if (dualTeacherMatch) {
    teacher = (quarter === 1 ? dualTeacherMatch[1] : dualTeacherMatch[2]).trim()
    s = s.slice(0, dualTeacherMatch.index).trim()
  } else {
    // Case B: Vacancy placeholder "Вак.1", "Вак. 2", "Вакансія"
    const vacMatch = /\s+(Вак\.?\s*\d*|Вакансія)$/i.exec(s)
    if (vacMatch) {
      teacher = UNKNOWN_TEACHER
      s = s.slice(0, vacMatch.index).trim()
    } else {
      // Case C: Title + Surname Initials (e.g. "д.Новицький О.В.", "ст.в.Уланова С.В.", "Перший Г.Л.")
      const teacherMatch = /\s+((?:(?:проф|доц|ст\.?\s*в|викл|ас|д|пр)\.?\s*)?[А-ЯІЇЄҐ][а-яіїєґ'ʼ`-]+\s+[А-ЯІЇЄҐ]\.\s*[А-ЯІЇЄҐ]\.?)$/u.exec(s)
      if (teacherMatch) {
        teacher = teacherMatch[1].trim()
        s = s.slice(0, teacherMatch.index).trim()
      }
    }
  }

  // Clean up teacher prefix (strip "д.", "ст.в.", "проф.", "доц." or keep clean name)
  if (teacher && teacher !== UNKNOWN_TEACHER) {
    teacher = teacher
      .replace(/^(?:проф|доц|ст\.?\s*в|викл|ас|д|пр)\.?\s*/iu, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  if (!teacher) {
    teacher = UNKNOWN_TEACHER
  }

  // 5. Normalize subject
  let subject = s.replace(/\s+/g, ' ').trim()
  if (SUBJECT_EXPANSIONS[subject]) {
    subject = SUBJECT_EXPANSIONS[subject]
  }

  return {
    pairOverride,
    activeInQuarter,
    parity,
    classroom,
    subject,
    teacher,
  }
}

function parseRomanPair(raw: string): number | null {
  const norm = raw.replace(/\s+/g, '').toUpperCase()
    .replace(/І/g, 'I') // Ukrainian І -> Latin I
  const map: Record<string, number> = {
    'I': 1,
    'II': 2,
    'III': 3,
    'IV': 4,
    'V': 5,
    'VI': 6,
    'VII': 7,
    'VIII': 8,
  }
  return map[norm] ?? null
}

function parseDayName(raw: string): number | null {
  const norm = raw.replace(/\s+/g, '').toUpperCase()
  if (norm.includes('ПОНЕДІЛОК')) return 1
  if (norm.includes('ВІВТОРОК')) return 2
  if (norm.includes('СЕРЕДА')) return 3
  if (norm.includes('ЧЕТВЕР')) return 4
  if (norm.includes('П\'ЯТНИЦЯ') || norm.includes('П’ЯТНИЦЯ') || norm.includes('ПЯТНИЦЯ')) return 5
  return null
}

export interface ScheduleRow {
  group_code: string
  day_of_week: number
  pair_number: number
  subject: string
  teacher: string
  classroom: string
}

function extractScheduleRowsFromWorkbook(xlsxBytes: Uint8Array, quarter: 1 | 2): ScheduleRow[] {
  const files = unzipSync(xlsxBytes)
  const ssXml = files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : ''
  const sharedStrings = ssXml ? parseSharedStrings(ssXml) : []

  // Find worksheet containing АР-26-1
  let targetSheet: ParsedSheet | null = null
  for (const [path, bytes] of Object.entries(files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue
    const xml = strFromU8(bytes)
    if (!xml.includes('АР-26') && !sharedStrings.some(s => s.includes('АР-26'))) continue
    const parsed = parseWorksheet(xml, sharedStrings)
    for (const val of parsed.cells.values()) {
      if (val.includes('АР-26-1')) {
        targetSheet = parsed
        break
      }
    }
    if (targetSheet) break
  }

  if (!targetSheet) {
    throw new Error('Worksheet with group АР-26-1 not found in ЕТФ workbook')
  }

  const { cells, merges } = targetSheet

  // Map every cell coordinate "COL+ROW" to its master top-left cell and merge bounds
  interface MergeBounds {
    masterRef: string
    c1: number
    r1: number
    c2: number
    r2: number
  }
  const mergeMap = new Map<string, MergeBounds>()
  for (const range of merges) {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)
    if (!m) continue
    const c1 = colToIdx(m[1])
    const r1 = parseInt(m[2], 10)
    const c2 = colToIdx(m[3])
    const r2 = parseInt(m[4], 10)
    const masterRef = `${m[1]}${r1}`
    for (let c = c1; c <= c2; c++) {
      for (let r = r1; r <= r2; r++) {
        mergeMap.set(`${idxToCol(c)}${r}`, { masterRef, c1, r1, c2, r2 })
      }
    }
  }

  const getCellValue = (col: string, row: number): string => {
    const ref = `${col}${row}`
    const mb = mergeMap.get(ref)
    return cells.get(mb ? mb.masterRef : ref) || ''
  }

  // Locate group columns (AR-26-1 and AR-26sk-1) in header rows 1..5
  let colPrimary = ''
  let colSk = ''
  for (const [ref, val] of cells.entries()) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)
    if (!m) continue
    const row = parseInt(m[2], 10)
    if (row > 5) continue
    if (/АР-26-1\b/i.test(val) && !/ск/i.test(val)) colPrimary = m[1]
    if (/АР-26ск-1\b/i.test(val)) colSk = m[1]
  }

  if (!colPrimary) {
    throw new Error('Column for АР-26-1 not found in worksheet header')
  }

  // Group rows (3..40) into (day_of_week, pair_number) slots with sub-row ranges
  interface PairSlotRows {
    day: number
    pair: number
    rows: number[]
  }
  const slots: PairSlotRows[] = []
  for (let r = 3; r <= 35; r++) {
    const dayText = getCellValue('A', r)
    const pairText = getCellValue('B', r)
    const day = parseDayName(dayText)
    const pair = parseRomanPair(pairText)
    if (!day || !pair) continue
    const prev = slots[slots.length - 1]
    if (prev && prev.day === day && prev.pair === pair) {
      prev.rows.push(r)
    } else {
      slots.push({ day, pair, rows: [r] })
    }
  }

  const extractGroupSlot = (col: string, slot: PairSlotRows): Map<number, ScheduleRow> => {
    const result = new Map<number, ScheduleRow>()
    if (!col) return result

    const totalSubRows = slot.rows.length
    const seenMasterRefs = new Set<string>()

    for (let idx = 0; idx < totalSubRows; idx++) {
      const r = slot.rows[idx]
      const ref = `${col}${r}`
      const mb = mergeMap.get(ref)
      const masterRef = mb ? mb.masterRef : ref
      if (seenMasterRefs.has(masterRef)) continue
      seenMasterRefs.add(masterRef)

      const rawText = cells.get(masterRef) || ''
      if (!rawText) continue

      const parsed = parseLessonText(rawText, quarter)
      if (!parsed || !parsed.activeInQuarter || !parsed.subject) continue

      // Determine parity from sub-row position if pair has 2 sub-rows and cell doesn't span both
      let parity = parsed.parity
      if (!parity && totalSubRows === 2) {
        const spansAllSubRows = mb && mb.r1 <= slot.rows[0] && mb.r2 >= slot.rows[totalSubRows - 1]
        if (!spansAllSubRows) {
          parity = idx === 0 ? 'чисельник' : 'знаменник'
        }
      }

      const targetPair = parsed.pairOverride || slot.pair
      const subjectWithParity = parity ? `${parsed.subject}(${parity})` : parsed.subject

      const existing = result.get(targetPair)
      if (!existing) {
        result.set(targetPair, {
          group_code: col === colPrimary ? 'AR-26-1' : 'AR-26sk-1',
          day_of_week: slot.day,
          pair_number: targetPair,
          subject: subjectWithParity,
          teacher: parsed.teacher,
          classroom: parsed.classroom,
        })
      }
    }

    return result
  }

  const outRows: ScheduleRow[] = []

  for (const slot of slots) {
    const primaryMap = extractGroupSlot(colPrimary, slot)
    const skMap = extractGroupSlot(colSk, slot)

    for (const row of primaryMap.values()) {
      outRows.push(row)
    }
    for (const row of skMap.values()) {
      outRows.push(row)
    }

    // If AR-26-1 has a pair that AR-26sk-1 does NOT have in that pair number,
    // insert a "-" window override for AR-26sk-1 so it doesn't inherit AR-26-1's pair.
    if (colSk) {
      for (const pairNum of primaryMap.keys()) {
        if (!skMap.has(pairNum)) {
          outRows.push({
            group_code: 'AR-26sk-1',
            day_of_week: slot.day,
            pair_number: pairNum,
            subject: '-',
            teacher: '',
            classroom: '',
          })
        }
      }
    }
  }

  return outRows
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    let force = false
    let quarterOverride: 1 | 2 | null = null
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body?.force === true) force = true
        if (body?.quarter === 1 || body?.quarter === 2) quarterOverride = body.quarter
      } catch {
        // Empty or non-JSON body is fine
      }
    }

    // Check cooldown in schedule_sync_meta
    const { data: meta } = await supabase
      .from('schedule_sync_meta')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    const now = new Date()
    if (!force && meta?.last_synced_at) {
      const elapsed = now.getTime() - new Date(meta.last_synced_at).getTime()
      if (elapsed < SYNC_COOLDOWN_MS) {
        return new Response(
          JSON.stringify({
            ok: true,
            skipped: true,
            reason: 'cooldown',
            last_synced_at: meta.last_synced_at,
            next_sync_in_sec: Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000),
            source_file_url: meta.source_file_url,
            quarter: meta.quarter,
            lessons_count: meta.lessons_count,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 1. Discover ЕТФ Excel URL from nmu.org.ua
    const excelUrl = await discoverEtfExcelUrl()

    // 2. Download Excel file
    const fileRes = await fetch(excelUrl, {
      headers: { 'User-Agent': 'G7-Schedule-Sync/1.0 (+https://nmu.org.ua)' },
    })
    if (!fileRes.ok) {
      throw new Error(`Failed to download Excel file (${excelUrl}): HTTP ${fileRes.status}`)
    }
    const xlsxBytes = new Uint8Array(await fileRes.arrayBuffer())

    // 3. Parse schedule for current academic quarter
    const quarter = quarterOverride || detectCurrentQuarter(now)
    const rows = extractScheduleRowsFromWorkbook(xlsxBytes, quarter)

    if (rows.length === 0) {
      throw new Error('Parsed 0 schedule rows from Excel — aborting DB update for safety')
    }

    // 4. Replace rows in schedule_lessons for AR-26-1 and AR-26sk-1
    const { error: delErr } = await supabase
      .from('schedule_lessons')
      .delete()
      .in('group_code', ['AR-26-1', 'AR-26sk-1'])

    if (delErr) {
      throw new Error(`Failed to clear old schedule_lessons: ${delErr.message}`)
    }

    const { error: insErr } = await supabase
      .from('schedule_lessons')
      .insert(rows)

    if (insErr) {
      throw new Error(`Failed to insert synced schedule_lessons: ${insErr.message}`)
    }

    // 5. Update sync metadata
    const syncedAt = now.toISOString()
    await supabase
      .from('schedule_sync_meta')
      .upsert({
        id: 1,
        last_synced_at: syncedAt,
        source_page_url: SCHEDULE_PAGE_URL,
        source_file_url: excelUrl,
        quarter,
        lessons_count: rows.length,
        last_error: null,
      })

    return new Response(
      JSON.stringify({
        ok: true,
        skipped: false,
        last_synced_at: syncedAt,
        source_file_url: excelUrl,
        quarter,
        lessons_count: rows.length,
        rows,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('sync-schedule error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      await supabase
        .from('schedule_sync_meta')
        .upsert({ id: 1, last_error: msg })
    } catch {
      // ignore meta error
    }
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
