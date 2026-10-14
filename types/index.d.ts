export type Moment = 'before a plan' | 'error repeats' | 'before done'

export type Bucket = 'file' | 'shell' | 'other'

/** rule: settings allowed it. ask: put to the decider, outcome pending. cleared: asked, then ran. deny: refused. */
export type Verdict = 'rule' | 'ask' | 'cleared' | 'deny'

export type Main = { model: string; effort: string; mode: string; steps: number; isRunning: boolean }

export type Usage = {
  pct: number | null
  tokens: number | null
  window: number
  costUsd: number | null
  limits: { kind: string; pct: number; resetsAt?: string }[]
  compactions: number
  lastCompactAt: number | null
}

export type Consult = { id: string; at: number; endAt: number | null; moment: Moment; via: string }

export type Architect = { consults: Consult[]; ids: string[]; seen: string[]; lastAdvice: string }

export type Check = {
  id: string
  tool: string
  bucket: Bucket
  verdict: Verdict
  inSubagent: boolean
  detail: string
  at: number
}

export type Tally = { rule: number; ask: number; cleared: number; deny: number }

export type Gate = { recent: Check[]; totals: Record<Bucket, Tally> }

export type ToolNote = { tool: string; text: string; isError: boolean }

export type AgentCard = {
  id: string
  type: string
  model: string
  description: string
  status: string
  spawnedAt: number
  endedAt: number | null
  /** The agent's context now: input + cache read + cache write of its latest step. */
  ctx: number
  /** Output tokens summed over its steps. */
  out: number
  steps: number
  lastStop: string | null
  /** When the agent last did something (a model step or a tool call); 0 before it has. */
  lastAt: number
  tools: ToolNote[]
  answer: string
}

/** A model loop whose id matches no card: a workflow agent, a compaction or a memory fork. */
export type Loop = { id: string; steps: number; firstAt: number; lastAt: number; isDone: boolean }

export type LogLine = {
  at: number
  who: string
  text: string
  agentId: string | null
  kind: 'info' | 'error' | 'consult' | 'done'
}

export type Turn = {
  edits: number
  errorStreak: number
  errors: number
  isReviewing: boolean
  startedAt: number
  costAtStart: number | null
  /** Agent calls the main loop made this turn, held to the agent cap. */
  agentCalls: number
}

export type Receipt = {
  durationMs: number
  agents: number
  edits: number
  errors: number
  costDelta: number | null
  reason: string
}

export type Layout = 'auto' | 'compact' | 'wide' | 'mini'

export type Tab = 'live' | 'report' | 'fun'

export type Range = 'today' | 'week' | 'month' | 'year'

export type View = {
  expanded: string | null
  gateOpen: Bucket | null
  layout: Layout | null
  tab: Tab
  range: Range
  /** The prompt-upgrade history list is open in the Live tab. */
  isHistoryOpen: boolean
}

// ---------------------------------------------------------------- plan (the to-do list as a checklist)

export type PlanItem = { text: string; status: 'done' | 'active' | 'upcoming' }

export type Plan = { items: PlanItem[]; updatedAt: number }

// ---------------------------------------------------------------- live extras

export type Mood = 'sleep' | 'work' | 'wait' | 'error' | 'party'

export type ActKind = 'read' | 'edit' | 'shell' | 'web' | 'agent' | 'mcp' | 'other'

/** One cell per tool call of the current task, oldest first. */
export type Activity = { cells: { k: ActKind; isError: boolean }[] }

export type FileTouch = { path: string; edits: number; at: number }

export type Note = { id: string; text: string; at: number }

/** The cost alert in dollars (0 off) and what was already said this session. */
export type Guard = { costAlert: number; alerted: string[] }

// ---------------------------------------------------------------- explain

export type Explain = { text: string; isLoading: boolean; at: number }

// ---------------------------------------------------------------- work report

export type Kind = 'code' | 'documents' | 'research' | 'images' | 'emails' | 'other'

/** One calendar day: finished tasks per kind and per model. */
export type DayRecord = {
  kinds: Partial<Record<Kind, number>>
  models: Record<string, number>
  /** Per project (the repository's folder name, else the session's): tasks per kind. */
  projects?: Record<string, Partial<Record<Kind, number>>>
}

export type Days = Record<string, DayRecord>

export type Rates = { rate: number; minutes: Record<Kind, number> }

/** The task the main loop is on: whether a typed prompt started it, and what it touched. */
export type Task = { isTyped: boolean; tools: string[]; writes: string[] }

// ---------------------------------------------------------------- prompt upgrade

export type BetterQuestion = { q: string; options: string[] }

export type BetterStep = 'idle' | 'input' | 'asking' | 'questions' | 'rewriting' | 'review' | 'error'

export type BetterFlow = {
  id: string
  step: BetterStep
  original: string
  questions: BetterQuestion[]
  /** Per question: null unanswered, '' skipped, otherwise the answer. */
  answers: (string | null)[]
  /** The question whose "Other" box is open. */
  otherFor: number | null
  rewrite: string
  added: string[]
  error: string
  failedAt: 'asking' | 'rewriting' | null
  isEditing: boolean
  startedAt: number
}

export type BetterEntry = { id: string; at: number; original: string; rewrite: string; added: string[] }

// ---------------------------------------------------------------- fun

export type Bookmark = { name: string; url: string }

export type Fun = {
  bookmarks: Bookmark[]
  recent: Bookmark[]
  status: string
  /** In Orca: the split the deck opened the browser in, and that browser's key. */
  orcaSplit: string | null
  orcaBrowser: string | null
}

export type Roster = { architectTypes: string[] }

declare module 'claude-code' {
  interface PluginState {
    'haha-deck': {
      meta: { schemaVersion: number }
      main: Main
      usage: Usage
      architect: Architect
      gate: Gate
      agents: AgentCard[]
      loops: Loop[]
      log: LogLine[]
      turn: Turn
      receipt: Receipt | null
      view: View
      roster: Roster
      plan: Plan
      explain: Explain
      days: Days
      rates: Rates
      task: Task
      pendingTyped: boolean
      flow: BetterFlow
      history: BetterEntry[]
      isAuto: boolean
      fun: Fun
      activity: Activity
      files: FileTouch[]
      notes: Note[]
      guard: Guard
      lastAnswer: string
      actionStatus: string
      root: string
    }
  }
}
