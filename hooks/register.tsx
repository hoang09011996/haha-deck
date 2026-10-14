import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'
import { CLAWD_COLS, CLAWD_ROWS, CREW_MAX, familiesIn, frameCount, sceneCells } from './clawd'

import type {
  Mood,
  FileTouch,
  Note,
  AgentCard,
  Architect,
  BetterEntry,
  BetterFlow,
  Bookmark,
  Bucket,
  Check,
  Days,
  Explain,
  Fun,
  Gate,
  Layout,
  LogLine,
  Loop,
  Main,
  Plan,
  Range,
  Rates,
  Roster,
  Tab,
  Task,
  Turn,
  Usage,
  View,
} from '../types'
import {
  HISTORY_MAX,
  IDLE_FLOW,
  QUESTIONS_SYSTEM,
  REWRITE_SYSTEM,
  isAllAnswered,
  normalizeFlow,
  normalizeHistory,
  parseQuestions,
  parseRewrite,
  questionsPrompt,
  rewritePrompt,
  routePrompt,
} from './better'
import { browserKeysOf, isOrcaTerminal, nameOf, normalizeFun, pushRecent, splitCommand, splitHandleOf, urlOf } from './fun'
import {
  DEFAULT_RATES,
  applySetting,
  classify,
  dayKey,
  isTypedPrompt,
  normalizeDays,
  normalizeRates,
  projectOf,
  pruneDays,
  recordTask,
} from './report'
import { ActionsPanel, ActivityPanel, BetterBar, BetterHistory, BetterView, ExplainPanel, FilesPanel, FunView, NotesPanel, PetPanel, PlanPanel, ReportView, TabBar } from './views'
import type { ActionHandlers, BetterHandlers, Els } from './views'
import {
  DEFAULT_GUARD,
  EMPTY_ACTIVITY,
  addNote,
  guardAlerts,
  moodOf,
  normalizeGuard,
  normalizeNotes,
  pushActivity,
  relPath,
  stepEffort,
  touchFile,
  untilReset,
} from './live'
import { dayTotal, streak as streakOf } from './report'
import {
  DEFAULT_EXPLAIN,
  DEFAULT_PLAN,
  agentCapDeny,
  planFromTodos,
  workingCards,
  DEFAULT_ARCHITECT,
  DEFAULT_GATE,
  DEFAULT_MAIN,
  DEFAULT_ROSTER,
  DEFAULT_TURN,
  DEFAULT_USAGE,
  DEFAULT_VIEW,
  EDIT_TOOLS,
  SCHEMA_VERSION,
  afterCall,
  applyStep,
  bucketOf,
  cardTitle,
  titleLines,
  consultTimeline,
  describeInput,
  endConsult,
  fitLegend,
  fmtClock,
  fmtDuration,
  fmtTimer,
  fmtUsd,
  plural,
  gateSummary,
  gauge,
  isAdvising,
  isLoopActive,
  kTokens,
  lanes,
  limitLabel,
  listOf,
  logRows,
  momentOf,
  normalize,
  normalizeCard,
  normalizeGate,
  normalizeLog,
  noteTool,
  PALETTES,
  SVG_COLORS,
  parseConfig,
  prettyModel,
  promptLine,
  handbackOf,
  adviceLine,
  receiptOf,
  recordCheck,
  settleCheck,
  shorten,
  startConsult,
  stepLoop,
} from './core'
import type { Config, Panel } from './core'

const PLUGIN = 'haha-deck'
const PANE = 'haha-deck'
const TITLE = 'Haha-deck'
const PANE_COLUMNS = 72


// ---------------------------------------------------------------- state

const meta = atom({ plugin: 'haha-deck', key: 'meta' } as const, { schemaVersion: SCHEMA_VERSION })
const main = atom({ plugin: 'haha-deck', key: 'main' } as const, DEFAULT_MAIN)
const usage = atom({ plugin: 'haha-deck', key: 'usage' } as const, DEFAULT_USAGE)
const architect = atom({ plugin: 'haha-deck', key: 'architect' } as const, DEFAULT_ARCHITECT)
const gate = atom({ plugin: 'haha-deck', key: 'gate' } as const, DEFAULT_GATE)
const agents = atom({ plugin: 'haha-deck', key: 'agents' } as const, [])
const loops = atom({ plugin: 'haha-deck', key: 'loops' } as const, [])
const log = atom({ plugin: 'haha-deck', key: 'log' } as const, [])
const turn = atom({ plugin: 'haha-deck', key: 'turn' } as const, DEFAULT_TURN)
const receipt = atom({ plugin: 'haha-deck', key: 'receipt' } as const, null)
const view = atom({ plugin: 'haha-deck', key: 'view' } as const, DEFAULT_VIEW)
const roster = atom({ plugin: 'haha-deck', key: 'roster' } as const, DEFAULT_ROSTER)
const plan = atom({ plugin: 'haha-deck', key: 'plan' } as const, DEFAULT_PLAN)
const explain = atom({ plugin: 'haha-deck', key: 'explain' } as const, DEFAULT_EXPLAIN)
const days = atom({ plugin: 'haha-deck', key: 'days' } as const, {})
const rates = atom({ plugin: 'haha-deck', key: 'rates' } as const, DEFAULT_RATES)
const task = atom({ plugin: 'haha-deck', key: 'task' } as const, { isTyped: false, tools: [], writes: [] })
const pendingTyped = atom({ plugin: 'haha-deck', key: 'pendingTyped' } as const, false)
const flow = atom({ plugin: 'haha-deck', key: 'flow' } as const, IDLE_FLOW)
const history = atom({ plugin: 'haha-deck', key: 'history' } as const, [])
const isAuto = atom({ plugin: 'haha-deck', key: 'isAuto' } as const, false)
const fun = atom({ plugin: 'haha-deck', key: 'fun' } as const, normalizeFun(null))
const activity = atom({ plugin: 'haha-deck', key: 'activity' } as const, EMPTY_ACTIVITY)
const files = atom({ plugin: 'haha-deck', key: 'files' } as const, [])
const notes = atom({ plugin: 'haha-deck', key: 'notes' } as const, [])
const guard = atom({ plugin: 'haha-deck', key: 'guard' } as const, DEFAULT_GUARD)
const lastAnswer = atom({ plugin: 'haha-deck', key: 'lastAnswer' } as const, '')
const actionStatus = atom({ plugin: 'haha-deck', key: 'actionStatus' } as const, '')
const root = atom({ plugin: 'haha-deck', key: 'root' } as const, '')

type ServerBlock = { type: string; id?: string; name?: string; tool_use_id?: string }

// Every read goes through these, so a value saved under an older shape still reads.
async function getMain($: EngineInterface): Promise<Main> {
  return normalize(DEFAULT_MAIN, await read($, main))
}
async function getUsage($: EngineInterface): Promise<Usage> {
  return normalize(DEFAULT_USAGE, await read($, usage))
}
async function getArchitect($: EngineInterface): Promise<Architect> {
  const a = normalize(DEFAULT_ARCHITECT, await read($, architect))
  return { ...a, consults: listOf(a.consults), ids: listOf(a.ids), seen: listOf(a.seen) }
}
async function getGate($: EngineInterface): Promise<Gate> {
  return normalizeGate(await read($, gate))
}
async function getCards($: EngineInterface): Promise<AgentCard[]> {
  return listOf<unknown>(await read($, agents)).map(normalizeCard)
}
async function getLoops($: EngineInterface): Promise<Loop[]> {
  return listOf<Loop>(await read($, loops))
}
async function getLog($: EngineInterface): Promise<LogLine[]> {
  return normalizeLog(await read($, log))
}
async function getTurn($: EngineInterface): Promise<Turn> {
  return normalize(DEFAULT_TURN, await read($, turn))
}
async function getView($: EngineInterface): Promise<View> {
  return normalize(DEFAULT_VIEW, await read($, view))
}
async function getRoster($: EngineInterface): Promise<Roster> {
  const r = normalize(DEFAULT_ROSTER, await read($, roster))
  return { architectTypes: listOf(r.architectTypes) }
}
async function getPlan($: EngineInterface): Promise<Plan> {
  const p = normalize(DEFAULT_PLAN, await read($, plan))
  return { ...p, items: listOf(p.items) }
}
async function getExplain($: EngineInterface): Promise<Explain> {
  return normalize(DEFAULT_EXPLAIN, await read($, explain))
}
async function getDays($: EngineInterface): Promise<Days> {
  return normalizeDays(await read($, days))
}
async function getRates($: EngineInterface): Promise<Rates> {
  return normalizeRates(await read($, rates))
}
async function getTask($: EngineInterface): Promise<Task> {
  const t = normalize<Task>({ isTyped: false, tools: [], writes: [] }, await read($, task))
  return { isTyped: t.isTyped === true, tools: listOf(t.tools), writes: listOf(t.writes) }
}
async function getFlow($: EngineInterface): Promise<BetterFlow> {
  return normalizeFlow(await read($, flow))
}
async function getHistory($: EngineInterface): Promise<BetterEntry[]> {
  return normalizeHistory(await read($, history))
}
async function getFun($: EngineInterface): Promise<Fun> {
  return normalizeFun(await read($, fun))
}

async function setTab($: EngineInterface, tab: Tab, range?: Range) {
  // The report shows every session's tasks: pick up what other sessions wrote since this one started.
  if (tab === 'report') {
    const stored = await $.store.get('days').catch(() => undefined)
    if (stored !== undefined) await update($, days, () => normalizeDays(stored))
  }
  await update($, view, v => ({ ...normalize(DEFAULT_VIEW, v), tab, ...(range ? { range } : {}) }))
}

/** Values kept across sessions, read into the session's state at its start. */
async function loadStore($: EngineInterface) {
  const get = (k: string) => $.store.get(k).catch(() => undefined)
  const [d, r, hist, auto, f, n, g] = await Promise.all([get('days'), get('rates'), get('history'), get('isAuto'), get('fun'), get('notes'), get('guard')])
  await update($, notes, () => normalizeNotes(n))
  // The alert threshold is kept; what was already said starts over each session.
  await update($, guard, () => ({ ...normalizeGuard(g), alerted: [] }))
  await update($, days, () => normalizeDays(d))
  await update($, rates, () => normalizeRates(r))
  await update($, history, () => normalizeHistory(hist))
  await update($, isAuto, () => auto === true)
  await update($, fun, () => ({ ...normalizeFun(f), status: '' }))
}

// ---------------------------------------------------------------- prompt upgrade jobs

let flowSeq = 0

const failText = (r: { reason?: string; status?: number }) =>
  r.reason === 'api-error' ? `The API answered with an error${r.status ? ` (${r.status})` : ''}.` : r.reason === 'aborted' ? 'The call timed out.' : 'The model sent an empty reply.'

