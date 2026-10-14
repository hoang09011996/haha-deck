import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { parseQuestions, parseRewrite, routePrompt } from '../hooks/better'
import { STALE_MS, agentCapDeny, isStaleCard, normalizeCard, planFromTodos, workingCards } from '../hooks/core'
import { CLAWD_COLS, CLAWD_ROWS, CREW_MAX, crewPositionOf, crewSpriteOf, familiesIn, familyOf, frameCells, frameCount, positionOf, sceneCells, spriteOf } from '../hooks/clawd'
import { actKindOf, addNote, guardAlerts, moodOf, pushActivity, relPath, stepEffort, touchFile, untilReset } from '../hooks/live'
import { browserKeysOf, nameOf, pushRecent, splitCommand, splitHandleOf, urlOf } from '../hooks/fun'
import {
  DEFAULT_RATES,
  addDays,
  applySetting,
  barCells,
  chartBars,
  classify,
  dayKey,
  dayOfYear,
  hoursOf,
  isTypedPrompt,
  projectOf,
  rangeKeys,
  recordTask,
  streak,
  sumDays,
} from '../hooks/report'
import { bigRows } from '../hooks/theme'
import { tilesPerRow } from '../hooks/views'
import type { Days } from '../types'

// ---------------------------------------------------------------- report: pure

test('a task is sorted into one kind by the tools it used and the files it wrote', () => {
  expect(classify(['mcp__claude_ai_Gmail__create_draft', 'WebSearch'], [])).toBe('emails')
  expect(classify(['Write'], ['/tmp/hero.png'])).toBe('images')
  expect(classify(['Write'], ['/repo/docs/plan.md'])).toBe('documents')
  expect(classify(['mcp__claude_ai_Claude_Docs__batch'], [])).toBe('documents')
  expect(classify(['Read', 'Edit', 'Bash'], ['/repo/src/a.ts'])).toBe('code')
  expect(classify(['WebSearch', 'WebFetch', 'Read'], [])).toBe('research')
  expect(classify(['Read', 'Grep'], [])).toBe('other')
  expect(classify([], [])).toBe('other')
})

test('only a prompt the person typed counts as a task', () => {
  const base = { origin: { kind: 'composer' }, self: 'haha-deck' }
  expect(isTypedPrompt(base)).toBe(true)
  expect(isTypedPrompt({ ...base, command: { name: 'report', args: '' } })).toBe(false)
  expect(isTypedPrompt({ ...base, isMeta: true })).toBe(false)
  expect(isTypedPrompt({ ...base, turnId: 'T1' })).toBe(false) // typed while Claude was working
  expect(isTypedPrompt({ ...base, origin: { kind: 'task-notification' } })).toBe(false)
  expect(isTypedPrompt({ ...base, origin: { kind: 'plugin', name: 'other' } })).toBe(false)
  expect(isTypedPrompt({ ...base, origin: { kind: 'plugin', name: 'haha-deck' } })).toBe(true) // the deck's Run it
})

test('days add up, step at noon, and the streak counts days in a row', () => {
  expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
  expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  expect(dayOfYear('2026-01-01')).toBe(1)
  expect(dayOfYear('2026-12-31')).toBe(365)
  expect(dayOfYear('2024-12-31')).toBe(366)
  expect(rangeKeys('week', '2026-10-14')).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'])
  expect(rangeKeys('year', '2026-01-03').length).toBe(3)
  expect(dayKey(new Date(2026, 9, 14, 23, 59).getTime())).toBe('2026-10-14')

  let d: Days = {}
  d = recordTask(d, '2026-10-12', 'code', 'claude-opus-5-5')
  d = recordTask(d, '2026-10-13', 'research', 'claude-opus-5-5')
  d = recordTask(d, '2026-10-14', 'code', 'claude-sonnet-5-5')
  d = recordTask(d, '2026-10-14', 'documents', 'claude-opus-5-5')
  d = recordTask(d, '2026-10-10', 'emails', 'claude-opus-5-5')
  expect(streak(d, '2026-10-14')).toBe(3)
  expect(streak(d, '2026-10-15')).toBe(3) // today still empty: count to yesterday
  expect(streak(d, '2026-10-16')).toBe(0)

  const s = sumDays(d, rangeKeys('week', '2026-10-14'))
  expect(s.total).toBe(5)
  expect(s.kinds.code).toBe(2)
  expect(s.active).toBe(4)
  expect(s.models[0]).toEqual(['claude-opus-5-5', 4])
  // 2 code × 30 + 1 research × 25 + 1 documents × 30 + 1 email × 10 = 125 minutes
  expect(Math.round(hoursOf(s.kinds, DEFAULT_RATES) * 600)).toBe(1250)
})

