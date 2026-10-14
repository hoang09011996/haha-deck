// Prompt upgrade: which prompts go to the deck, what the model is asked and how its answers read.
// Pure, no `$`.
import type { BetterEntry, BetterFlow, BetterQuestion } from '../types'

export const IDLE_FLOW: BetterFlow = {
  id: '',
  step: 'idle',
  original: '',
  questions: [],
  answers: [],
  otherFor: null,
  rewrite: '',
  added: [],
  error: '',
  failedAt: null,
  isEditing: false,
  startedAt: 0,
}

export const normalizeFlow = (stored: unknown): BetterFlow => {
  const f = { ...IDLE_FLOW, ...(typeof stored === 'object' && stored !== null ? stored : {}) } as BetterFlow
  return {
    ...f,
    questions: Array.isArray(f.questions) ? f.questions : [],
    answers: Array.isArray(f.answers) ? f.answers : [],
    added: Array.isArray(f.added) ? f.added : [],
  }
}

export const normalizeHistory = (stored: unknown): BetterEntry[] =>
  (Array.isArray(stored) ? stored : [])
    .filter((x): x is BetterEntry => typeof x === 'object' && x !== null && typeof (x as BetterEntry).rewrite === 'string')
    .slice(-20)

export const HISTORY_MAX = 20

// ---------------------------------------------------------------- which prompts the deck catches

const SHORT =
  /^(y|yes|yeah|yep|no|nope|ok|okay|k|sure|thanks|thank you|thx|go|go on|go ahead|continue|keep going|do it|done|next|stop|lgtm|cảm ơn|tiếp|tiếp tục|được|đúng|làm đi|có|không|ừ|ok luôn)[.!]*$/i

export type Route = { kind: 'pass' } | { kind: 'strip'; text: string } | { kind: 'catch' }

/**
 * What automatic mode does with a submitted prompt: catch it for an upgrade, send it as is, or
 * send it without its leading ">". Anything not typed by the person at the prompt passes.
 */
export const routePrompt = (p: {
  text: string
  originKind: string
  command?: unknown
  isMeta?: boolean
  hasAttachments: boolean
  isBusy: boolean
}): Route => {
  const text = p.text.trim()
  if (p.originKind !== 'composer' || p.command || p.isMeta) return { kind: 'pass' }
  if (text.startsWith('>')) return { kind: 'strip', text: text.replace(/^>\s*/, '') }
  if (p.hasAttachments || p.isBusy || text.startsWith('/')) return { kind: 'pass' }
  if (SHORT.test(text) || text.split(/\s+/).filter(Boolean).length <= 2) return { kind: 'pass' }
  return { kind: 'catch' }
}

// ---------------------------------------------------------------- the model's two jobs

export const QUESTIONS_SYSTEM = [
  'You help a person sharpen a request before they send it to Claude Code, an AI coding and work assistant.',
  'Find at most three multiple-choice questions whose answers would most improve the result.',
  'Each question has two to four short options (at most five words each).',
  'Ask nothing the prompt already answers. If no question would really help, return an empty list.',
  'Write the questions in the language of the prompt.',
  'Reply with JSON only, no prose: {"questions":[{"q":"...","options":["...","..."]}]}',
].join('\n')

export const questionsPrompt = (original: string) => `The rough prompt:\n<prompt>\n${original}\n</prompt>`

export const REWRITE_SYSTEM = [
  'You rewrite a rough request into a clear one the person could have typed themselves.',
  'Keep exactly what they meant. Add a clear goal, who it is for, the format, and what done looks like.',
  'Use the answers they gave. Leave out anything they skipped.',
  'Never invent facts, names, numbers or prices. Where something is unknown, leave a [placeholder] in square brackets.',
  'Write it as one plain-language request, in the language of the original.',
  'Also list, in a few words each, what you added.',
  'Reply with JSON only, no prose: {"prompt":"...","added":["...","..."]}',
].join('\n')

export const rewritePrompt = (original: string, qs: readonly BetterQuestion[], answers: readonly (string | null)[]) => {
  const lines = qs
    .map((q, i) => ({ q, a: answers[i] }))
    .filter(x => typeof x.a === 'string' && x.a !== '')
    .map(x => `- ${x.q.q} → ${x.a}`)
  return [
    `The rough prompt:\n<prompt>\n${original}\n</prompt>`,
    lines.length > 0 ? `Their answers:\n${lines.join('\n')}` : 'They answered no questions.',
  ].join('\n\n')
}

/** The first JSON object in a reply, fences and chatter around it ignored. */
const jsonOf = (text: string): unknown => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

export const parseQuestions = (text: string): BetterQuestion[] | null => {
  const j = jsonOf(text) as { questions?: unknown } | null
  if (!j || !Array.isArray(j.questions)) return null
  return j.questions
    .map(x => x as { q?: unknown; question?: unknown; options?: unknown })
    .map(x => ({
      q: String(x.q ?? x.question ?? '').trim(),
      options: (Array.isArray(x.options) ? x.options : []).map(o => String(o).trim()).filter(Boolean).slice(0, 4),
    }))
    .filter(x => x.q && x.options.length >= 2)
    .slice(0, 3)
}

export const parseRewrite = (text: string): { prompt: string; added: string[] } | null => {
  const j = jsonOf(text) as { prompt?: unknown; added?: unknown } | null
  if (!j || typeof j.prompt !== 'string' || !j.prompt.trim()) return null
  const added = (Array.isArray(j.added) ? j.added : []).map(a => String(a).trim()).filter(Boolean).slice(0, 8)
  return { prompt: j.prompt.trim(), added }
}

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

export const TRACK = ['Your prompt', 'Questions', 'Rewrite', 'Review'] as const

/** Where the tracker stands: the index of the current step. */
export const trackIndex = (f: Pick<BetterFlow, 'step' | 'failedAt'>) =>
  f.step === 'input' ? 0 : f.step === 'asking' || f.step === 'questions' ? 1 : f.step === 'rewriting' ? 2 : f.step === 'review' ? 3 : f.step === 'error' ? (f.failedAt === 'rewriting' ? 2 : 1) : 0

export const answeredCount = (f: Pick<BetterFlow, 'answers' | 'questions'>) =>
  f.questions.filter((_, i) => typeof f.answers[i] === 'string').length

/** The flow is done asking once every question is answered or skipped. */
export const isAllAnswered = (f: Pick<BetterFlow, 'answers' | 'questions'>) => answeredCount(f) === f.questions.length
