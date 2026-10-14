// Work report: what a finished task is, which kind it is, and how days add up. Pure, no `$`.
import type { DayRecord, Days, Kind, Range, Rates } from '../types'

export const KINDS: readonly Kind[] = ['code', 'documents', 'research', 'images', 'emails', 'other']

export const KIND_LABEL: Record<Kind, string> = {
  code: 'Code',
  documents: 'Documents',
  research: 'Research',
  images: 'Images and video',
  emails: 'Emails',
  other: 'Other',
}

export const DEFAULT_RATES: Rates = {
  rate: 50,
  minutes: { emails: 10, documents: 30, images: 20, research: 25, code: 30, other: 10 },
}

export const KEEP_DAYS = 400

// ---------------------------------------------------------------- sorting a task

const MAIL = /mail|gmail|outlook|send_?email|draft_?email/i
const IMAGE_TOOL = /image|video|photo|figma|canva|dall|higgsfield|imagen|biorender|screenshot/i
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|heic|mp4|mov|webm|avi|mkv)$/i
const DOC_TOOL = /docs?\b|document|slide|sheet|pptx|xlsx|docx|notion|confluence|Claude_Docs|Artifact/i
const DOC_FILE = /\.(md|mdx|docx?|pptx?|xlsx?|pdf|txt|rtf|odt|csv)$/i
const RESEARCH = /^(WebSearch|WebFetch)$|search|fetch|browse|transcript|scholar|pubmed|consensus/i
const CODE_TOOL = /^(Edit|Write|NotebookEdit|MultiEdit|Bash|PowerShell)$/

/**
 * One kind per task from the tools it used and the files it wrote, the most specific first:
 * mail, then pictures, then documents, then code, then research.
 */
export const classify = (tools: readonly string[], writes: readonly string[]): Kind => {
  if (tools.some(t => MAIL.test(t))) return 'emails'
  if (tools.some(t => IMAGE_TOOL.test(t)) || writes.some(f => IMAGE_FILE.test(f))) return 'images'
  if (tools.some(t => !CODE_TOOL.test(t) && DOC_TOOL.test(t)) || writes.some(f => DOC_FILE.test(f))) return 'documents'
  if (tools.some(t => CODE_TOOL.test(t))) return 'code'
  if (tools.some(t => RESEARCH.test(t))) return 'research'
  return 'other'
}

/** Only a prompt the person typed (or the deck sent for them) starts a task; no command, no meta. */
export const isTypedPrompt = (p: {
  origin: { kind: string; name?: string }
  command?: unknown
  isMeta?: boolean
  turnId?: string
  self: string
}) =>
  !p.command &&
  !p.isMeta &&
  !p.turnId &&
  (p.origin.kind === 'composer' || (p.origin.kind === 'plugin' && p.origin.name === p.self))

// ---------------------------------------------------------------- days

const pad = (n: number) => String(n).padStart(2, '0')

/** The local calendar day of a moment. */
export const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A day at local noon, so stepping by days never lands on the wrong date when clocks change. */
export const noonOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12)
}

export const addDays = (key: string, n: number) => {
  const d = noonOf(key)
  d.setDate(d.getDate() + n)
  return dayKey(d.getTime())
}

/** 1 on January 1. */
export const dayOfYear = (key: string) => {
  const d = noonOf(key)
  const jan1 = new Date(d.getFullYear(), 0, 1, 12)
  return Math.round((d.getTime() - jan1.getTime()) / 86_400_000) + 1
}

export const emptyDay = (): DayRecord => ({ kinds: {}, models: {}, projects: {} })

/** A project's name: the last folder of its path. */
export const projectOf = (path: string | null | undefined) =>
  (path ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'unknown'

export const dayTotal = (r: DayRecord | undefined) => (r ? KINDS.reduce((n, k) => n + (r.kinds[k] ?? 0), 0) : 0)

export const recordTask = (days: Days, key: string, kind: Kind, model: string, project = 'unknown'): Days => {
  const r = days[key] ?? emptyDay()
  const name = model || 'unknown'
  const projects = r.projects ?? {}
  const p = projects[project] ?? {}
  return {
    ...days,
    [key]: {
      kinds: { ...r.kinds, [kind]: (r.kinds[kind] ?? 0) + 1 },
      models: { ...r.models, [name]: (r.models[name] ?? 0) + 1 },
      projects: { ...projects, [project]: { ...p, [kind]: (p[kind] ?? 0) + 1 } },
    },
  }
}

/** Days older than the window are dropped so the store stays small. */
export const pruneDays = (days: Days, today: string, keep = KEEP_DAYS): Days => {
  const oldest = addDays(today, -keep)
  return Object.fromEntries(Object.entries(days).filter(([k]) => k >= oldest))
}

/** Stored days read leniently: anything malformed is left out. */
export const normalizeDays = (stored: unknown): Days => {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
  const out: Days = {}
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || typeof v !== 'object' || v === null) continue
    const r = v as { kinds?: unknown; models?: unknown; projects?: unknown }
    const nums = (o: unknown) =>
      Object.fromEntries(
        Object.entries(typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : {}).filter(
          (e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0,
        ),
      )
    const projects = Object.fromEntries(
      Object.entries(typeof r.projects === 'object' && r.projects !== null ? (r.projects as Record<string, unknown>) : {}).map(
        ([name, kinds]) => [name, nums(kinds) as Partial<Record<Kind, number>>],
      ),
    )
    out[k] = { kinds: nums(r.kinds) as DayRecord['kinds'], models: nums(r.models), projects }
  }
  return out
}