test('tasks add up per project', () => {
  expect([projectOf('/repo/claude-mods'), projectOf('/repo/claude-mods/'), projectOf('C:\\work\\shop'), projectOf('')]).toEqual(['claude-mods', 'claude-mods', 'shop', 'unknown'])
  let d: Days = {}
  d = recordTask(d, '2026-10-13', 'code', 'm', 'shop')
  d = recordTask(d, '2026-10-14', 'code', 'm', 'shop')
  d = recordTask(d, '2026-10-14', 'research', 'm', 'notes')
  const s = sumDays(d, rangeKeys('week', '2026-10-14'))
  expect(s.projects.map(p => [p.name, p.count, p.kinds.code])).toEqual([['shop', 2, 2], ['notes', 1, 0]])
})

test('settings list and change the estimate', () => {
  expect(applySetting('', DEFAULT_RATES).text).toContain('$50 per hour')
  expect(applySetting('rate 75', DEFAULT_RATES).rates.rate).toBe(75)
  expect(applySetting('emails 15', DEFAULT_RATES).rates.minutes.emails).toBe(15)
  expect(applySetting('emails lots', DEFAULT_RATES).rates).toEqual(DEFAULT_RATES)
  expect(applySetting('fishing 3', DEFAULT_RATES).text).toContain('Unknown setting')
})

test('the chart: weekdays, thirty days, and a year with the month in gold and the future empty', () => {
  const d = recordTask({}, '2026-10-14', 'code', 'm')
  const week = chartBars('week', d, '2026-10-14')
  expect(week.length).toBe(7)
  expect(week[6]).toEqual({ label: 'We', value: 1, isCurrent: true, isFuture: false })
  expect(chartBars('month', d, '2026-10-14').length).toBe(30)
  const year = chartBars('year', d, '2026-10-14')
  expect(year.length).toBe(12)
  expect(year[9]?.isCurrent).toBe(true)
  expect(year[10]?.isFuture).toBe(true)
  expect(barCells(0, 4)).toEqual([' ', ' ', ' '])
  expect(barCells(4, 4)).toEqual(['█', '█', '█'])
  expect(barCells(1, 100)[2]).toBe('▁') // a non-zero day always shows
  expect(bigRows('12.5')?.length).toBe(3)
  expect(bigRows('12x')).toBe(null)
  expect([tilesPerRow(72), tilesPerRow(50), tilesPerRow(36)]).toEqual([3, 2, 1])
})

// ---------------------------------------------------------------- prompt upgrade: pure

test('which prompts automatic mode catches and which pass straight through', () => {
  const p = { originKind: 'composer', hasAttachments: false, isBusy: false }
  expect(routePrompt({ ...p, text: 'write a landing page for my bakery' }).kind).toBe('catch')
  expect(routePrompt({ ...p, text: '> write it exactly like this' })).toEqual({ kind: 'strip', text: 'write it exactly like this' })
  expect(routePrompt({ ...p, text: 'keep going' }).kind).toBe('pass')
  expect(routePrompt({ ...p, text: 'yes' }).kind).toBe('pass')
  expect(routePrompt({ ...p, text: '/report week' }).kind).toBe('pass')
  expect(routePrompt({ ...p, text: 'write a landing page', command: { name: 'x' } }).kind).toBe('pass')
  expect(routePrompt({ ...p, text: 'describe this screenshot in detail', hasAttachments: true }).kind).toBe('pass')
  expect(routePrompt({ ...p, text: 'also add a footer please', isBusy: true }).kind).toBe('pass')
  expect(routePrompt({ ...p, text: 'write a landing page', originKind: 'plugin' }).kind).toBe('pass') // the deck's own send never loops
})

