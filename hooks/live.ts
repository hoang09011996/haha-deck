// The Live tab's extras: the pet's mood, the activity strip, files touched, notes and the cost and
// limit guard. Pure, no `$`.
import type { ActKind, Activity, FileTouch, Guard, Mood, Note } from '../types'

// ---------------------------------------------------------------- pet

export const PET: Record<Mood, { frames: string[]; caption: string }> = {
  sleep: { frames: ['(-_-) zZ'], caption: 'napping' },
  work: { frames: ['(•_•)   ', ' (•_•)  ', '  (•_•) ', ' (•_•)  '], caption: 'on it' },
  wait: { frames: ['(•_•) ? ', '(•_•)  ?'], caption: 'needs you' },
  error: { frames: ['(°□°) ! '], caption: 'hit a snag' },
  party: { frames: ['\\(^o^)/ ', ' /(^o^)\\'], caption: 'done!' },
}

/** How long the pet celebrates a finished turn. */
export const PARTY_MS = 45_000

export const moodOf = (o: {
  isRunning: boolean
  isAsking: boolean
  errorStreak: number
  lastReason: string | null
  sinceEnd: number | null
}): Mood => {
  if (o.isRunning) return o.isAsking ? 'wait' : o.errorStreak >= 2 ? 'error' : 'work'
  if (o.lastReason && o.lastReason !== 'answer') return 'error'
  if (o.lastReason === 'answer' && o.sinceEnd !== null && o.sinceEnd < PARTY_MS) return 'party'
  return 'sleep'
}

// ---------------------------------------------------------------- activity strip

export const ACT_KINDS: readonly ActKind[] = ['read', 'edit', 'shell', 'web', 'agent', 'mcp', 'other']

export const actKindOf = (tool: string): ActKind => {
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) return 'read'
  if (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(tool)) return 'edit'
  if (/^(Bash|PowerShell|BashOutput|KillShell|Monitor)$/.test(tool)) return 'shell'
  if (/^(WebSearch|WebFetch)$/.test(tool)) return 'web'
  if (/^(Agent|Task|SendMessage)$/.test(tool)) return 'agent'
  if (tool.startsWith('mcp__')) return 'mcp'
  return 'other'
}

export const EMPTY_ACTIVITY: Activity = { cells: [] }

export const pushActivity = (a: Activity, tool: string, isError: boolean): Activity => ({
  cells: [...a.cells, { k: actKindOf(tool), isError }].slice(-160),
})

export const activityCounts = (a: Activity) =>
  ACT_KINDS.map(k => [k, a.cells.filter(c => c.k === k).length] as const).filter(([, n]) => n > 0)

// ---------------------------------------------------------------- files touched

/** The newest edit first; one row per file. */
export const touchFile = (files: readonly FileTouch[], path: string, at: number): FileTouch[] => {
  const old = files.find(f => f.path === path)
  return [{ path, edits: (old?.edits ?? 0) + 1, at }, ...files.filter(f => f.path !== path)].slice(0, 40)
}

/** A path as it reads inside the project; outside it, as given. */
export const relPath = (path: string, root: string) => {
  const r = root.replace(/[\\/]+$/, '')
  return r && path.startsWith(r + '/') ? path.slice(r.length + 1) : path
}

// ---------------------------------------------------------------- notes

export const addNote = (notes: readonly Note[], text: string, at: number): Note[] => {
  const t = text.trim()
  return t ? [{ id: `n${at}-${notes.length}`, text: t, at }, ...notes].slice(0, 20) : [...notes]
}

export const normalizeNotes = (stored: unknown): Note[] =>
  (Array.isArray(stored) ? stored : [])
    .filter((n): n is Note => typeof n === 'object' && n !== null && typeof (n as Note).text === 'string')
    .slice(0, 20)

// ---------------------------------------------------------------- guard

export const DEFAULT_GUARD: Guard = { costAlert: 0, alerted: [] }

export const normalizeGuard = (stored: unknown): Guard => {
  const g = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<Guard>
  return {
    costAlert: typeof g.costAlert === 'number' && g.costAlert > 0 ? g.costAlert : 0,
    alerted: Array.isArray(g.alerted) ? g.alerted.filter((x): x is string => typeof x === 'string') : [],
  }
}

/**
 * What crossed a line since the last measurement and has not been said yet: the session's cost
 * past the alert, a usage limit past 90%. Each is said once a session.
 */
export const guardAlerts = (
  g: Guard,
  m: { costUsd: number | null; limits: readonly { kind: string; pct: number }[] },
  label: (kind: string) => string,
): { key: string; text: string }[] => {
  const out: { key: string; text: string }[] = []
  if (g.costAlert > 0 && m.costUsd !== null && m.costUsd >= g.costAlert && !g.alerted.includes('cost')) {
    out.push({ key: 'cost', text: `Haha-deck: this session has cost $${m.costUsd.toFixed(2)}, past your $${g.costAlert} alert.` })
  }
  for (const l of m.limits) {
    const key = `limit-${l.kind}`
    if (l.pct >= 90 && !g.alerted.includes(key)) out.push({ key, text: `Haha-deck: your ${label(l.kind)} usage limit is at ${Math.round(l.pct)}%.` })
  }
  return out
}

/** Time until a limit resets, short: `1h12m`, `3d4h`, `45m`; null when unknown or past. */
export const untilReset = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return null
  const t = Date.parse(resetsAt)
  if (!Number.isFinite(t) || t <= now) return null
  const m = Math.ceil((t - now) / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

// ---------------------------------------------------------------- quick actions

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** The next effort up or down, or null at the end of the scale or when unknown. */
export const stepEffort = (effort: string, dir: 1 | -1) => {
  const i = EFFORTS.indexOf(effort as (typeof EFFORTS)[number])
  if (i < 0) return null
  return EFFORTS[i + dir] ?? null
}