/** The days a tab covers, oldest first. */
export const rangeKeys = (range: Range, today: string): string[] => {
  const n = range === 'today' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : dayOfYear(today)
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))
}

export type ProjectSum = { name: string; count: number; kinds: Record<Kind, number> }

export type Sum = { total: number; kinds: Record<Kind, number>; models: [string, number][]; projects: ProjectSum[]; active: number }

const zeroKinds = () => Object.fromEntries(KINDS.map(k => [k, 0])) as Record<Kind, number>

/** Days added together. */
export const sumDays = (days: Days, keys: readonly string[]): Sum => {
  const kinds = zeroKinds()
  const models: Record<string, number> = {}
  const projects: Record<string, ProjectSum> = {}
  let active = 0
  for (const key of keys) {
    const r = days[key]
    if (!r) continue
    if (dayTotal(r) > 0) active++
    for (const k of KINDS) kinds[k] += r.kinds[k] ?? 0
    for (const [m, n] of Object.entries(r.models)) models[m] = (models[m] ?? 0) + n
    for (const [name, pk] of Object.entries(r.projects ?? {})) {
      const p = (projects[name] ??= { name, count: 0, kinds: zeroKinds() })
      for (const k of KINDS) {
        p.kinds[k] += pk[k] ?? 0
        p.count += pk[k] ?? 0
      }
    }
  }
  const total = KINDS.reduce((n, k) => n + kinds[k], 0)
  return {
    total,
    kinds,
    models: Object.entries(models).sort((a, b) => b[1] - a[1]),
    projects: Object.values(projects).sort((a, b) => b.count - a.count),
    active,
  }
}

export const hoursOf = (kinds: Record<Kind, number>, rates: Rates) =>
  KINDS.reduce((h, k) => h + (kinds[k] * (rates.minutes[k] ?? 0)) / 60, 0)

/** Days in a row with a finished task, ending today (or yesterday while today is still empty). */
export const streak = (days: Days, today: string) => {
  let key = dayTotal(days[today]) > 0 ? today : addDays(today, -1)
  let n = 0
  while (dayTotal(days[key]) > 0) {
    n++
    key = addDays(key, -1)
  }
  return n
}

// ---------------------------------------------------------------- chart

export type Bar = { label: string; value: number; isCurrent: boolean; isFuture: boolean }

const WEEKDAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const WEEKDAY_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const chartBars = (range: Range, days: Days, today: string): Bar[] => {
  if (range === 'today' || range === 'week') {
    return rangeKeys('week', today).map(k => ({
      label: WEEKDAY[noonOf(k).getDay()] ?? '',
      value: dayTotal(days[k]),
      isCurrent: k === today,
      isFuture: false,
    }))
  }
  if (range === 'month') {
    return rangeKeys('month', today).map(k => ({
      label: String(noonOf(k).getDate()),
      value: dayTotal(days[k]),
      isCurrent: k === today,
      isFuture: false,
    }))
  }
  const year = noonOf(today).getFullYear()
  const month = noonOf(today).getMonth()
  const totals = Array.from({ length: 12 }, () => 0)
  for (const [k, r] of Object.entries(days)) {
    const d = noonOf(k)
    if (d.getFullYear() === year) totals[d.getMonth()] = (totals[d.getMonth()] ?? 0) + dayTotal(r)
  }
  return totals.map((value, i) => ({ label: MONTH[i] ?? '', value, isCurrent: i === month, isFuture: i > month }))
}

const LEVELS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