test('the model replies are read leniently', () => {
  const qs = parseQuestions('Sure!\n```json\n{"questions":[{"q":"Who is it for?","options":["Kids","Adults"]},{"q":"bad","options":["one"]}]}\n```')
  expect(qs).toEqual([{ q: 'Who is it for?', options: ['Kids', 'Adults'] }])
  expect(parseQuestions('{"questions":[]}')).toEqual([])
  expect(parseQuestions('no json here')).toBe(null)
  expect(parseRewrite('{"prompt":"Write a page for [bakery name].","added":["goal","format"]}')).toEqual({
    prompt: 'Write a page for [bakery name].',
    added: ['goal', 'format'],
  })
  expect(parseRewrite('{"prompt":""}')).toBe(null)
})

// ---------------------------------------------------------------- fun and live: pure

test('a typed line opens an address or searches YouTube', () => {
  expect(urlOf('youtube.com')).toBe('https://youtube.com')
  expect(urlOf('https://vnexpress.net/x')).toBe('https://vnexpress.net/x')
  expect(urlOf('localhost:3000')).toBe('http://localhost:3000')
  expect(urlOf('lofi hip hop')).toBe('https://www.youtube.com/results?search_query=lofi%20hip%20hop')
  expect(urlOf('  ')).toBe(null)
  expect(nameOf('https://www.youtube.com/results?search_query=lofi%20hip%20hop')).toBe('YouTube: lofi hip hop')
  const r = pushRecent(pushRecent([], 'https://a.com/'), 'https://b.com/')
  expect(pushRecent(r, 'https://a.com/').map(x => x.url)).toEqual(['https://a.com/', 'https://b.com/'])
})

test('a to-do list becomes the plan, and the agent cap refuses past its limit', () => {
  const items = planFromTodos({
    todos: [
      { content: 'Read the brief', activeForm: 'Reading the brief', status: 'completed' },
      { content: 'Build the page', activeForm: 'Building the page', status: 'in_progress' },
      { content: 'Polish', activeForm: 'Polishing', status: 'pending' },
    ],
  })
  expect(items).toEqual([
    { text: 'Read the brief', status: 'done' },
    { text: 'Building the page', status: 'active' },
    { text: 'Polish', status: 'upcoming' },
  ])
  expect(planFromTodos({})).toBe(null)
  expect(agentCapDeny(0, 50)).toBe(null)
  expect(agentCapDeny(5, 4)).toBe(null)
  expect(agentCapDeny(5, 5)).toContain('agent cap is 5')
})

// ---------------------------------------------------------------- drawing and flows

const NOON_OCT_14 = new Date(2026, 9, 14, 12).getTime()

/** A store in memory the test can read back. */
let mem: Record<string, unknown> = {}

const engine = (on: On) => {
  const clock = mock.clock(on, { now: NOON_OCT_14 })
  mem = {}
  on('store.get', (_$, e) => ({ value: mem[e.key] }))
  on('store.set', (_$, e) => {
    mem[e.key] = e.value
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(mem) }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return clock
}

const pane = (bodyColumns: number) => ({
  plugin: 'haha-deck',
  component: 'Pane' as const,
  requestId: 'haha-deck',
  props: {
    title: 'Haha-deck',
    isFocused: true,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 70 },
    view: {},
  },
})

test('the tabs switch, and each report tab draws its own title and chart', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane(72), surface })
    const seen = async (re: RegExp) => expect((await ui.find({ text: re })) ? re.source : `missing ${re.source} on ${surface}`).toBe(re.source)
    await seen(/HAHA-DECK/)
    await ui.press({ key: 'tab-report' })
    await ui.press({ key: 'range-today' }) // the range is remembered from the last surface
    await seen(/^TODAY$/)
    await seen(/Nothing finished yet today\. Your first finished task shows up here\./)
    await ui.press({ key: 'range-week' })
    await seen(/^THIS WEEK$/)
    await seen(/LAST 7 DAYS/)
    await ui.press({ key: 'range-month' })
    await seen(/^THIS MONTH$/)
    await seen(/LAST 30 DAYS/)
    await ui.press({ key: 'range-year' })
    await seen(/^THIS YEAR$/)
    await seen(/BY MONTH/)
    await ui.press({ key: 'tab-fun' })
    await seen(/^FUN$/)
    await ui.press({ key: 'tab-live' })
    await seen(/HAHA-DECK/)
    await ui.unmount()
  }
})

const answered = (text: string) => ({
  isAnswered: true as const,
  text,
  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
})