async function startBetter($: EngineInterface, text: string) {
  const now = await $.clock.now()
  const id = `b${now}-${++flowSeq}`
  const original = text.trim()
  await update($, view, (v): View => ({ ...normalize(DEFAULT_VIEW, v), tab: 'live', isHistoryOpen: false }))
  if (!original) {
    await update($, flow, () => ({ ...IDLE_FLOW, id, step: 'input', startedAt: now }))
    return
  }
  await update($, flow, () => ({ ...IDLE_FLOW, id, step: 'asking', original, startedAt: now }))
  void askQuestions($, id)
}

async function askQuestions($: EngineInterface, id: string) {
  const f = await getFlow($)
  if (f.id !== id || f.step !== 'asking') return
  const r = await $.model
    .complete({ model: 'haiku', system: QUESTIONS_SYSTEM, prompt: questionsPrompt(f.original), maxTokens: 800, timeoutMs: 45_000 })
    .catch(() => ({ isAnswered: false as const, reason: 'api-error' as const }))
  const g = await getFlow($)
  if (g.id !== id || g.step !== 'asking') return
  if (!r.isAnswered) {
    await update($, flow, (x): BetterFlow => ({ ...normalizeFlow(x), step: 'error', failedAt: 'asking', error: failText(r as { reason?: string; status?: number }) }))
    return
  }
  // A reply that does not read as questions is treated as "nothing to ask".
  const qs = parseQuestions(r.text) ?? []
  if (qs.length === 0) {
    await update($, flow, (x): BetterFlow => ({ ...normalizeFlow(x), step: 'rewriting', questions: [], answers: [] }))
    void doRewrite($, id)
    return
  }
  await update($, flow, (x): BetterFlow => ({ ...normalizeFlow(x), step: 'questions', questions: qs, answers: qs.map(() => null) }))
}

async function doRewrite($: EngineInterface, id: string) {
  const f = await getFlow($)
  if (f.id !== id || f.step !== 'rewriting') return
  const r = await $.model
    .complete({ model: 'haiku', system: REWRITE_SYSTEM, prompt: rewritePrompt(f.original, f.questions, f.answers), maxTokens: 2000, timeoutMs: 60_000 })
    .catch(() => ({ isAnswered: false as const, reason: 'api-error' as const }))
  const g = await getFlow($)
  if (g.id !== id || g.step !== 'rewriting') return
  const out = r.isAnswered ? parseRewrite(r.text) : null
  if (!out) {
    const error = r.isAnswered ? 'The rewrite came back in a shape the deck could not read.' : failText(r as { reason?: string; status?: number })
    await update($, flow, (x): BetterFlow => ({ ...normalizeFlow(x), step: 'error', failedAt: 'rewriting', error }))
    return
  }
  const at = await $.clock.now()
  await update($, flow, (x): BetterFlow => ({ ...normalizeFlow(x), step: 'review', rewrite: out.prompt, added: out.added, isEditing: false }))
  let kept: BetterEntry[] = []
  await update($, history, list => (kept = [...normalizeHistory(list).filter(x => x.id !== id), { id, at, original: g.original, rewrite: out.prompt, added: out.added }].slice(-HISTORY_MAX)))
  await $.store.set('history', kept).catch(() => undefined)
}

/** Once every question is answered or skipped, the rewrite starts. */
async function afterAnswer($: EngineInterface, id: string) {
  const f = await getFlow($)
  if (f.id !== id || f.step !== 'questions' || !isAllAnswered(f)) return
  await update($, flow, (x): BetterFlow => ({ ...normalizeFlow(x), step: 'rewriting', otherFor: null }))
  void doRewrite($, id)
}

async function endFlow($: EngineInterface, restore: boolean) {
  const f = await getFlow($)
  await update($, flow, () => IDLE_FLOW)
  if (restore && f.original) await $.prompt.fill({ text: f.original }).catch(() => undefined)
}

// ---------------------------------------------------------------- Clawd

const CLAWD_KEY = 'clawd'
const CLAWD_STEP_MS = 220
let clawdTimer: Timer | null = null
let clawdPhase = 0

async function currentMood($: EngineInterface) {
  const [m, g, t, r, now] = await Promise.all([getMain($), getGate($), getTurn($), read($, receipt), $.clock.now()])
  return moodOf({
    isRunning: m.isRunning,
    isAsking: gateSummary(g).ask > 0,
    errorStreak: t.errorStreak,
    lastReason: r?.reason ?? null,
    sinceEnd: r && t.startedAt > 0 ? now - (t.startedAt + r.durationMs) : null,
  })
}

const isMoving = (mood: Mood) => (mood === 'work' || mood === 'wait' || mood === 'party') && frameCount(mood) > 1

/** The models of the agents at work now (running and heard from lately), oldest first. */
async function runningModels($: EngineInterface) {
  const [cards, now] = await Promise.all([getCards($), $.clock.now()])
  return workingCards(cards, now).map(c => c.model)
}

/** Starts Clawd's frame clock; it stops itself once Clawd has nothing to act out. */
function wakeClawd($: EngineInterface) {
  if (clawdTimer) return
  clawdTimer = $.clock.every(CLAWD_STEP_MS, () => void stepClawd($))
}

async function stepClawd($: EngineInterface) {
  const mood = await currentMood($).catch(() => 'sleep' as const)
  const crew = await runningModels($).catch(() => [] as string[])
  const mainModel = (await getMain($).catch(() => DEFAULT_MAIN)).model
  if (!isMoving(mood) && crew.length === 0) {
    clawdTimer?.cancel()
    clawdTimer = null
    clawdPhase = 0
    // One last frame so a resting Clawd does not stay mid-step.
    await $.ui.blit({ requestId: PANE, key: CLAWD_KEY, cells: sceneCells(mood, [], 0, mainModel) }).catch(() => undefined)
    return
  }
  clawdPhase += 1
  // Refused while the Live tab is not on screen; the clock keeps going until everyone rests.
  await $.ui.blit({ requestId: PANE, key: CLAWD_KEY, cells: sceneCells(mood, crew, clawdPhase, mainModel) }).catch(() => undefined)
}

async function sendPrompt($: EngineInterface, text: string) {
  await update($, flow, () => IDLE_FLOW)
  // What the deck sends for the person is their typed request: the report counts it.
  if (text.trim()) await update($, pendingTyped, () => true)
  // Sent as the person's own words; its origin (this plugin) keeps it out of the upgrade.
  if (text.trim()) void $.prompt.submit({ text: text.trim(), asUser: true }).catch(() => undefined)
}

// ---------------------------------------------------------------- fun

type Opened = { ok: true } | { ok: false; error: string }

const TB = 'terminal-browser'

async function orcaBin($: EngineInterface) {
  return `${(await $.env.get('ORCA_CLI_BIN_DIR')) ?? '/Applications/Orca.app/Contents/Resources/bin'}/orca`
}

async function browserKeys($: EngineInterface) {
  const ls = await $.process.run([TB, 'ls', '--all', '--json'], { timeoutMs: 8000 }).catch(() => null)
  return ls ? browserKeysOf(ls.stdout) : []
}

/** In Orca: a new tab in the browser the deck opened, or a new split beside the session. */
async function openInOrca($: EngineInterface, url: string): Promise<Opened> {
  const f = await getFun($)
  const before = await browserKeys($)
  if (f.orcaBrowser && before.includes(f.orcaBrowser)) {
    const tab = await $.process.run([TB, 'new-tab', url, '--browser', f.orcaBrowser], { timeoutMs: 10_000 }).catch(() => null)
    if (tab && tab.exitCode === 0) return { ok: true }
  }
  const orca = await orcaBin($)
  // The browser the deck opened before is gone: its split holds only a shell now.
  if (f.orcaSplit) await $.process.run([orca, 'terminal', 'close', '--terminal', f.orcaSplit, '--json'], { timeoutMs: 8000 }).catch(() => null)
  const split = await $.process
    .run([orca, 'terminal', 'split', '--direction', 'vertical', '--command', splitCommand(url), '--json'], { timeoutMs: 10_000 })
    .catch((err: unknown) => ({ exitCode: 1, stdout: '', stderr: String(err) }))
  const handle = splitHandleOf(split.stdout)
  if (!handle) return { ok: false, error: `Orca could not split the pane (${(split.stderr || split.stdout).trim().slice(0, 120)})` }
  let key: string | null = null
  for (let i = 0; i < 8 && !key; i++) {
    await $.process.run(['/bin/sleep', '1']).catch(() => null)
    key = (await browserKeys($)).find(k => !before.includes(k)) ?? null
  }
  await update($, fun, x => ({ ...normalizeFun(x), orcaSplit: handle, orcaBrowser: key }))
  return { ok: true }
}

async function openPage($: EngineInterface, url: string) {
  await update($, fun, f => ({ ...normalizeFun(f), status: `Opening ${nameOf(url)}…` }))
  let r: Opened
  if (isOrcaTerminal(await $.env.get('TERM_PROGRAM'))) {
    r = await openInOrca($, url).catch((err: unknown) => ({ ok: false as const, error: String(err).slice(0, 120) }))
  } else {
    // Elsewhere the terminal-browser plugin draws the page in a pane of its own.
    try {
      r = await $.browser.open({ url })
    } catch (err) {
      r = { ok: false, error: `the terminal-browser plugin is not loaded (${String(err).slice(0, 80)})` }
    }
  }
  let kept: Fun | null = null
  await update($, fun, f => {
    const x = normalizeFun(f)
    kept = { ...x, recent: pushRecent(x.recent, url), status: r.ok ? `Opened ${nameOf(url)}` : `Could not open it: ${r.error}` }
    return kept
  })
  if (kept) await $.store.set('fun', { ...(kept as Fun), status: '' }).catch(() => undefined)
}

async function closeBrowser($: EngineInterface) {
  const f = await getFun($)
  if (f.orcaSplit) {
    const orca = await orcaBin($)
    await $.process.run([orca, 'terminal', 'close', '--terminal', f.orcaSplit, '--json'], { timeoutMs: 8000 }).catch(() => null)
    await update($, fun, x => ({ ...normalizeFun(x), orcaSplit: null, orcaBrowser: null, status: 'Browser closed' }))
    return
  }
  try {
    await $.browser.close()
  } catch {
    // Nothing to close when the plugin is not loaded.
  }
}

async function saveFun($: EngineInterface, change: (f: Fun) => Fun) {
  let kept: Fun | null = null
  await update($, fun, f => (kept = change(normalizeFun(f))))
  if (kept) await $.store.set('fun', { ...(kept as Fun), status: '' }).catch(() => undefined)
}