/** One bar as three stacked cells, top row first; a non-zero value always shows a sliver. */
export const barCells = (value: number, max: number, rows = 3): string[] => {
  const eighths = max > 0 ? Math.round((value / max) * rows * 8) : 0
  const filled = value > 0 ? Math.max(1, eighths) : 0
  return Array.from({ length: rows }, (_, r) => {
    const fromBottom = rows - 1 - r
    const inRow = Math.max(0, Math.min(8, filled - fromBottom * 8))
    return LEVELS[inRow] ?? ' '
  })
}

/** The line under the chart. */
export const summaryLine = (range: Range, days: Days, today: string) => {
  if (range === 'today' || range === 'week') {
    const s = streak(days, today)
    return s > 0 ? `${s}-day streak` : 'No streak yet'
  }
  const keys = rangeKeys(range, today)
  const active = keys.filter(k => dayTotal(days[k]) > 0).length
  if (range === 'month') {
    const best = keys.reduce<string | null>((b, k) => (dayTotal(days[k]) > (b ? dayTotal(days[b]) : 0) ? k : b), null)
    if (!best) return 'No active days yet'
    const d = noonOf(best)
    return `Best day ${MONTH[d.getMonth()]} ${d.getDate()} (${dayTotal(days[best])})  ·  ${active} active days`
  }
  const bars = chartBars('year', days, today)
  const best = bars.reduce<Bar | null>((b, x) => (x.value > (b?.value ?? 0) ? x : b), null)
  return best ? `Best month ${best.label} (${best.value})  ·  ${active} active days` : 'No active days yet'
}

// ---------------------------------------------------------------- words and numbers

export const RANGE_TITLE: Record<Range, string> = { today: 'TODAY', week: 'THIS WEEK', month: 'THIS MONTH', year: 'THIS YEAR' }

const short = (key: string) => {
  const d = noonOf(key)
  return `${MONTH[d.getMonth()]} ${d.getDate()}`
}

export const rangeDates = (range: Range, today: string) => {
  const keys = rangeKeys(range, today)
  const first = keys[0] ?? today
  if (range === 'today') return `${WEEKDAY_LONG[noonOf(today).getDay()]} ${short(today)}, ${noonOf(today).getFullYear()}`
  return `${short(first)} – ${short(today)}, ${noonOf(today).getFullYear()}`
}

export const fmtHours = (h: number) => (h >= 100 ? String(Math.round(h)) : h.toFixed(1))

export const fmtMoney = (n: number) =>
  n >= 10_000 ? `$${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : `$${Math.round(n).toLocaleString('en-US')}`

const KIND_WORDS: Record<string, Kind> = {
  code: 'code',
  documents: 'documents',
  docs: 'documents',
  research: 'research',
  images: 'images',
  image: 'images',
  video: 'images',
  emails: 'emails',
  email: 'emails',
  other: 'other',
}

export const settingsText = (r: Rates) =>
  [
    'Work report settings (all estimates):',
    `  rate      $${r.rate} per hour`,
    ...KINDS.map(k => `  ${k.padEnd(9)} ${r.minutes[k]} min per task`),
    'Change one: /report settings rate 75  ·  /report settings emails 15',
  ].join('\n')

/** `/report settings …`: the new rates, or why not. */
export const applySetting = (args: string, r: Rates): { rates: Rates; text: string } => {
  const [what = '', raw = ''] = args.trim().toLowerCase().split(/\s+/)
  if (!what) return { rates: r, text: settingsText(r) }
  const n = Number(raw)
  if (!raw || !Number.isFinite(n) || n < 0 || n > 100_000) {
    return { rates: r, text: `Give a number, e.g. /report settings ${what || 'rate'} 75` }
  }
  if (what === 'rate') return { rates: { ...r, rate: n }, text: `Hourly rate is now $${n} (estimate).` }
  const kind = KIND_WORDS[what]
  if (!kind) return { rates: r, text: `Unknown setting "${what}". Use rate, ${KINDS.join(', ')}.` }
  return {
    rates: { ...r, minutes: { ...r.minutes, [kind]: n } },
    text: `${KIND_LABEL[kind]} now count ${n} minutes per task (estimate).`,
  }
}

export const normalizeRates = (stored: unknown): Rates => {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<Rates>
  const m = (typeof s.minutes === 'object' && s.minutes !== null ? s.minutes : {}) as Partial<Record<Kind, unknown>>
  return {
    rate: typeof s.rate === 'number' ? s.rate : DEFAULT_RATES.rate,
    minutes: Object.fromEntries(
      KINDS.map(k => [k, typeof m[k] === 'number' ? (m[k] as number) : DEFAULT_RATES.minutes[k]]),
    ) as Record<Kind, number>,
  }
}