test('the full upgrade: /better, questions, rewrite, Run it sends the upgrade once', async ($, on) => {
  const clock = engine(on)
  on('model.complete', (_$, e) =>
    String(e.system).includes('multiple-choice')
      ? { value: answered('{"questions":[{"q":"Who is it for?","options":["Kids","Adults"]}]}') }
      : { value: answered('{"prompt":"Write a landing page for [bakery name] aimed at adults.","added":["audience","format"]}') },
  )
  const sent: string[] = []
  on('prompt.submit', (_$, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  const out = await $.command.run({ command: 'better', args: 'write a landing page for my bakery' } as never)
  expect(out.text).toContain('Upgrading your prompt')
  await clock.settle()
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  expect(await ui.find({ text: /Who is it for\?/ })).toBeDefined()
  expect(await ui.find({ text: /0 of 1 answered/ })).toBeDefined()
  await ui.press({ key: 'q-0-o-1' })
  await clock.settle()
  expect(await ui.find({ text: /Write a landing page for \[bakery name\] aimed at adults\./ })).toBeDefined()
  expect(await ui.find({ text: /2 details added/ })).toBeDefined()
  await ui.press({ key: 'better-run' })
  await clock.settle()
  expect(sent).toEqual(['Write a landing page for [bakery name] aimed at adults.'])
  expect(await ui.find({ text: /Upgrade a prompt/ })).toBeDefined() // back to the prompt bar
  expect(mem['history'] as unknown[]).toHaveLength(1)
  await ui.unmount()
})

test('Cancel puts the original back in the prompt box; a failed call shows the calm error', async ($, on) => {
  const clock = engine(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded_error', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) as never)
  const filled: string[] = []
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)
    return { isFilled: true } as never
  })
  await $.command.run({ command: 'better', args: 'plan my week of meals' } as never)
  await clock.settle()
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  expect(await ui.find({ text: /Your prompt is safe\./ })).toBeDefined()
  expect(await ui.find({ text: /\(529\)/ })).toBeDefined()
  await ui.press({ key: 'better-cancel' })
  expect(filled).toEqual(['plan my week of meals'])
  expect(await ui.find({ text: /Upgrade a prompt/ })).toBeDefined()
  await ui.unmount()
})

test('automatic mode turns on and off, and is remembered', async ($, on) => {
  engine(on)
  expect((await $.command.run({ command: 'better', args: 'on' } as never)).text).toContain('is on')
  expect(mem['isAuto']).toBe(true)
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  expect(await ui.find({ text: /Auto: on/ })).toBeDefined()
  await ui.unmount()
  expect((await $.command.run({ command: 'better', args: 'off' } as never)).text).toContain('is off')
  expect(mem['isAuto']).toBe(false)
})

test('/report settings changes the rate and keeps it', async ($, on) => {
  engine(on)
  expect((await $.command.run({ command: 'report', args: 'settings rate 75' } as never)).text).toContain('$75')
  expect((mem['rates'] as { rate: number }).rate).toBe(75)
  expect((await $.command.run({ command: 'report', args: 'settings' } as never)).text).toContain('$75 per hour')
  expect((await $.command.run({ command: 'report', args: 'fortnight' } as never)).text).toContain('Usage')
})

test('the plan panel fills from TodoWrite in the Live tab', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.turn.start({ text: 'go', turnId: 'P1' })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Read the brief', activeForm: 'Reading the brief', status: 'completed' },
      { content: 'Build the page', activeForm: 'Building the page', status: 'in_progress' },
    ],
  } as never)
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  expect(await ui.find({ text: /^PLAN$/ })).toBeDefined()
  expect(await ui.find({ text: /Building the page/ })).toBeDefined()
  await ui.unmount()
})