/** A stored shape older than this build's: drop what cannot be read, keep the rest. */
async function migrate($: EngineInterface) {
  const m = await read($, meta)
  if ((m?.schemaVersion ?? 0) >= SCHEMA_VERSION) return
  await update($, log, list => normalizeLog(list))
  await update($, agents, list => listOf<unknown>(list).map(normalizeCard))
  await update($, gate, g => normalizeGate(g))
  await update($, meta, () => ({ schemaVersion: SCHEMA_VERSION }))
}

async function say($: EngineInterface, who: string, text: string, kind: LogLine['kind'] = 'info', agentId: string | null = null) {
  const line: LogLine = { at: await $.clock.now(), who, text, kind, agentId }
  await update($, log, list => [...normalizeLog(list), line].slice(-60))
}

async function refreshStatus($: EngineInterface, cfg: Config) {
  if (!cfg.statusLine) return $.ui.status(undefined)
  const [u, a, g, cards] = await Promise.all([getUsage($), getArchitect($), getGate($), getCards($)])
  const running = cards.filter(c => c.status === 'running').length
  const s = gateSummary(g)
  const parts = [
    u.pct !== null ? `ctx ${Math.round(u.pct)}%` : null,
    cards.length > 0 ? `agents ${running}/${cards.length}` : null,
    a.consults.length > 0 || a.ids.length > 0 ? `${cfg.architectLabel.toLowerCase()} ${isAdvising(a) ? 'advising' : a.consults.length}` : null,
    s.deny > 0 ? `denied ${s.deny}` : null,
  ]
  // Only fields with something to say; with none, no status entry at all.
  const shown = parts.filter(Boolean)
  $.ui.status(shown.length > 0 ? shown.join(' · ') : undefined)
}

async function whoIs($: EngineInterface, agentId: string | undefined) {
  if (!agentId) return 'main'
  const card = (await getCards($)).find(c => c.id === agentId)
  return card ? shorten(cardTitle(card), 14) : 'agent'
}

async function consultStarted($: EngineInterface, cfg: Config, id: string, via: string) {
  const t = await getTurn($)
  const moment = momentOf(t)
  const at = await $.clock.now()
  await update($, architect, a => startConsult(normalize(DEFAULT_ARCHITECT, a), { id, at, moment, via }))
  if (moment === 'before done') await update($, turn, x => ({ ...normalize(DEFAULT_TURN, x), isReviewing: true }))
  await say($, cfg.architectLabel.toLowerCase(), cfg.moments ? `${moment} · ${via}` : `consulted · ${via}`, 'consult')
  await refreshStatus($, cfg)
}