test('a request sent with Run it is a typed task: counted, sorted and drawn, wide and narrow', async ($, on) => {
  const clock = engine(on)
  on('model.complete', (_$, e) =>
    String(e.system).includes('multiple-choice')
      ? { value: answered('{"questions":[]}') }
      : { value: answered('{"prompt":"Write the launch plan as a one-page doc.","added":["format"]}') },
  )
  const origins: unknown[] = []
  on('prompt.submit', (_$, e) => {
    origins.push(e.origin)
    return { text: e.text }
  })
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  // A worktree of the repository counts under the repository's own folder name.
  on('session.repo', () => ({ value: { root: '/work/shop-site', remote: null, internal: false } }) as never)
  await $.command.run({ command: 'better', args: 'write the launch plan' } as never)
  await clock.settle()
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  await ui.press({ key: 'better-run' })
  await clock.settle()
  await ui.unmount()
  expect(origins).toEqual([{ kind: 'plugin', name: 'haha-deck', asUser: true }])
  await $.turn.start({ text: 'Write the launch plan as a one-page doc.', turnId: 'R1' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/launch.md', content: 'x' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 'R1', reason: 'answer' })
  // A turn nobody typed (a continuation) is not counted.
  await $.turn.start({ text: '', turnId: 'R2' })
  await $.turn.complete({ answer: 'more', durationMs: 1000, isAborted: false, turnId: 'R2', reason: 'answer' })
  expect(mem['days']).toEqual({ '2026-10-14': { kinds: { documents: 1 }, models: { unknown: 1 }, projects: { 'shop-site': { documents: 1 } } } })

  await $.command.run({ command: 'report', args: 'today' } as never)
  const wide = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  expect(await wide.find({ text: /Documents/ })).toBeDefined()
  expect(await wide.find({ text: /tasks done/ })).toBeDefined()
  expect(await wide.find({ text: /hours saved \(est\.\)/ })).toBeDefined()
  expect(await wide.find({ text: /1-day streak/ })).toBeDefined()
  expect(await wide.find({ text: /BY PROJECT/ })).toBeDefined()
  expect(await wide.find({ text: /^shop-site$/ })).toBeDefined()
  await wide.unmount()
  const narrow = await $.ui.mount({ ...pane(40), surface: 'terminal' })
  expect(await narrow.find({ text: /tasks done/ })).toBeDefined()
  await narrow.unmount()
})

test('in Orca the browser opens in a split; its replies are read leniently', () => {
  expect(splitCommand("https://x.com/?q=it's")).toBe("PIXEL_SKIP_GRAPHICS_CHECK=1 terminal-browser open 'https://x.com/?q=it'\\''s'")
  expect(splitHandleOf('{"ok":true,"result":{"split":{"handle":"term_1"}}}')).toBe('term_1')
  expect(splitHandleOf('{"ok":false}')).toBe(null)
  expect(splitHandleOf('oops')).toBe(null)
  expect(browserKeysOf('{"browsers":[{"key":"1-1"},{"key":"1-2"}]}')).toEqual(['1-1', '1-2'])
  expect(browserKeysOf('')).toEqual([])
})

test('a bookmark in Orca opens a split, then later pages open as tabs in that browser', async ($, on) => {
  engine(on)
  on('env.get', (_$, e) => ({ value: e.name === 'TERM_PROGRAM' ? 'Orca' : e.name === 'ORCA_CLI_BIN_DIR' ? '/orca/bin' : undefined }))
  const runs: string[][] = []
  let browsers: string[] = []
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    runs.push(argv)
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'terminal-browser' && argv[1] === 'ls') return out(JSON.stringify({ browsers: browsers.map(key => ({ key })) }))
    if (argv[1] === 'terminal' && argv[2] === 'split') {
      browsers = [...browsers, 'b-1']
      return out('{"ok":true,"result":{"split":{"handle":"term_9"}}}')
    }
    return out('')
  })
  await $.command.run({ command: 'haha', args: 'fun' } as never)
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  await ui.press({ key: 'fun-mark-0' })
  const split = runs.find(r => r[2] === 'split')
  expect(split?.[0]).toBe('/orca/bin/orca')
  expect(split).toContain("PIXEL_SKIP_GRAPHICS_CHECK=1 terminal-browser open 'https://www.youtube.com/'")
  expect(await ui.find({ text: /Opened youtube\.com/ })).toBeDefined()
  await ui.press({ key: 'fun-mark-2' })
  expect(runs.some(r => r[1] === 'new-tab' && r[2] === 'https://www.google.com/' && r[4] === 'b-1')).toBe(true)
  expect(runs.filter(r => r[2] === 'split').length).toBe(1)
  await ui.press({ key: 'fun-close' })
  expect(runs.some(r => r[2] === 'close' && r[4] === 'term_9')).toBe(true)
  await ui.unmount()
})

test('two sessions add to one report: a task merges with what the store already holds', async ($, on) => {
  const clock = engine(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('model.complete', () => ({ value: answered('{"prompt":"Find three sources on it.","added":[]}') }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  // Outside a repository the project is the session's folder.
  on('session.repo', () => ({ value: null }))
  on('session.root', () => ({ value: '/Users/me/notes/' }))
  // Another session wrote a task earlier today.
  mem['days'] = { '2026-10-14': { kinds: { code: 2 }, models: { 'claude-opus-5-5': 2 } } }
  await $.command.run({ command: 'better', args: 'find sources on it' } as never)
  await clock.settle()
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  await ui.press({ key: 'better-run' })
  await ui.unmount()
  await $.turn.start({ text: 'Find three sources on it.', turnId: 'M1' })
  await $.tool.call({ tool: 'WebSearch', query: 'it' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 'M1', reason: 'answer' })
  expect(mem['days']).toEqual({
    '2026-10-14': { kinds: { code: 2, research: 1 }, models: { 'claude-opus-5-5': 2, unknown: 1 }, projects: { notes: { research: 1 } } },
  })
})

// ---------------------------------------------------------------- live extras

test('the pet reads the session: asleep, at work, waiting on you, stuck, celebrating', () => {
  const base = { isRunning: false, isAsking: false, errorStreak: 0, lastReason: null, sinceEnd: null }
  expect(moodOf(base)).toBe('sleep')
  expect(moodOf({ ...base, isRunning: true })).toBe('work')
  expect(moodOf({ ...base, isRunning: true, isAsking: true })).toBe('wait')
  expect(moodOf({ ...base, isRunning: true, errorStreak: 3 })).toBe('error')
  expect(moodOf({ ...base, lastReason: 'answer', sinceEnd: 5000 })).toBe('party')
  expect(moodOf({ ...base, lastReason: 'answer', sinceEnd: 120_000 })).toBe('sleep')
  expect(moodOf({ ...base, lastReason: 'aborted', sinceEnd: 5000 })).toBe('error')
})

test('activity, files, notes, the guard and effort steps', () => {
  expect([actKindOf('Read'), actKindOf('Edit'), actKindOf('Bash'), actKindOf('WebFetch'), actKindOf('Agent'), actKindOf('mcp__x__y'), actKindOf('TodoWrite')]).toEqual([
    'read', 'edit', 'shell', 'web', 'agent', 'mcp', 'other',
  ])
  expect(pushActivity({ cells: [] }, 'Bash', true).cells).toEqual([{ k: 'shell', isError: true }])
  const f = touchFile(touchFile(touchFile([], '/r/a.ts', 1), '/r/b.ts', 2), '/r/a.ts', 3)
  expect(f.map(x => [x.path, x.edits])).toEqual([['/r/a.ts', 2], ['/r/b.ts', 1]])
  expect([relPath('/r/src/a.ts', '/r'), relPath('/r/src/a.ts', '/r/'), relPath('/x/a.ts', '/r')]).toEqual(['src/a.ts', 'src/a.ts', '/x/a.ts'])
  expect(addNote([], '  call the bank ', 5)[0]?.text).toBe('call the bank')
  expect(addNote([], '   ', 5)).toEqual([])
  const label = (k: string) => (k === 'five_hour' ? '5h' : k)
  expect(guardAlerts({ costAlert: 5, alerted: [] }, { costUsd: 6, limits: [{ kind: 'five_hour', pct: 93 }] }, label).map(a => a.key)).toEqual(['cost', 'limit-five_hour'])
  expect(guardAlerts({ costAlert: 5, alerted: ['cost'] }, { costUsd: 9, limits: [] }, label)).toEqual([])
  expect(guardAlerts({ costAlert: 0, alerted: [] }, { costUsd: 99, limits: [{ kind: 'x', pct: 50 }] }, label)).toEqual([])
  const now = Date.parse('2026-10-14T05:00:00Z')
  expect([untilReset('2026-10-14T06:12:00Z', now), untilReset('2026-10-14T05:45:00Z', now), untilReset('2026-10-17T09:00:00Z', now), untilReset('2026-10-14T04:00:00Z', now), untilReset(undefined, now)]).toEqual([
    '1h12m', '45m', '3d4h', null, null,
  ])
  expect([stepEffort('medium', 1), stepEffort('low', -1), stepEffort('max', 1), stepEffort('', 1)]).toEqual(['high', null, null, null])
})

test('Live shows the pet, the activity strip, files touched and notes', async ($, on) => {
  engine(on)
  on('tool.call', (_$, e) => (e.tool === 'Bash' ? { result: {}, text: 'boom', isError: true } : { result: {}, text: 'ok' }) as never)
  on('session.root', () => ({ value: '/work/site' }))
  await $.turn.start({ text: 'go', turnId: 'L1' })
  await $.tool.call({ tool: 'Read', file_path: '/work/site/a.ts' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/site/src/app.ts', old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/site/src/app.ts', old_string: 'b', new_string: 'c' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  expect(await ui.find({ text: /ACTIVITY · 4 CALLS/ })).toBeDefined()
  expect(await ui.find({ text: / edit 2/ })).toBeDefined()
  expect(await ui.find({ text: /FILES TOUCHED · 1/ })).toBeDefined()
  expect(await ui.find({ text: / 2× / })).toBeDefined()
  expect(await ui.find({ text: /on it/ })).toBeDefined() // the turn is still running
  await ui.input({ key: 'note-input', text: 'ask about the invoice' })
  expect(await ui.find({ text: /ask about the invoice/ })).toBeDefined()
  expect(mem['notes'] as unknown[]).toHaveLength(1)
  await ui.unmount()
})

test('quick actions report what happened; the cost alert is said once', async ($, on) => {
  engine(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const commands: string[] = []
  on('command.run', (_$, e) => {
    commands.push(`/${e.command} ${e.args}`)
    return { text: `Set effort to ${e.args}` }
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }) as never)
  expect((await $.command.run({ command: 'haha', args: 'alert 5' } as never)).text).toContain('$5')
  const measure = (usd: number) =>
    $.session.measure({ context: { window: 200_000, tokens: 1000, percent: 1 }, rateLimits: [], cost: { usd }, changed: ['cost'] } as never)
  await measure(4)
  await measure(6)
  await measure(7)
  expect(toasts.filter(x => x.includes('past your $5 alert'))).toHaveLength(1)
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  expect(await ui.find({ text: /\$7\.00\/\$5\.00/ })).toBeDefined()
  await ui.press({ key: 'act-effort-up' })
  expect(await ui.find({ text: /Effort is not known until the first request\./ })).toBeDefined()
  await $.turn.start({ text: 'go', turnId: 'Q1' })
  for await (const _ of $.turn.step({ turnId: 'Q1', index: 0, model: 'claude-opus-5-5', effort: 'high' } as never)) void _
  await ui.press({ key: 'act-effort-up' })
  expect(commands).toEqual(['/effort xhigh'])
  expect(await ui.find({ text: /Set effort to xhigh/ })).toBeDefined()
  await ui.unmount()
})

test('Clawd is 14 × 10 pixels in every mood, packed two to a cell', () => {
  for (const mood of ['sleep', 'work', 'wait', 'error', 'party'] as const) {
    for (let p = 0; p < frameCount(mood); p++) {
      const sprite = spriteOf(mood, p)
      expect(sprite.length).toBe(CLAWD_ROWS * 2)
      expect(sprite.every(row => row.length === 14)).toBe(true)
    }
    // 3 little-endian u32 words per cell, base64: 4 characters per 3 bytes.
    expect(frameCells(mood, 0).length).toBe(Math.ceil((CLAWD_COLS * CLAWD_ROWS * 12) / 3) * 4)
  }
  expect(frameCount('work')).toBeGreaterThan(1)
  expect(frameCount('sleep')).toBe(1)
  expect(frameCells('work', 0)).not.toBe(frameCells('work', 1))
  // At work Clawd walks to the right edge and back, looking the way it goes.
  const xs = Array.from({ length: frameCount('work') }, (_, i) => positionOf('work', i))
  expect(Math.min(...xs)).toBe(0)
  expect(Math.max(...xs)).toBe(CLAWD_COLS - 14)
  expect(positionOf('work', frameCount('work'))).toBe(positionOf('work', 0))
  expect(spriteOf('work', 1)[4]?.indexOf('k')).toBe(5) // walking right: eyes to the right
  expect(spriteOf('work', frameCount('work') / 2 + 1)[4]?.indexOf('k')).toBe(3) // walking back: eyes to the left
  expect(positionOf('sleep')).toBe(6) // resting in the middle
})

test('the terminal draws Clawd as a Raster in the Live tab', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  expect(JSON.stringify(await ui.drawn())).toContain('"type":"Raster"')
  expect(await ui.find({ text: /Clawd · napping/ })).toBeDefined()
  await ui.unmount()
})

test('with agents running, everyone is small, coloured by model, and fits the same frame', () => {
  const count = (rows: string[], ch: string) => rows.join('').split(ch).length - 1
  const haikus = (n: number) => Array.from({ length: n }, () => 'claude-haiku-5-5')
  // Main Clawd plus helpers, never past the frame: the main one alone wears the gold spark.
  for (const n of [1, 3, 5, 9]) {
    const rows = crewSpriteOf('work', haikus(n), 0, 'claude-opus-5-5')
    expect(rows.length).toBe(CLAWD_ROWS * 2)
    expect(rows.every(r => r.length === CLAWD_COLS)).toBe(true)
    expect(count(rows, 'y')).toBe(1)
    expect(count(rows, 'k')).toBe(2 * (Math.min(n, CREW_MAX) + 1)) // two eyes each
  }
  // Opus is clay (o), Haiku green (h), Sonnet blue (s), anything else grey (g).
  const mixed = crewSpriteOf('work', ['claude-haiku-5-5', 'claude-sonnet-5-5', 'glm-5'], 0, 'claude-opus-5-5').join('')
  expect(['o', 'h', 's', 'g'].every(ch => mixed.includes(ch))).toBe(true)
  expect(spriteOf('work').join('')).toContain('o')
  expect(frameCells('work', 0, 'claude-sonnet-5-5')).not.toBe(frameCells('work', 0, 'claude-opus-5-5'))
  expect(familiesIn(['claude-opus-5-5', 'claude-haiku-5-5', 'claude-haiku-4-5'])).toEqual(['opus', 'haiku'])
  expect(familyOf('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('sonnet')
  expect(count(crewSpriteOf('error', haikus(2), 0), 'r')).toBe(1)
  for (let p = 0; p < 12; p++) for (let i = 0; i < 6; i++) expect(crewPositionOf(i, p) >= 0 && crewPositionOf(i, p) <= 3).toBe(true)
  // One Raster serves both scenes: same size either way.
  expect(sceneCells('work', haikus(3), 0).length).toBe(sceneCells('work', [], 0).length)
  expect(sceneCells('work', [], 2, 'claude-opus-5-5')).toBe(frameCells('work', 2, 'claude-opus-5-5'))
})

test('spawned agents join the main Clawd in its frame', async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: `c${++n}` }))
  await $.turn.start({ text: 'go', turnId: 'C1' })
  const spawn = (d: string) => ({ prompt: d, description: d, subagentType: 'Explore', tool_use_id: `tc${d}`, provider: { plugin: 'engine', tier: 'core' as const }, parentModel: 'claude-opus-5-5', background: true, fork: false })
  await $.agent.spawn(spawn('one'))
  await $.agent.spawn(spawn('two'))
  const ui = await $.ui.mount({ ...pane(72), surface: 'terminal' })
  expect(await ui.find({ text: /\+ 2 helpers at work/ })).toBeDefined()
  expect(JSON.stringify(await ui.drawn()).match(/"type":"Raster"/g)?.length).toBe(1) // one frame for the whole crew
  expect(await ui.find({ text: / Haiku / })).toBeDefined() // the legend names the agents' model
  await ui.unmount()
})

test('an agent silent for ten minutes is taken as stuck and leaves the crew', () => {
  const c = { ...normalizeCard({}), id: 'a', status: 'running', spawnedAt: 1000 }
  expect(isStaleCard(c, 1000 + STALE_MS - 1)).toBe(false)
  expect(isStaleCard(c, 1000 + STALE_MS + 1)).toBe(true)
  expect(isStaleCard({ ...c, lastAt: 1000 + STALE_MS }, 1000 + STALE_MS + 1)).toBe(false) // heard from lately
  expect(isStaleCard({ ...c, status: 'done' }, 10 * STALE_MS)).toBe(false)
  expect(workingCards([c, { ...c, id: 'b', lastAt: 9 * STALE_MS }], 10 * STALE_MS).map(x => x.id)).toEqual(['b'])
})