async function consultEnded($: EngineInterface, cfg: Config, advice: string | null, id?: string) {
  const at = await $.clock.now()
  const first = advice?.split('\n').find(l => l.trim()) ?? null
  const text = first ? shorten(first.replace(/^[#>*\s-]+/, ''), 160) : null
  await update($, architect, a => endConsult(normalize(DEFAULT_ARCHITECT, a), at, text, id))
  await update($, turn, t => ({ ...normalize(DEFAULT_TURN, t), isReviewing: false }))
  await say($, cfg.architectLabel.toLowerCase(), text ? `advice: ${shorten(text, 60)}` : 'advice returned', 'consult')
  await refreshStatus($, cfg)
}

async function noteAdvice($: EngineInterface, cfg: Config, advice: string) {
  await update($, architect, x => ({ ...normalize(DEFAULT_ARCHITECT, x), lastAdvice: advice }))
  await say($, cfg.architectLabel.toLowerCase(), `advice: ${shorten(advice, 60)}`, 'consult')
}

async function isArchitectType($: EngineInterface, cfg: Config, type: string) {
  return cfg.architect.test(type) || (await getRoster($)).architectTypes.includes(type)
}

async function openPane($: EngineInterface) {
  // columns apply when docked beside the transcript, rows when seated inline above the prompt.
  return $.ui.open({ id: PANE, title: TITLE, columns: PANE_COLUMNS, rows: 8 })
}

/** Opens the deck without holding the command's answer. */
function openSoon($: EngineInterface) {
  void openPane($).catch(() => undefined)
}

async function resetAll($: EngineInterface) {
  await update($, main, m => ({ ...DEFAULT_MAIN, model: normalize(DEFAULT_MAIN, m).model, mode: normalize(DEFAULT_MAIN, m).mode }))
  await update($, architect, () => DEFAULT_ARCHITECT)
  await update($, gate, () => DEFAULT_GATE)
  await update($, agents, () => [])
  await update($, loops, () => [])
  await update($, log, () => [])
  await update($, turn, () => DEFAULT_TURN)
  await update($, receipt, () => null)
  await update($, view, v => ({ ...DEFAULT_VIEW, tab: normalize(DEFAULT_VIEW, v).tab, range: normalize(DEFAULT_VIEW, v).range }))
  await update($, plan, () => DEFAULT_PLAN)
  await update($, explain, () => DEFAULT_EXPLAIN)
  // The context gauge waits for the next measurement rather than showing the pre-clear fill.
  await update($, usage, x => ({ ...normalize(DEFAULT_USAGE, x), pct: null, tokens: null }))
}

/** The session's cost read fresh, not from the last measurement: the receipt subtracts two of these. */
async function costNow($: EngineInterface): Promise<number | null> {
  const u = await $.session.usage().catch(() => null)
  return u?.cost?.usd ?? null
}

async function noteMode($: EngineInterface, mode: string | undefined) {
  if (mode) await update($, main, m => (normalize(DEFAULT_MAIN, m).mode === mode ? normalize(DEFAULT_MAIN, m) : { ...normalize(DEFAULT_MAIN, m), mode }))
}

// ---------------------------------------------------------------- hooks

export const register: Register = (on, options) => {
  const cfg = parseConfig(options)
  const C = PALETTES[cfg.palette]
  // tool.check carries no loop id; the tool.call around it does, keyed by the call's id.
  const callLoop = new Map<string, string | null>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'haha',
      description: 'Haha-deck: open a tab, close, reset, or set the Live layout',
      argumentHint: '[live|report|fun|close|reset|alert <usd>|layout auto|compact|wide|mini]',
    })
    await $.command.register({
      name: 'report',
      description: 'Work report: tasks done, hours saved and what they are worth (estimates)',
      argumentHint: '[today|week|month|year|settings [rate|kind] [value]]',
    })
    await $.command.register({
      name: 'better',
      description: 'Upgrade a rough prompt before it is sent; on/off for automatic mode, history for the last 20',
      argumentHint: '[prompt|on|off|history]',
    })
    await migrate($)
    await loadStore($)
    // A reload while agents run: their Clawds keep walking without waiting for the next event.
    if ((await runningModels($)).length > 0) wakeClawd($)
    const here = await $.session.root().catch(() => '')
    await update($, root, () => here)
    // A reload mid-upgrade picks the step back up instead of leaving the pane waiting.
    const f = await getFlow($)
    if (f.step === 'asking') void askQuestions($, f.id)
    if (f.step === 'rewriting') void doRewrite($, f.id)
    // A host without usage (headless, an SDK host, a session not yet bound) just starts without it.
    const u = await $.session.usage().catch(() => null)
    if (u) {
      await update($, usage, x => ({
        ...normalize(DEFAULT_USAGE, x),
        pct: u.context.percent ?? null,
        tokens: u.context.tokens ?? null,
        window: u.context.window,
        costUsd: u.cost?.usd ?? null,
        limits: u.rateLimits.map(r => ({ kind: r.kind, pct: r.percentUsed, resetsAt: r.resetsAt })),
      }))
    }
    if (cfg.openOnStart) void openPane($).catch(() => undefined)
    await refreshStatus($, cfg)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await resetAll($)
      await refreshStatus($, cfg)
    }
    return next(e)
  })

  on('command.run', { command: 'haha' }, async ($, e) => {
    try {
      const [verb = 'open', arg = ''] = e.args.trim().split(/\s+/)
      if (verb === 'close') {
        await $.ui.close({ id: PANE })
        return { text: 'Haha-deck closed.' }
      }
      if (verb === 'reset') {
        await resetAll($)
        await refreshStatus($, cfg)
        return { text: 'Haha-deck reset.' }
      }
      if (verb === 'layout') {
        const layout: Layout | null = arg === 'compact' || arg === 'wide' || arg === 'auto' || arg === 'mini' ? arg : null
        if (!layout) return { text: 'Usage: /haha layout auto|compact|wide|mini' }
        await update($, view, (v): View => ({ ...normalize(DEFAULT_VIEW, v), layout, tab: 'live' }))
        openSoon($)
        return { text: `Live layout: ${layout}.` }
      }
      if (verb === 'alert') {
        const usd = arg === 'off' ? 0 : Number(arg)
        if (!Number.isFinite(usd) || usd < 0) return { text: 'Usage: /haha alert <dollars> (e.g. /haha alert 5) or /haha alert off' }
        let kept = DEFAULT_GUARD
        await update($, guard, g => (kept = { ...normalizeGuard(g), costAlert: usd, alerted: normalizeGuard(g).alerted.filter(k => k !== 'cost') }))
        await $.store.set('guard', { costAlert: kept.costAlert, alerted: [] }).catch(() => undefined)
        return { text: usd > 0 ? `Haha-deck will tell you once a session costs more than $${usd}.` : 'Cost alert off.' }
      }
      if (verb === 'live' || verb === 'report' || verb === 'fun') await setTab($, verb)
      else if (verb !== 'open' && verb !== '') return { text: 'Usage: /haha [live|report|fun|close|reset|layout …]' }
      openSoon($)
      return { text: 'Haha-deck opened. Tabs: l Live, r Report, b Fun (focus the pane with ctrl+x tab).' }
    } catch (err) {
      return { text: `Haha-deck could not do that: ${String(err)}` }
    }
  })

  on('command.run', { command: 'report' }, async ($, e) => {
    try {
      const [verb = '', ...rest] = e.args.trim().split(/\s+/)
      if (verb === 'settings') {
        const r = applySetting(rest.join(' '), await getRates($))
        await update($, rates, () => r.rates)
        await $.store.set('rates', r.rates).catch(() => undefined)
        return { text: r.text }
      }
      const range: Range | undefined = verb === 'today' || verb === 'week' || verb === 'month' || verb === 'year' ? verb : undefined
      if (verb && !range) return { text: 'Usage: /report [today|week|month|year] or /report settings [rate|kind] [value]' }
      await setTab($, 'report', range)
      openSoon($)
      return { text: 'Work report opened. Hours and dollars are estimates.' }
    } catch (err) {
      return { text: `The report could not open: ${String(err)}` }
    }
  })

  on('command.run', { command: 'better' }, async ($, e) => {
    try {
      const arg = e.args.trim()
      if (arg === 'on' || arg === 'off') {
        await update($, isAuto, () => arg === 'on')
        await $.store.set('isAuto', arg === 'on').catch(() => undefined)
        return {
          text: arg === 'on'
            ? 'Automatic prompt upgrade is on: prompts you type go to the deck first. Start one with ">" to send it as is.'
            : 'Automatic prompt upgrade is off.',
        }
      }
      if (arg === 'history') {
        await update($, view, (v): View => ({ ...normalize(DEFAULT_VIEW, v), tab: 'live', isHistoryOpen: true }))
        openSoon($)
        return { text: 'Prompt history opened in the deck.' }
      }
      void startBetter($, arg).catch(() => undefined)
      openSoon($)
      return { text: arg ? 'Upgrading your prompt in the deck. Nothing runs until you press Run it.' : 'Type your rough prompt in the deck.' }
    } catch (err) {
      return { text: `The prompt upgrade could not start: ${String(err)}` }
    }
  })

  // Automatic mode catches typed prompts; every submission also says whether a typed task begins.
  on('prompt.submit', async ($, e, next) => {
    const origin = e.origin as { kind: string; name?: string }
    const typed = isTypedPrompt({ origin, command: e.command, isMeta: e.isMeta, turnId: e.turnId, self: PLUGIN })
    if (await read($, isAuto)) {
      const route = routePrompt({
        text: e.text,
        originKind: origin.kind,
        command: e.command,
        isMeta: e.isMeta,
        hasAttachments: (e.attachments?.length ?? 0) > 0,
        isBusy: Boolean(e.turnId),
      })
      if (route.kind === 'catch') {
        const opened = await openPane($).catch(() => ({ isPlaced: false }))
        if (!opened.isPlaced) {
          void $.prompt.fill({ text: e.text }).catch(() => undefined)
          return { drop: 'The window is too narrow for the prompt upgrade; your words are back in the prompt box.' }
        }
        await startBetter($, e.text)
        return { drop: 'Haha-deck is upgrading this prompt. Review it in the deck; nothing runs until you press Run it.' }
      }
      if (route.kind === 'strip') {
        if (typed) await update($, pendingTyped, () => true)
        return next({ ...e, text: route.text })
      }
    }
    if (typed) await update($, pendingTyped, () => true)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await noteMode($, e.permission_mode)
    return next(e)
  })

  on('agent.offer', async ($, e, next) => {
    const offered = await next(e)
    if (cfg.architect.test(e.agent) || (cfg.matchDescriptions && cfg.architect.test(e.description))) {
      await update($, roster, r => {
        const x = normalize(DEFAULT_ROSTER, r)
        return x.architectTypes.includes(e.agent) ? x : { architectTypes: [...listOf<string>(x.architectTypes), e.agent].slice(-20) }
      })
    }
    return offered
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      wakeClawd($)
      // A typed prompt starts a new task; any other turn (a continuation) carries on the last one.
      const typed = (await read($, pendingTyped)) === true
      if (typed) {
        await update($, pendingTyped, () => false)
        await update($, task, () => ({ isTyped: true, tools: [], writes: [] }))
        await update($, plan, () => DEFAULT_PLAN)
        await update($, activity, () => EMPTY_ACTIVITY)
      }
    }
    const [now, cost] = await Promise.all([$.clock.now(), costNow($)])
    await update($, turn, () => ({ ...DEFAULT_TURN, startedAt: now, costAtStart: cost }))
    await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: true }))
    // A background architect's report reaches the main loop as the text opening this turn. The
    // SubagentHandback tool call (in tool.call) normally carries it first; this is the fallback.
    const back = e.text ? handbackOf(e.text) : null
    const a = back ? await getArchitect($) : null
    if (back && a && a.ids.includes(back.from)) {
      const advice = adviceLine(back.body)
      if (advice && advice !== a.lastAdvice) await noteAdvice($, cfg, advice)
    } else if (e.text) {
      const p = promptLine(e.text)
      await say($, p.who, p.text)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // The main loop's model is known when its request starts; a long first request shouldn't read "—".
    if (!e.agentId) {
      await update($, main, m => {
        const x = normalize(DEFAULT_MAIN, m)
        return { ...x, model: e.model, effort: String(e.effort ?? x.effort), steps: x.steps + 1 }
      })
      return yield* next(e)
    }
    const result = yield* next(e)
    const id = e.agentId
    const [cards, a] = await Promise.all([getCards($), getArchitect($)])
    if (cards.some(c => c.id === id)) {
      const step = { model: e.model, usage: result.usage, stopReason: result.stopReason }
      const at = await $.clock.now()
      await update($, agents, list => listOf<unknown>(list).map(normalizeCard).map(c => (c.id === id ? { ...applyStep(c, step), lastAt: at } : c)))
      if (result.stopReason === 'max_tokens') await say($, await whoIs($, id), 'hit max_tokens', 'error', id)
    } else if (!a.ids.includes(id)) {
      const now = await $.clock.now()
      await update($, loops, l => stepLoop(listOf<Loop>(l), id, now))
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, x => ({
      ...normalize(DEFAULT_USAGE, x),
      pct: e.context.percent ?? null,
      tokens: e.context.tokens ?? null,
      window: e.context.window,
      costUsd: e.cost?.usd ?? null,
      limits: e.rateLimits.map(r => ({ kind: r.kind, pct: r.percentUsed, resetsAt: r.resetsAt })),
    }))
    if (e.changed.includes('context')) await refreshStatus($, cfg)
    // Past the cost alert or near a usage limit: said once, as a toast, because it needs the person.
    const g = normalizeGuard(await read($, guard))
    const alerts = guardAlerts(g, { costUsd: e.cost?.usd ?? null, limits: e.rateLimits.map(r => ({ kind: r.kind, pct: r.percentUsed })) }, limitLabel)
    if (alerts.length > 0) {
      await update($, guard, x => ({ ...normalizeGuard(x), alerted: [...normalizeGuard(x).alerted, ...alerts.map(a => a.key)] }))
      for (const a of alerts) $.ui.toast(a.text)
    }
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && e.trigger !== 'precompute') {
      const now = await $.clock.now()
      await update($, usage, x => {
        const u = normalize(DEFAULT_USAGE, x)
        return { ...u, compactions: u.compactions + 1, lastCompactAt: now }
      })
      await say($, 'main', `context compacted (${e.trigger})`)
    }
    return done
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id) {
      const check: Check = {
        id: e.tool_use_id,
        tool: e.tool,
        bucket: bucketOf(e.tool),
        verdict: verdict.decision === 'allow' ? 'rule' : verdict.decision,
        inSubagent: Boolean(callLoop.get(e.tool_use_id)),
        detail: shorten(describeInput(e.tool, e.input), 90),
        at: await $.clock.now(),
      }
      await update($, gate, g => recordCheck(normalizeGate(g), check))
      if (verdict.decision === 'ask') wakeClawd($)
      // The status line updates when the call settles; only a refusal ends here.
      if (verdict.decision === 'deny') {
        await say($, 'gate', `denied by rule · ${check.detail}`, 'error')
        await refreshStatus($, cfg)
      }
    }
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Agent' && !e.agentId && cfg.agentCap > 0) {
      const deny = agentCapDeny(cfg.agentCap, (await getTurn($)).agentCalls)
      if (deny) return { deny }
      await update($, turn, t => {
        const x = normalize(DEFAULT_TURN, t)
        return { ...x, agentCalls: x.agentCalls + 1 }
      })
    }
    callLoop.set(e.tool_use_id, e.agentId ?? null)
    const ran = await next(e).finally(() => callLoop.delete(e.tool_use_id))
    const didRun = ran.deny === undefined
    if (didRun) {
      const path = (e as unknown as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as unknown as { notebook_path?: unknown }).notebook_path
      const write = EDIT_TOOLS.has(e.tool) && typeof path === 'string' ? path : null
      await update($, task, t => {
        const x = normalize<Task>({ isTyped: false, tools: [], writes: [] }, t)
        return { ...x, tools: [...listOf<string>(x.tools), String(e.tool)].slice(-200), writes: write ? [...listOf<string>(x.writes), write].slice(-100) : listOf<string>(x.writes) }
      })
      const isFailed = ran.isError === true
      await update($, activity, a => pushActivity(normalize(EMPTY_ACTIVITY, a), String(e.tool), isFailed))
      if (write && !isFailed) {
        const at = await $.clock.now()
        await update($, files, list => touchFile(listOf(list), write, at))
      }
      if (String(e.tool) === 'TodoWrite' && !e.agentId) {
        const items = planFromTodos(e)
        const at = await $.clock.now()
        if (items) await update($, plan, () => ({ items, updatedAt: at }))
      }
    }
    // Settle this call's pending ask, if it had one; skip the write (and the redraw) otherwise.
    const g0 = await getGate($)
    const isSettled = settleCheck(g0, e.tool_use_id, didRun) !== g0
    if (isSettled) await update($, gate, g => settleCheck(normalizeGate(g), e.tool_use_id, didRun))
    // A background agent hands its report back through this tool; an architect's report is its advice.
    if (String(e.tool) === 'SubagentHandback') {
      const message = (e as unknown as { message?: unknown }).message
      const a = e.agentId ? await getArchitect($) : null
      if (a && e.agentId && a.ids.includes(e.agentId) && typeof message === 'string') {
        const advice = adviceLine(message)
        if (advice && advice !== a.lastAdvice) await noteAdvice($, cfg, advice)
      }
      return ran
    }
    if (e.tool === 'Agent') {
      if (isSettled) await refreshStatus($, cfg)
      return ran
    }
    const hasFailed = didRun && ran.isError === true
    const isEdit = !hasFailed && didRun && EDIT_TOOLS.has(e.tool)
    const t0 = await getTurn($)
    if (isEdit || hasFailed || (!e.agentId && t0.errorStreak > 0)) {
      await update($, turn, t => afterCall(normalize(DEFAULT_TURN, t), { inSubagent: Boolean(e.agentId), hasFailed, isEdit }))
    }
    const text = shorten(describeInput(e.tool, e), 64)
    if (e.agentId) {
      const toolAt = await $.clock.now()
      const id = e.agentId
      await update($, agents, list =>
        listOf<unknown>(list)
          .map(normalizeCard)
          .map(c => (c.id === id ? { ...noteTool(c, { tool: e.tool, text, isError: hasFailed || ran.deny !== undefined }), lastAt: toolAt } : c)),
      )
    }
    // The log keeps what is worth a glance: refusals, errors and edits; the rest is on the cards.
    if (ran.deny !== undefined) await say($, await whoIs($, e.agentId), `${text}  denied`, 'error', e.agentId ?? null)
    else if (hasFailed) await say($, await whoIs($, e.agentId), `${text}  ✗`, 'error', e.agentId ?? null)
    else if (isEdit) await say($, await whoIs($, e.agentId), text, 'info', e.agentId ?? null)
    if (isSettled || !didRun) await refreshStatus($, cfg)
    return ran
  })

  // A server-side review tool never reaches tool.call: it shows only in the assistant's rows.
  on('session.append', async ($, e, next) => {
    if (!e.agentId && e.message.type === 'assistant') {
      const a = await getArchitect($)
      // Consults this row opened: their result may be in the same row, after the stale read above.
      const opened = new Set<string>()
      for (const block of e.message.content as unknown as readonly ServerBlock[]) {
        if (block.type === 'server_tool_use' && block.name && block.id && cfg.architect.test(block.name)) {
          if (a.seen.includes(block.id)) continue
          const id = block.id
          await update($, architect, x => {
            const y = normalize(DEFAULT_ARCHITECT, x)
            return { ...y, seen: [...listOf<string>(y.seen), id].slice(-60) }
          })
          opened.add(id)
          await consultStarted($, cfg, id, `${block.name} tool`)
        } else if (block.type.endsWith('_tool_result') && block.tool_use_id) {
          const id = block.tool_use_id
          const isOpen = opened.has(id) || (await getArchitect($)).consults.some(c => c.id === id && c.endAt === null)
          if (isOpen) await consultEnded($, cfg, null, id)
        }
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (!e.parentAgentId) await noteMode($, e.permissionMode)
    if (started.deny !== undefined || !started.agentId) return started
    const id = started.agentId
    if (await isArchitectType($, cfg, e.subagentType)) {
      await update($, architect, a => {
        const x = normalize(DEFAULT_ARCHITECT, a)
        return { ...x, ids: [...listOf<string>(x.ids), id].slice(-40) }
      })
      await update($, loops, l => listOf<Loop>(l).filter(x => x.id !== id))
      await consultStarted($, cfg, id, e.subagentType.split(':').pop() ?? 'agent')
      return started
    }
    wakeClawd($)
    const card: AgentCard = {
      ...normalizeCard({}),
      id,
      type: e.name ?? e.subagentType,
      model: started.model,
      description: e.description,
      spawnedAt: await $.clock.now(),
    }
    await update($, agents, list => [...listOf<unknown>(list).map(normalizeCard), card].slice(-24))
    await update($, loops, l => listOf<Loop>(l).filter(x => x.id !== id))
    await say($, shorten(cardTitle(card), 12), `spawned · ${card.type}`, 'info', id)
    await refreshStatus($, cfg)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId
    const now = await $.clock.now()
    if (!id) {
      const [t, cards, cost] = await Promise.all([getTurn($), getCards($), costNow($)])
      const r = receiptOf(t, {
        durationMs: e.durationMs,
        agentsSince: cards.filter(c => c.spawnedAt >= t.startedAt).length,
        costNow: cost,
        reason: e.reason,
      })
      await update($, receipt, () => r)
      await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: false }))
      if (e.answer) await update($, lastAnswer, () => e.answer.slice(0, 50_000))
      wakeClawd($) // the celebration, then a nap
      // A typed request that ended with an answer is one finished task for the report.
      const tk = await getTask($)
      if (tk.isTyped && e.reason === 'answer') {
        const kind = classify(tk.tools, tk.writes)
        const model = (await getMain($)).model
        const key = dayKey(now)
        // Read the store fresh: other sessions open at the same time add to it too.
        const stored = normalizeDays(await $.store.get('days').catch(() => undefined))
        // Worktrees of one repository count as one project.
        const repo = await $.session.repo().catch(() => null)
        const project = projectOf(repo?.root ?? (await $.session.root().catch(() => '')))
        const kept = pruneDays(recordTask(stored, key, kind, model, project), key)
        await $.store.set('days', kept).catch(() => undefined)
        await update($, days, () => kept)
        await update($, task, () => ({ isTyped: false, tools: [], writes: [] }))
      } else if (tk.isTyped && e.reason !== 'answer') {
        await update($, task, () => ({ isTyped: false, tools: [], writes: [] }))
      }
      await refreshStatus($, cfg)
      return done
    }
    if ((await getArchitect($)).ids.includes(id)) {
      await consultEnded($, cfg, e.answer, id)
      return done
    }
    const cards = await getCards($)
    if (cards.some(c => c.id === id)) {
      const status = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
      await update($, agents, list =>
        listOf<unknown>(list)
          .map(normalizeCard)
          .map(c => (c.id === id ? { ...c, status, endedAt: now, answer: shorten(e.answer, 400) } : c)),
      )
      const card = cards.find(c => c.id === id)
      const took = card ? fmtDuration(now - card.spawnedAt) : ''
      await say($, await whoIs($, id), status === 'done' ? `done · ${took}` : status, status === 'done' ? 'done' : 'error', id)
    } else {
      await update($, loops, l => listOf<Loop>(l).map(x => (x.id === id ? { ...x, isDone: true, lastAt: now } : x)))
    }
    await refreshStatus($, cfg)
    return done
  })

  // ---------------------------------------------------------------- drawing

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const hasClient = 'Client' in els
    const E: Els = { Box, Text, Button, Input: 'Input' in els ? els.Input : undefined }
    const v0 = await getView($)
    const W0 = Math.max(40, e.props.bodyColumns)
    const tabBar = TabBar(E, v0.tab, W0, tab => void setTab($, tab))

    if (v0.tab === 'report') {
      const [d, rt, at] = await Promise.all([getDays($), getRates($), $.clock.now()])
      return (
        <Box flexDirection="column" width={W0}>
          {tabBar}
          <Text> </Text>
          {ReportView(E, { days: d, rates: rt, range: v0.range, today: dayKey(at), width: W0, onRange: range => void setTab($, 'report', range) })}
        </Box>
      )
    }

    if (v0.tab === 'fun') {
      const f = await getFun($)
      return (
        <Box flexDirection="column" width={W0}>
          {tabBar}
          <Text> </Text>
          {FunView(E, {
            fun: f,
            width: W0,
            hasBrowser: true,
            open: url => void openPage($, url),
            openLine: line => {
              const url = urlOf(line)
              if (url) void openPage($, url)
            },
            close: () => void closeBrowser($),
            save: (b: Bookmark) => void saveFun($, x => ({ ...x, bookmarks: [...x.bookmarks.filter(y => y.url !== b.url), b].slice(0, 12) })),
            remove: url => void saveFun($, x => ({ ...x, bookmarks: x.bookmarks.filter(y => y.url !== url) })),
          })}
        </Box>
      )
    }

    const [fl, hist, auto, pl, ex] = await Promise.all([getFlow($), getHistory($), read($, isAuto), getPlan($), getExplain($)])
    const [act, fs, ns, gd, ans, astatus, here, dd] = await Promise.all([
      read($, activity).then(a => normalize(EMPTY_ACTIVITY, a)),
      read($, files).then(x => listOf<FileTouch>(x)),
      read($, notes).then(normalizeNotes),
      read($, guard).then(normalizeGuard),
      read($, lastAnswer).then(x => (typeof x === 'string' ? x : '')),
      read($, actionStatus).then(x => (typeof x === 'string' ? x : '')),
      read($, root).then(x => (typeof x === 'string' ? x : '')),
      getDays($),
    ])
    const say2 = (text: string) => void update($, actionStatus, () => text)
    const actionsOn: ActionHandlers = {
      compact: () =>
        void (async () => {
          await update($, actionStatus, () => 'Compacting the conversation…')
          const done = await $.session.compact({}).then(() => true, () => false)
          await update($, actionStatus, () => (done ? 'Compacted.' : 'Compact did not run here; type /compact.'))
        })(),
      model: name =>
        void (async () => {
          const r = await $.command.run({ command: 'model', args: name }).catch((err: unknown) => ({ text: `Could not switch: ${String(err).slice(0, 80)}` }))
          await update($, actionStatus, () => r.text?.split('\n')[0] || `Model: ${name}`)
        })(),
      effort: dir =>
        void (async () => {
          const current = (await getMain($)).effort
          const target = stepEffort(current, dir)
          if (!target) return say2(!current ? 'Effort is not known until the first request.' : dir > 0 ? 'Effort is already at the top.' : 'Effort is already at the bottom.')
          const r = await $.command.run({ command: 'effort', args: target }).catch((err: unknown) => ({ text: `Could not change effort: ${String(err).slice(0, 80)}` }))
          await update($, actionStatus, () => r.text?.split('\n')[0] || `Effort: ${target}`)
        })(),
      copyAnswer: () =>
        void (async () => {
          const r = await $.ui.copy({ text: ans }).catch(() => ({ isCopied: false }))
          await update($, actionStatus, () => (r.isCopied ? 'Copied the last answer.' : 'Could not reach the clipboard.'))
        })(),
    }
    const copyPath = (path: string) =>
      void (async () => {
        const r = await $.ui.copy({ text: path }).catch(() => ({ isCopied: false }))
        await update($, actionStatus, () => (r.isCopied ? `Copied ${path}` : 'Could not reach the clipboard.'))
      })()
    const notesOn = {
      add: (text: string) =>
        void (async () => {
          const at = await $.clock.now()
          let kept: Note[] = []
          await update($, notes, x => (kept = addNote(normalizeNotes(x), text, at)))
          await $.store.set('notes', kept).catch(() => undefined)
        })(),
      use: (n: Note) => void $.prompt.fill({ text: n.text, mode: 'insert' }).catch(() => undefined),
      remove: (id: string) =>
        void (async () => {
          let kept: Note[] = []
          await update($, notes, x => (kept = normalizeNotes(x).filter(y => y.id !== id)))
          await $.store.set('notes', kept).catch(() => undefined)
        })(),
    }
    const betterOn: BetterHandlers = {
      start: text => void startBetter($, text),
      answer: (i, value) =>
        void (async () => {
          if (!value) return
          await update($, flow, x => {
            const y = normalizeFlow(x)
            const answers = [...y.answers]
            answers[i] = value
            return { ...y, answers, otherFor: null }
          })
          await afterAnswer($, fl.id)
        })(),
      skip: i =>
        void (async () => {
          await update($, flow, x => {
            const y = normalizeFlow(x)
            const answers = [...y.answers]
            answers[i] = ''
            return { ...y, answers, otherFor: y.otherFor === i ? null : y.otherFor }
          })
          await afterAnswer($, fl.id)
        })(),
      other: i => void update($, flow, x => ({ ...normalizeFlow(x), otherFor: normalizeFlow(x).otherFor === i ? null : i })),
      skipRest: () =>
        void (async () => {
          await update($, flow, x => {
            const y = normalizeFlow(x)
            return { ...y, answers: y.questions.map((_, i) => (typeof y.answers[i] === 'string' ? y.answers[i] : '')) }
          })
          await afterAnswer($, fl.id)
        })(),
      run: text => void sendPrompt($, text),
      edit: () => void update($, flow, x => ({ ...normalizeFlow(x), isEditing: !normalizeFlow(x).isEditing })),
      copy: () => void $.ui.copy({ text: fl.rewrite }).catch(() => undefined),
      cancel: () => void endFlow($, true),
      retry: () =>
        void (async () => {
          const step: BetterFlow['step'] = fl.failedAt === 'rewriting' ? 'rewriting' : 'asking'
          await update($, flow, (x): BetterFlow => ({ ...normalizeFlow(x), step, error: '', failedAt: null }))
          if (step === 'rewriting') await doRewrite($, fl.id)
          else await askQuestions($, fl.id)
        })(),
      sendOriginal: () => void sendPrompt($, fl.original),
      toggleAuto: () =>
        void (async () => {
          let next = false
          await update($, isAuto, x => (next = x !== true))
          await $.store.set('isAuto', next).catch(() => undefined)
        })(),
      toggleHistory: () => void update($, view, x => ({ ...normalize(DEFAULT_VIEW, x), isHistoryOpen: !normalize(DEFAULT_VIEW, x).isHistoryOpen })),
      reopen: (entry: BetterEntry) =>
        void (async () => {
          await update($, flow, () => ({ ...IDLE_FLOW, id: entry.id, step: 'review', original: entry.original, rewrite: entry.rewrite, added: entry.added, startedAt: entry.at }))
          await update($, view, x => ({ ...normalize(DEFAULT_VIEW, x), isHistoryOpen: false }))
        })(),
    }
    const betterBlock =
      fl.step !== 'idle'
        ? BetterView(E, { flow: fl, width: W0, on: betterOn })
        : v0.isHistoryOpen
          ? BetterHistory(E, { history: hist, width: W0, on: betterOn, fmtTime: ms => fmtClock(ms).slice(0, 5) })
          : BetterBar(E, { isAuto: auto === true, historyCount: hist.length, width: W0, on: betterOn })
    const onExplain = () =>
      void (async () => {
        await update($, explain, x => ({ ...normalize(DEFAULT_EXPLAIN, x), isLoading: true }))
        const res = await $.model
          .fork({ prompt: 'In 2 to 4 short plain-language sentences, in the language I wrote to you in, recap what you just did in your last turn and what is left. No headings, no lists.' })
          .catch(() => null)
        const at = await $.clock.now()
        const text = res && res.isAnswered ? res.text.trim() : 'Could not explain the last turn right now.'
        await update($, explain, () => ({ text, isLoading: false, at }))
      })()

    const [m, u, a, g, cards, lp, lines, t, r, v, now] = await Promise.all([
      getMain($),
      getUsage($),
      getArchitect($),
      getGate($),
      getCards($),
      getLoops($),
      getLog($),
      getTurn($),
      read($, receipt),
      getView($),
      $.clock.now(),
    ])
    const W = Math.max(40, e.props.bodyColumns)
    const layout = v.layout ?? cfg.layout
    const isWide = layout === 'wide' || (layout === 'auto' && W >= 110)
    const colW = isWide ? Math.floor((W - 2) / 2) : W
    const modelName = prettyModel(m.model)
    const viewed = e.props.view?.agentId ?? null
    const advising = isAdvising(a)
    const running = cards.filter(c => c.status === 'running')
    const showArchitect = a.consults.length > 0 || a.ids.length > 0
    const motion = cfg.motion && hasClient
    // A panel with nothing to show yet takes no room: most sessions never spawn an agent.
    const isEmpty: Record<Panel, boolean> = {
      pet: false,
      main: false,
      actions: false,
      activity: act.cells.length === 0,
      files: fs.length === 0,
      notes: false,
      plan: pl.items.length === 0,
      architect: !showArchitect,
      gate: g.recent.length === 0 && gateSummary(g).total === 0,
      agents: cards.length === 0,
      loops: lp.length === 0,
      receipt: !m.isRunning && !r,
      log: false,
    }
    const panels = cfg.panels.filter(p => !isEmpty[p])
    const decider = m.mode === 'auto' ? 'classifier' : 'you'

    // A connector between panels: animated while its flow is live, a dim line otherwise.
    const rail = (key: string, active: boolean, color: string, width: number, marks: number[] = [], isMerge = false) =>
      motion ? (
        <els.Client
          key={key}
          module="./rail.tsx"
          width={width}
          height={1}
          props={{ active, width, color, dim: C.faint, marks, isMerge }}
        />
      ) : (
        <Text color={C.faint}>{'─'.repeat(Math.max(1, width))}</Text>
      )

    // A start time of 0 is unknown (state saved before it was recorded): no clock, not decades.
    const clock = (key: string, since: number, endAt: number | null, color: string) =>
      since <= 0 ? (
        <Text color={color}>—</Text>
      ) : hasClient ? (
        <els.Client key={key} module="./elapsed.tsx" props={{ since, now, endAt, color }} />
      ) : (
        <Text color={color}>{fmtTimer((endAt ?? now) - since)}</Text>
      )

    // ---- main
    const effortN = { low: 1, medium: 2, high: 3, xhigh: 4, max: 4 }[m.effort] ?? 0
    const ctxGauge = u.pct !== null ? gauge(u.pct, 10) : null
    const mainPanel = (w: number) => (
      <Box flexDirection="column" borderStyle="round" borderColor={C.main} paddingX={1} width={w}>
        <Box justifyContent="space-between">
          <Text color={C.main} bold>
            {modelName} · main
          </Text>
          <Text color={m.isRunning ? C.main : C.dim}>{m.isRunning ? '● working' : '○ idle'}</Text>
        </Box>
        <Text wrap="truncate">
          <Text dimColor>effort </Text>
          <Text color={C.main}>{'▮'.repeat(effortN) + '▯'.repeat(4 - effortN)} </Text>
          <Text color={C.main} bold>
            {m.effort || '—'}
          </Text>
          {m.mode ? <Text dimColor>{`   mode ${m.mode}`}</Text> : null}
          <Text dimColor>{`   ${m.steps} req`}</Text>
        </Text>
        {ctxGauge ? (
          <Text wrap="truncate">
            <Text dimColor>ctx </Text>
            <Text color={u.pct !== null && u.pct >= 80 ? C.warn : C.main}>{ctxGauge.on}</Text>
            <Text color={C.faint}>{ctxGauge.off}</Text>
            <Text bold>{` ${Math.round(u.pct ?? 0)}%`}</Text>
            {u.tokens !== null ? <Text dimColor>{` ${kTokens(u.tokens)}/${kTokens(u.window)}`}</Text> : null}
            {u.compactions > 0 ? <Text color={C.amber}>{`  ⟲${u.compactions}`}</Text> : null}
          </Text>
        ) : null}
        {u.costUsd !== null || u.limits.length > 0 ? (
          <Text wrap="truncate">
            {u.costUsd !== null ? (
              <Text color={gd.costAlert > 0 && u.costUsd >= gd.costAlert ? C.warn : C.text} bold={gd.costAlert > 0 && u.costUsd >= gd.costAlert}>
                {`${fmtUsd(u.costUsd)}${gd.costAlert > 0 ? `/${fmtUsd(gd.costAlert)}` : ''}   `}
              </Text>
            ) : null}
            {u.limits.slice(0, 2).map(l => {
              const lg = gauge(l.pct, 5)
              return (
                <Text wrap="truncate">
                  <Text dimColor>{`${limitLabel(l.kind)} `}</Text>
                  <Text color={l.pct >= 80 ? C.warn : C.main}>{lg.on}</Text>
                  <Text color={C.faint}>{lg.off}</Text>
                  <Text dimColor>{` ${Math.round(l.pct)}%`}</Text>
                  {untilReset(l.resetsAt, now) ? <Text color={C.faint}>{` ↻${untilReset(l.resetsAt, now)}`}</Text> : null}
                  <Text>{'  '}</Text>
                </Text>
              )
            })}
          </Text>
        ) : null}
      </Box>
    )

    // ---- architect
    const lastConsult = a.consults[a.consults.length - 1]
    const architectPanel = (w: number) => {
      const tl = consultTimeline(a, now, Math.max(8, w - 4))
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={C.arch} paddingX={1} width={w}>
          <Box justifyContent="space-between">
            <Text color={C.arch} bold>
              {cfg.architectLabel} · {advising ? 'advising' : 'on call'}
            </Text>
            <Text>
              <Text dimColor>consults </Text>
              <Text color={C.arch} bold>
                {a.consults.length}
              </Text>
            </Text>
          </Box>
          <Text color={C.arch}>{tl}</Text>
          {lastConsult ? (
            <Text dimColor wrap="truncate">
              {advising
                ? `consulting since ${fmtClock(lastConsult.at)}`
                : `last ${fmtDuration(now - (lastConsult.endAt ?? lastConsult.at))} ago · took ${fmtDuration((lastConsult.endAt ?? now) - lastConsult.at)}`}
            </Text>
          ) : (
            <Text dimColor>not consulted yet</Text>
          )}
          {cfg.moments ? (
            <Box flexWrap="wrap" columnGap={2}>
              {(['before a plan', 'error repeats', 'before done'] as const).map(mo => {
                const isOn = lastConsult?.moment === mo
                return (
                  <Text color={isOn ? C.arch : C.dim} bold={isOn}>
                    {isOn ? '◆' : '◇'} {mo}
                  </Text>
                )
              })}
              <Text color={C.faint}>(inferred)</Text>
            </Box>
          ) : null}
          {a.lastAdvice ? (
            <Text color={C.arch} wrap="truncate">
              » {a.lastAdvice}
            </Text>
          ) : null}
        </Box>
      )
    }

    // ---- gate
    const s = gateSummary(g)
    const verdictColor = (c: Check) =>
      c.verdict === 'rule' ? C.gate : c.verdict === 'cleared' ? C.cleared : c.verdict === 'ask' ? C.amber : C.warn
    const gatePanel = (w: number) => {
      const strip = g.recent.slice(-Math.max(8, w - 4))
      const open = v.gateOpen
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={C.gate} paddingX={1} width={w}>
          <Box justifyContent="space-between">
            <Text color={C.gate} bold>
              {cfg.gateLabel} · permissions
            </Text>
            <Text dimColor>{`${s.total} checks`}</Text>
          </Box>
          <Box>
            {strip.length === 0 ? <Text color={C.faint}>no checks yet</Text> : null}
            {strip.map(c => (
              <Text color={verdictColor(c)} dimColor={c.inSubagent}>
                {c.verdict === 'deny' ? '✗' : '■'}
              </Text>
            ))}
          </Box>
          <Text wrap="truncate">
            <Text color={C.gate}>■</Text>
            <Text dimColor>{` ${s.rule} allowed  `}</Text>
            <Text color={C.cleared}>■</Text>
            <Text dimColor>{` ${s.cleared} ${decider}  `}</Text>
            {s.ask > 0 ? <Text color={C.amber}>{`■ ${s.ask} pending  `}</Text> : null}
            <Text color={s.deny > 0 ? C.warn : C.dim}>{`✗ ${s.deny} denied`}</Text>
            {w >= 80 && g.recent.some(c => c.inSubagent) ? <Text color={C.faint}>{'  dim: in subagents'}</Text> : null}
          </Text>
          <Box columnGap={2}>
            {(['file', 'shell', 'other'] as const).map((b: Bucket) => {
              const tl = g.totals[b]
              const n = tl.rule + tl.ask + tl.cleared + tl.deny
              return (
                <Button
                  key={`gate-${b}`}
                  plain
                  hotkey={b[0]}
                  label={`${b} ${n}${open === b ? ' ▾' : ''}`}
                  dimColor={n === 0}
                  onPress={() => update($, view, x => ({ ...normalize(DEFAULT_VIEW, x), gateOpen: normalize(DEFAULT_VIEW, x).gateOpen === b ? null : b }))}
                />
              )
            })}
          </Box>
          {open
            ? g.recent
                .filter(c => c.bucket === open)
                .slice(-5)
                .map(c => (
                  <Text wrap="truncate">
                    <Text color={verdictColor(c)}>{c.verdict === 'deny' ? '✗ ' : '■ '}</Text>
                    <Text color={C.dim}>{`${(c.verdict === 'rule' ? 'allowed' : c.verdict === 'cleared' ? decider : c.verdict === 'ask' ? 'pending' : 'denied').padEnd(10)} `}</Text>
                    <Text dimColor={c.inSubagent}>{shorten(c.detail, Math.max(10, w - 18))}</Text>
                  </Text>
                ))
            : null}
        </Box>
      )
    }

    // ---- agents: cards up to the limit, swimlanes beyond it
    const statusColor = (c: AgentCard) => (c.status === 'failed' ? C.warn : c.status === 'done' ? C.gate : C.agent)
    const glyph = (c: AgentCard) => (c.status === 'running' ? '◐' : c.status === 'done' ? '✓' : c.status === 'failed' ? '✗' : '■')
    const expandOnPress = (id: string) => () =>
      update($, view, x => ({ ...normalize(DEFAULT_VIEW, x), expanded: normalize(DEFAULT_VIEW, x).expanded === id ? null : id }))

    const agentsPanel = (w: number) => {
      // Cards need 20 columns each; when the pane can't hold the limit, lanes take over.
      const fit = Math.max(1, Math.min(cfg.maxCards, Math.floor((w + 1) / 21)))
      const useLanes = cards.length > fit
      const header = (
        <Box justifyContent="space-between" width={w}>
          <Text bold>{`agents · ${running.length} running · ${cards.length} total`}</Text>
          {cards.length > 0 ? <Text color={C.faint}>1-{Math.min(cards.length, useLanes ? 6 : fit)} expand</Text> : null}
        </Box>
      )
      if (cards.length === 0) {
        return (
          <Box flexDirection="column" width={w}>
            {header}
            <Text color={C.faint}>no subagents yet</Text>
          </Box>
        )
      }
      if (useLanes) {
        const shown = cards.slice(-6)
        const barW = Math.max(8, w - 28)
        const geo = lanes(shown, now, barW)
        return (
          <Box flexDirection="column" width={w}>
            {header}
            {cards.length > shown.length ? <Text color={C.faint}>{`+${cards.length - shown.length} earlier`}</Text> : null}
            {shown.map((c, i) => {
              const gm = geo[i]
              const isViewed = viewed === c.id
              return (
                <Box>
                  <Text color={statusColor(c)} bold={isViewed}>{`${isViewed ? '▶' : glyph(c)} `}</Text>
                  <Box width={17}>
                    <Button key={`card-${c.id}`} plain hotkey={String(i + 1)} label={shorten(cardTitle(c), 14)} onPress={expandOnPress(c.id)} />
                  </Box>
                  <Text color={C.faint}>{' ' + '·'.repeat(gm?.before ?? 0)}</Text>
                  <Text color={statusColor(c)}>{'━'.repeat(gm?.bar ?? 1)}</Text>
                  <Text color={C.faint}>{'·'.repeat(gm?.after ?? 0) + ' '}</Text>
                  {clock(`lane-clock-${c.id}`, c.spawnedAt, c.endedAt, C.dim)}
                </Box>
              )
            })}
          </Box>
        )
      }
      const shown = cards.slice(-fit)
      const cardW = Math.max(20, Math.floor((w - (shown.length - 1)) / shown.length))
      const centers = shown.map((_, i) => i * (cardW + 1) + Math.floor(cardW / 2))
      return (
        <Box flexDirection="column" width={w}>
          {header}
          {rail('fan-out', running.length > 0, C.agent, w, centers)}
          <Box columnGap={1}>
            {shown.map((c, i) => {
              const isViewed = viewed === c.id
              const sameModel = !c.model || prettyModel(c.model) === modelName
              return (
                <Box
                  flexDirection="column"
                  borderStyle={isViewed ? 'double' : 'round'}
                  borderColor={c.lastStop === 'max_tokens' ? C.warn : C.agent}
                  borderDimColor={c.status !== 'running' && !isViewed}
                  width={cardW}
                  paddingX={1}
                >
                  <Button key={`card-${c.id}`} plain hotkey={String(i + 1)} label={titleLines(cardTitle(c), cardW - 7, cardW - 4)[0]} onPress={expandOnPress(c.id)} />
                  <Text bold wrap="truncate">
                    {titleLines(cardTitle(c), cardW - 7, cardW - 4)[1]}
                  </Text>
                  <Text color={C.dim} wrap="truncate">
                    {sameModel ? c.type : `${c.type} · ${prettyModel(c.model)}`}
                  </Text>
                  <Text dimColor wrap="truncate">
                    {c.steps > 0 ? `ctx ${kTokens(c.ctx)} · out ${kTokens(c.out)} · ${c.steps} st` : 'starting…'}
                  </Text>
                  <Box>
                    <Text color={c.lastStop === 'max_tokens' ? C.warn : statusColor(c)}>
                      {cardW >= 26 ? `${glyph(c)} ${c.lastStop === 'max_tokens' ? 'max_tokens' : c.status} ` : `${glyph(c)} `}
                    </Text>
                    <Box flexShrink={0}>{clock(`card-clock-${c.id}`, c.spawnedAt, c.endedAt, C.dim)}</Box>
                  </Box>
                </Box>
              )
            })}
          </Box>
          {rail('merge', running.length > 0, C.agent, w, centers, true)}
        </Box>
      )
    }

    const expandedCard = cards.find(c => c.id === v.expanded)
    const expandedPanel = (w: number) =>
      expandedCard ? (
        <Box flexDirection="column" borderStyle="single" borderColor={C.agent} paddingX={1} width={w}>
          <Text bold wrap="wrap">
            {expandedCard.description || expandedCard.type}
          </Text>
          <Text dimColor wrap="truncate">{`${expandedCard.type} · ${prettyModel(expandedCard.model)} · ${expandedCard.status} · ${expandedCard.steps} steps`}</Text>
          {expandedCard.tools.length === 0 ? <Text color={C.faint}>no tool calls yet</Text> : null}
          {expandedCard.tools.map(n => (
            <Text color={n.isError ? C.warn : C.text} wrap="truncate">
              {`${n.isError ? '✗' : '·'} ${n.text}`}
            </Text>
          ))}
          {expandedCard.answer ? (
            <Text dimColor wrap="wrap">
              {`» ${shorten(expandedCard.answer, 240)}`}
            </Text>
          ) : null}
        </Box>
      ) : null

    // ---- other loops (workflow agents, forks): ids that match no card
    const loopsPanel = (w: number) => {
      if (lp.length === 0) return null
      const active = lp.filter(l => isLoopActive(l, now)).length
      const dots = lp.slice(-Math.max(4, w - 38))
      return (
        <Box width={w}>
          <Text bold>other loops </Text>
          <Text dimColor>{`${lp.length} seen · ${active} active  `}</Text>
          {dots.map(l => (
            <Text color={isLoopActive(l, now) ? C.agent : l.isDone ? C.dim : C.faint}>{isLoopActive(l, now) ? '●' : l.isDone ? '✓' : '○'}</Text>
          ))}
        </Box>
      )
    }

    // ---- receipt: the turn now, or the last one
    const receiptPanel = (w: number) => {
      const isReview = t.isReviewing
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={C.main} borderDimColor={!m.isRunning && !isReview} paddingX={1} width={w}>
          {m.isRunning ? (
            <Box>
              <Text color={C.main} wrap="truncate">{`◐ back to ${modelName.toLowerCase()} · turn `}</Text>
              <Box flexShrink={0}>{clock('turn-clock', t.startedAt, null, C.main)}</Box>
              {w >= 60 ? <Text dimColor wrap="truncate">{` · ${plural(t.edits, 'edit')} · ${plural(t.errors, 'error')}`}</Text> : null}
            </Box>
          ) : r ? (
            <Text wrap="truncate">
              <Text color={r.reason === 'answer' ? C.gate : C.warn}>{r.reason === 'answer' ? '✓ ' : '✗ '}</Text>
              <Text>{`last turn ${fmtDuration(r.durationMs)} · ${plural(r.agents, 'agent')} · ${plural(r.edits, 'edit')} · ${plural(r.errors, 'error')}`}</Text>
              {r.costDelta !== null ? <Text color={C.main}>{` · +${fmtUsd(r.costDelta)}`}</Text> : null}
            </Text>
          ) : (
            <Text color={C.faint}>no turn finished yet</Text>
          )}
          {isReview ? <Text color={C.arch}>{`${cfg.architectLabel.toLowerCase()} reviewing before done (inferred)`}</Text> : null}
        </Box>
      )
    }

    // ---- log: whatever rows the other panels leave, 4 to 8
    const used =
      2 + 4 + 1 + 3 + (act.cells.length > 0 ? 4 : 0) + (fs.length > 0 ? Math.min(8, fs.length) + 2 : 0) + 2 + Math.min(6, ns.length) +
      (pl.items.length > 0 ? pl.items.length + 3 : 0) + 5 + (showArchitect ? 6 : 0) + 6 + (v.gateOpen ? 5 : 0) + (cards.length > cfg.maxCards ? 3 + Math.min(6, cards.length) : 8) + (expandedCard ? 8 : 0) + (lp.length ? 1 : 0) + 3
    const bodyRows = e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 40
    const nLog = logRows(bodyRows, used)
    const shownLines = (viewed ? lines.filter(l => l.agentId === viewed) : lines).slice(-nLog)
    const colorOf = (l: LogLine) =>
      l.kind === 'error' ? C.warn : l.kind === 'consult' ? C.arch : l.who === 'main' ? C.main : l.who === 'gate' ? C.gate : l.who === 'you' ? C.text : C.agent
    const logPanel = (w: number) => (
      <Box flexDirection="column" borderStyle="round" borderColor={C.faint} paddingX={1} width={w}>
        <Text dimColor>{viewed ? 'session log · this agent' : 'session log'}</Text>
        {shownLines.length === 0 ? <Text color={C.faint}>nothing yet</Text> : null}
        {shownLines.map(l => (
          <Box>
            <Box width={9} flexShrink={0}>
              <Text color={C.faint}>{fmtClock(l.at)}</Text>
            </Box>
            <Box width={13} flexShrink={0}>
              <Text color={colorOf(l)} bold wrap="truncate">
                {l.who}
              </Text>
            </Box>
            <Text color={l.kind === 'error' ? C.warn : C.text} wrap="truncate">
              {l.text}
            </Text>
          </Box>
        ))}
      </Box>
    )

    // ---- pet, quick actions, activity, files, notes
    const todayKey = dayKey(now)
    const mood = await currentMood($)
    // With agents running the same frame holds a crew of small Clawds, the main one among them.
    const crewModels = workingCards(cards, now).map(c => c.model)
    const crewN = crewModels.length
    const petNode =
      'Raster' in els ? (
        <els.Raster key={CLAWD_KEY} columns={CLAWD_COLS} rows={CLAWD_ROWS} cells={sceneCells(mood, crewModels, clawdPhase, m.model)} />
      ) : null
    // The legend names the colours on screen: the main model and the agents' Clawds drawn.
    const families = familiesIn([m.model, ...crewModels.slice(0, CREW_MAX)].filter(Boolean))
    const extra = (p: Panel, w: number) =>
      p === 'pet'
        ? PetPanel(E, { mood, width: w, today: dayTotal(dd[todayKey]), streak: streakOf(dd, todayKey), animated: petNode, crewCount: crewN, crewMax: CREW_MAX, families })
        : p === 'actions'
          ? ActionsPanel(E, { width: w, isRunning: m.isRunning, hasAnswer: ans.length > 0, effort: m.effort, model: m.model, status: astatus, on: actionsOn })
          : p === 'activity'
            ? ActivityPanel(E, act, w)
            : p === 'files'
              ? FilesPanel(E, { files: fs, width: w, rel: path => relPath(path, here), copy: copyPath })
              : NotesPanel(E, { notes: ns, width: w, ...notesOn })

    const draw = (p: Panel, w: number) =>
      p === 'pet' || p === 'actions' || p === 'activity' || p === 'files' || p === 'notes'
        ? extra(p, w)
        : p === 'plan'
        ? PlanPanel(E, pl, w)
        : p === 'main'
        ? mainPanel(w)
        : p === 'architect'
          ? architectPanel(w)
          : p === 'gate'
            ? gatePanel(w)
            : p === 'agents'
              ? agentsPanel(w)
              : p === 'loops'
                ? loopsPanel(w)
                : p === 'receipt'
                  ? receiptPanel(w)
                  : logPanel(w)

    // Panels with the flow between them; the agents panel draws its own rails.
    const column = (ps: Panel[], w: number) => (
      <Box flexDirection="column" width={w}>
        {ps.map((p, i) => {
          const prev = ps[i - 1]
          const link =
            i === 0 || ['pet', 'actions', 'activity', 'files', 'notes', 'plan'].includes(p) || ['pet', 'actions', 'activity', 'files', 'notes', 'plan'].includes(prev ?? '') || p === 'agents' || prev === 'agents' || p === 'log' || p === 'loops' || prev === 'loops'
              ? null
              : rail(`link-${p}`, p === 'architect' ? advising : m.isRunning, p === 'architect' ? C.arch : C.main, w)
          return (
            <Box flexDirection="column">
              {link}
              {draw(p, w)}
              {p === 'agents' ? expandedPanel(w) : null}
            </Box>
          )
        })}
      </Box>
    )

    // Desktop draws the agents' time axis as SVG under the panels.
    const svgLanes =
      e.surface !== 'terminal' && cards.length > 0
        ? (() => {
            const { Svg } = $.ui.resolve(e)
            const rowH = 18
            const pxW = 520
            const geo = lanes(cards.slice(-10), now, 100)
            const rects = cards
              .slice(-10)
              .map((c, i) => {
                const gm = geo[i]
                const x = 150 + ((gm?.before ?? 0) / 100) * (pxW - 160)
                const wpx = Math.max(3, ((gm?.bar ?? 1) / 100) * (pxW - 160))
                const fill = c.status === 'running' ? SVG_COLORS.running : c.status === 'done' ? SVG_COLORS.done : c.status === 'failed' ? SVG_COLORS.failed : SVG_COLORS.other
                const label = shorten(cardTitle(c), 22).replace(/[<&>]/g, '')
                return `<text x="4" y="${i * rowH + 13}" font-size="11" fill="${SVG_COLORS.label}">${label}</text><rect x="${x}" y="${i * rowH + 4}" width="${wpx}" height="10" rx="3" fill="${fill}"/>`
              })
              .join('')
            const svgH = Math.min(10, cards.length) * rowH + 4
            return (
              <Svg
                source={`<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${svgH}" viewBox="0 0 ${pxW} ${svgH}">${rects}</svg>`}
                alt={`${cards.length} agents on a time axis`}
                width={pxW}
                height={svgH}
              />
            )
          })()
        : null

    // Inline above the prompt (the terminal's main screen), the pane is a summary of at most 8 rows.
    const isMini = layout === 'mini' || (layout === 'auto' && e.props.placement === 'inline')
    if (isMini) {
      const live = [...cards.filter(c => c.status === 'running'), ...cards.filter(c => c.status !== 'running').reverse()].slice(0, 3)
      const counts = ` ${s.rule} allowed · ${s.cleared} ${decider}${s.ask > 0 ? ` · ${s.ask} pending` : ''} · ${s.deny} denied`
      const strip = g.recent.slice(-Math.max(4, W - cfg.gateLabel.length - 1 - counts.length))
      const mg = u.pct !== null ? gauge(u.pct, 6) : null
      return (
        <Box flexDirection="column" width={W}>
          <Text wrap="truncate">
            <Text color={C.main} bold>
              {modelName}
            </Text>
            <Text color={m.isRunning ? C.main : C.dim}>{m.isRunning ? ' ● working' : ' ○ idle'}</Text>
            {mg ? <Text dimColor> · ctx </Text> : null}
            {mg ? <Text color={(u.pct ?? 0) >= 80 ? C.warn : C.main}>{mg.on}</Text> : null}
            {mg ? <Text color={C.faint}>{mg.off}</Text> : null}
            {mg ? <Text>{` ${Math.round(u.pct ?? 0)}%`}</Text> : null}
            {u.compactions > 0 ? <Text color={C.amber}>{` ⟲${u.compactions}`}</Text> : null}
            {u.costUsd !== null ? <Text dimColor>{` · ${fmtUsd(u.costUsd)}`}</Text> : null}
            {showArchitect ? <Text color={C.arch}>{` · ${cfg.architectLabel.toLowerCase()} ${advising ? 'advising' : a.consults.length}`}</Text> : null}
          </Text>
          {strip.length > 0 ? (
            <Box>
              <Text dimColor>{`${cfg.gateLabel.toLowerCase()} `}</Text>
              {strip.map(c => (
                <Text color={verdictColor(c)} dimColor={c.inSubagent}>
                  {c.verdict === 'deny' ? '✗' : '■'}
                </Text>
              ))}
              <Text color={s.deny > 0 ? C.warn : s.ask > 0 ? C.amber : C.dim} wrap="truncate">
                {counts}
              </Text>
            </Box>
          ) : null}
          {live.map(c => (
            <Box>
              <Text color={statusColor(c)}>{`${glyph(c)} `}</Text>
              <Box width={Math.max(10, W - 30)}>
                <Text wrap="truncate">{cardTitle(c)}</Text>
              </Box>
              <Text dimColor>{c.steps > 0 ? ` ctx ${kTokens(c.ctx)} ` : ' '}</Text>
              {clock(`mini-clock-${c.id}`, c.spawnedAt, c.endedAt, C.dim)}
            </Box>
          ))}
          {cards.length > live.length ? (
            <Text color={C.faint} wrap="truncate">{`+${cards.length - live.length} more agents · /haha layout compact for all`}</Text>
          ) : null}
          {lp.length > 0 ? <Text dimColor>{`other loops ${lp.length} · ${lp.filter(l => isLoopActive(l, now)).length} active`}</Text> : null}
          {!m.isRunning && r ? (
            <Text dimColor wrap="truncate">
              {`last turn ${fmtDuration(r.durationMs)} · ${plural(r.agents, 'agent')} · ${plural(r.edits, 'edit')} · ${plural(r.errors, 'error')}${r.costDelta !== null ? ` · +${fmtUsd(r.costDelta)}` : ''}`}
            </Text>
          ) : null}
        </Box>
      )
    }

    const legend = fitLegend(
      [
        { label: 'main', color: C.main },
        { label: 'agents', color: C.agent },
        { label: cfg.gateLabel.toLowerCase(), color: C.gate },
        ...(showArchitect ? [{ label: cfg.architectLabel.toLowerCase(), color: C.arch }] : []),
      ],
      W,
    )

    const body = isWide ? (
      <Box flexDirection="column">
        <Box columnGap={2}>
          {column(panels.filter(p => p === 'main' || p === 'actions' || p === 'activity' || p === 'architect' || p === 'gate' || p === 'files'), colW)}
          {column(panels.filter(p => p === 'plan' || p === 'agents' || p === 'loops' || p === 'notes' || p === 'receipt'), colW)}
        </Box>
        {panels.includes('log') ? logPanel(W) : null}
      </Box>
    ) : (
      column(panels, W)
    )

    return (
      <Box flexDirection="column" width={W}>
        {tabBar}
        <Text> </Text>
        {betterBlock}
        <Text> </Text>
        <Box justifyContent="center">
          <Text bold wrap="truncate">
            <Text>HAHA-DECK</Text>
            <Text color={C.dim}> · </Text>
            <Text color={C.main}>{modelName.toUpperCase()}</Text>
            <Text>{m.isRunning ? ' WORKS' : ' IDLE'}</Text>
            {showArchitect ? <Text color={C.dim}> · </Text> : null}
            {showArchitect ? <Text color={C.arch}>{cfg.architectLabel}</Text> : null}
            {showArchitect ? <Text>{advising ? ' ADVISING' : ' ON CALL'}</Text> : null}
          </Text>
        </Box>
        <Box justifyContent="center" columnGap={2}>
          {legend.map(l => (
            <Text>
              <Text color={l.color}>■</Text>
              <Text dimColor>{` ${l.label}`}</Text>
            </Text>
          ))}
        </Box>
        {body}
        {ExplainPanel(E, ex, W, !m.isRunning && r !== null, onExplain)}
        {svgLanes}
      </Box>
    )
  })
}
