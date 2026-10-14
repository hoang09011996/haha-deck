// Drawings for the Haha-deck tabs. Each function takes the surface's elements, plain data and the
// handlers the hooks module made; nothing here calls `$`, reads state or changes anything.
import type { ActKind, Activity, BetterEntry, BetterFlow, Bookmark, Days, Explain, FileTouch, Fun, Kind, Mood, Note, Plan, Range, Rates, Tab } from '../types'
import { PET, activityCounts } from './live'
import { FAMILY_HEX, FAMILY_LABEL } from './clawd'
import type { Family } from './clawd'
import { TRACK, answeredCount, trackIndex, wordCount } from './better'
import {
  KINDS,
  KIND_LABEL,
  RANGE_TITLE,
  barCells,
  chartBars,
  fmtHours,
  fmtMoney,
  hoursOf,
  rangeDates,
  rangeKeys,
  sumDays,
  summaryLine,
} from './report'
import { HAHA, bigRows, bigWidth, rule } from './theme'
import { prettyModel, shorten } from './core'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Els = { Box: any; Text: any; Button: any; Input?: any }

const KIND_COLOR: Record<Kind, string> = {
  code: HAHA.blue,
  documents: HAHA.teal,
  research: HAHA.violet,
  images: HAHA.amber,
  emails: HAHA.green,
  other: HAHA.muted,
}

// ---------------------------------------------------------------- shared pieces

/** A bold capital title with its gold rule and the hairline to the edge. */
export const Title = (E: Els, title: string, width: number, right?: string) => {
  const { Box, Text } = E
  const r = rule(title.length, width)
  return (
    <Box flexDirection="column" width={width}>
      <Box justifyContent="space-between" width={width}>
        <Text color={HAHA.text} bold wrap="truncate">
          {title}
        </Text>
        {right ? (
          <Text color={HAHA.muted} wrap="truncate">
            {right}
          </Text>
        ) : null}
      </Box>
      <Text wrap="truncate">
        <Text color={HAHA.gold}>{r.gold}</Text>
        <Text color={HAHA.slate}>{r.hair}</Text>
      </Text>
    </Box>
  )
}

/** A small muted capital heading followed by a hairline. */
export const Heading = (E: Els, title: string, width: number) => {
  const { Text } = E
  const label = title.toUpperCase()
  return (
    <Text wrap="truncate">
      <Text color={HAHA.muted}>{label} </Text>
      <Text color={HAHA.slate}>{'─'.repeat(Math.max(0, width - label.length - 1))}</Text>
    </Text>
  )
}

/** A chip: gold with dark bold text when chosen or primary, slate with light text otherwise. */
export const Chip = (
  E: Els,
  o: { key: string; label: string; isOn?: boolean; hotkey?: string; onPress: () => void },
) => {
  const { Button, Text } = E
  return (
    <Button key={o.key} plain hotkey={o.hotkey} onPress={o.onPress}>
      <Text backgroundColor={o.isOn ? HAHA.gold : HAHA.slate} color={o.isOn ? HAHA.ink : HAHA.text} bold={o.isOn}>
        {` ${o.label} `}
      </Text>
    </Button>
  )
}

/** Plain muted text that presses, for Cancel and Skip. */
export const Quiet = (E: Els, o: { key: string; label: string; hotkey?: string; onPress: () => void }) => {
  const { Button, Text } = E
  return (
    <Button key={o.key} plain hotkey={o.hotkey} onPress={o.onPress}>
      <Text color={HAHA.muted}>{o.label}</Text>
    </Button>
  )
}

// ---------------------------------------------------------------- tab bar

export const TabBar = (E: Els, tab: Tab, width: number, onTab: (t: Tab) => void) => {
  const { Box } = E
  const tabs: [Tab, string, string][] = [
    ['live', 'LIVE', 'l'],
    ['report', 'REPORT', 'r'],
    ['fun', 'FUN', 'b'],
  ]
  return (
    <Box flexDirection="column" width={width}>
      <Box columnGap={1} width={width}>
        {tabs.map(([t, label, key]) =>
          Chip(E, { key: `tab-${t}`, label, hotkey: key, isOn: tab === t, onPress: () => onTab(t) }),
        )}
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------- report

const RANGES: [Range, string, string][] = [
  ['today', 'Today', 't'],
  ['week', 'Week', 'w'],
  ['month', 'Month', 'm'],
  ['year', 'Year', 'y'],
]

const EMPTY_TEXT: Record<Range, string> = {
  today: 'Nothing finished yet today. Your first finished task shows up here.',
  week: 'Nothing finished yet this week. Your first finished task shows up here.',
  month: 'Nothing finished in the last 30 days. Your first finished task shows up here.',
  year: 'Nothing finished yet this year. Your first finished task shows up here.',
}

/** How many tiles sit side by side: three, then two, then one as the pane narrows. */
export const tilesPerRow = (width: number) => (width >= 60 ? 3 : width >= 40 ? 2 : 1)

const Tile = (E: Els, o: { key: string; value: string; label: string; color: string; width: number }) => {
  const { Box, Text } = E
  const inner = o.width - 4
  const big = bigWidth(o.value) <= inner ? bigRows(o.value) : null
  return (
    <Box key={o.key} flexDirection="column" borderStyle="round" borderColor={HAHA.slate} paddingX={1} width={o.width}>
      {big ? (
        big.map(row => (
          <Text color={o.color} wrap="truncate">
            {row}
          </Text>
        ))
      ) : (
        <Box flexDirection="column">
          <Text> </Text>
          <Text color={o.color} bold wrap="truncate">
            {o.value}
          </Text>
          <Text> </Text>
        </Box>
      )}
      <Text color={HAHA.muted} wrap="truncate">
        {o.label}
      </Text>
    </Box>
  )
}

const bar = (n: number, max: number, width: number) => {
  const on = max > 0 ? Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width)) : 0
  return { on: '━'.repeat(on), off: '─'.repeat(Math.max(0, width - on)) }
}

export const ReportView = (
  E: Els,
  o: { days: Days; rates: Rates; range: Range; today: string; width: number; onRange: (r: Range) => void },
) => {
  const { Box, Text } = E
  const W = o.width
  const keys = rangeKeys(o.range, o.today)
  const sum = sumDays(o.days, keys)
  const hours = hoursOf(sum.kinds, o.rates)
  const dollars = hours * o.rates.rate

  const per = tilesPerRow(W)
  const tileW = Math.floor((W - (per - 1)) / per)
  const tiles = [
    { key: 'tile-hours', value: fmtHours(hours), label: 'hours saved (est.)', color: HAHA.gold },
    { key: 'tile-tasks', value: String(sum.total), label: 'tasks done', color: HAHA.text },
    { key: 'tile-worth', value: fmtMoney(dollars), label: `worth at $${o.rates.rate}/h (est.)`, color: HAHA.green },
  ]
  const tileRows: (typeof tiles)[] = []
  for (let i = 0; i < tiles.length; i += per) tileRows.push(tiles.slice(i, i + per))

  const chips = (
    <Box columnGap={1} width={W}>
      {RANGES.map(([r, label, key]) =>
        Chip(E, { key: `range-${r}`, label, hotkey: key, isOn: o.range === r, onPress: () => o.onRange(r) }),
      )}
    </Box>
  )
  const title = Title(E, RANGE_TITLE[o.range], W, rangeDates(o.range, o.today))

  if (sum.total === 0) {
    return (
      <Box flexDirection="column" width={W} rowGap={1}>
        {chips}
        {title}
        <Text color={HAHA.muted} wrap="wrap">
          {EMPTY_TEXT[o.range]}
        </Text>
        {chart(E, o.range, o.days, o.today, W)}
      </Box>
    )
  }

  // Where the time went: one row per kind that has tasks.
  const kindsShown = KINDS.filter(k => sum.kinds[k] > 0)
  const maxKind = Math.max(1, ...kindsShown.map(k => sum.kinds[k]))
  const labelW = 17
  const tailW = 14
  const barW = Math.max(4, W - labelW - tailW - 1)
  const models = sum.models.slice(0, 5)
  // Projects by the time they saved, the biggest first.
  const projects = [...sum.projects].sort((a, b) => hoursOf(b.kinds, o.rates) - hoursOf(a.kinds, o.rates))
  const maxProject = Math.max(0.001, ...projects.map(p => hoursOf(p.kinds, o.rates)))
  const maxModel = Math.max(1, ...models.map(m => m[1]))

  return (
    <Box flexDirection="column" width={W}>
      {chips}
      <Text> </Text>
      {title}
      {tileRows.map((row, i) => (
        <Box key={`tiles-${i}`} columnGap={1} width={W}>
          {row.map(t => Tile(E, { ...t, width: tileW }))}
        </Box>
      ))}
      <Text> </Text>
      {Heading(E, 'Where the time went', W)}
      {kindsShown.map(k => {
        const b = bar(sum.kinds[k], maxKind, barW)
        const kindHours = (sum.kinds[k] * o.rates.minutes[k]) / 60
        return (
          <Box key={`kind-${k}`} width={W}>
            <Box width={labelW} flexShrink={0}>
              <Text color={HAHA.text} wrap="truncate">
                {KIND_LABEL[k]}
              </Text>
            </Box>
            <Text color={KIND_COLOR[k]}>{b.on}</Text>
            <Text color={HAHA.slate}>{b.off}</Text>
            <Text color={HAHA.muted}>{` ${String(sum.kinds[k]).padStart(4)}  ${fmtHours(kindHours).padStart(5)}h`}</Text>
          </Box>
        )
      })}
      <Text> </Text>
      {projects.length > 0 ? Heading(E, 'By project', W) : null}
      {projects.slice(0, 6).map(p => {
        const ph = hoursOf(p.kinds, o.rates)
        const b = bar(ph, maxProject, barW)
        return (
          <Box key={`project-${p.name}`} width={W}>
            <Box width={labelW} flexShrink={0}>
              <Text color={HAHA.text} wrap="truncate">
                {p.name}
              </Text>
            </Box>
            <Text color={HAHA.gold}>{b.on}</Text>
            <Text color={HAHA.slate}>{b.off}</Text>
            <Text color={HAHA.muted}>{` ${String(p.count).padStart(4)}  ${fmtHours(ph).padStart(5)}h`}</Text>
          </Box>
        )
      })}
      {projects.length > 6 ? (
        <Text color={HAHA.muted} wrap="truncate">{`+${projects.length - 6} more projects`}</Text>
      ) : null}
      {projects.length > 0 ? <Text> </Text> : null}
      {Heading(E, 'Who did the work', W)}
      {models.map(([m, n]) => {
        const b = bar(n, maxModel, barW + 7)
        return (
          <Box key={`model-${m}`} width={W}>
            <Box width={labelW} flexShrink={0}>
              <Text color={HAHA.text} wrap="truncate">
                {prettyModel(m)}
              </Text>
            </Box>
            <Text color={HAHA.blue}>{b.on}</Text>
            <Text color={HAHA.slate}>{b.off}</Text>
            <Text color={HAHA.muted}>{` ${String(n).padStart(5)}`}</Text>
          </Box>
        )
      })}
      <Text> </Text>
      {chart(E, o.range, o.days, o.today, W)}
    </Box>
  )
}

/** Three rows of bars, a row of labels and the summary line. */
const chart = (E: Els, range: Range, days: Days, today: string, W: number) => {
  const { Box, Text } = E
  const bars = chartBars(range, days, today)
  const slot = Math.max(1, Math.floor(W / bars.length))
  const barW = range === 'month' ? Math.max(1, slot - 1) : Math.max(1, Math.min(4, slot - 1))
  const max = Math.max(1, ...bars.map(b => b.value))
  const cells = bars.map(b => barCells(b.value, max))
  const colorOf = (i: number) => (bars[i]?.isCurrent ? HAHA.gold : HAHA.muted)
  const pad = (s: string) => s + ' '.repeat(Math.max(0, slot - s.length))
  const heading = range === 'year' ? 'By month' : range === 'month' ? 'Last 30 days' : 'Last 7 days'
  return (
    <Box flexDirection="column" width={W}>
      {Heading(E, heading, W)}
      {[0, 1, 2].map(r => (
        <Text key={`chart-row-${r}`} wrap="truncate">
          {cells.map((c, i) => (
            <Text color={colorOf(i)}>{pad((bars[i]?.isFuture ? ' ' : (c[r] ?? ' ')).repeat(barW))}</Text>
          ))}
        </Text>
      ))}
      <Text wrap="truncate">
        {bars.map((b, i) => {
          const showLabel = range !== 'month' || i % 5 === 4 || b.isCurrent
          const label = showLabel ? b.label.slice(0, Math.max(1, slot)) : ''
          return <Text color={b.isCurrent ? HAHA.gold : b.isFuture ? HAHA.slate : HAHA.muted}>{pad(label).slice(0, slot)}</Text>
        })}
      </Text>
      <Text color={HAHA.text} wrap="truncate">
        {summaryLine(range, days, today)}
      </Text>
    </Box>
  )
}

// ---------------------------------------------------------------- live: plan and explain

export const PlanPanel = (E: Els, plan: Plan, width: number) => {
  const { Box, Text } = E
  if (plan.items.length === 0) return null
  const done = plan.items.filter(i => i.status === 'done').length
  const g = bar(done, plan.items.length, 10)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={HAHA.slate} paddingX={1} width={width}>
      <Box justifyContent="space-between">
        <Text color={HAHA.text} bold>
          PLAN
        </Text>
        <Text>
          <Text color={HAHA.green}>{g.on}</Text>
          <Text color={HAHA.slate}>{g.off}</Text>
          <Text color={HAHA.muted}>{` ${done}/${plan.items.length}`}</Text>
        </Text>
      </Box>
      {plan.items.map(i => (
        <Text wrap="truncate">
          <Text color={i.status === 'done' ? HAHA.green : i.status === 'active' ? HAHA.gold : HAHA.muted}>
            {i.status === 'done' ? '✓ ' : i.status === 'active' ? '▶ ' : '○ '}
          </Text>
          <Text color={i.status === 'active' ? HAHA.text : HAHA.muted} bold={i.status === 'active'}>
            {i.text}
          </Text>
        </Text>
      ))}
    </Box>
  )
}

export const ExplainPanel = (E: Els, ex: Explain, width: number, canExplain: boolean, onExplain: () => void) => {
  const { Box, Text } = E
  return (
    <Box flexDirection="column" width={width}>
      <Box columnGap={1}>
        {canExplain && !ex.isLoading ? Chip(E, { key: 'explain', label: 'Explain last turn', onPress: onExplain }) : null}
        {ex.isLoading ? <Text color={HAHA.muted}>Explaining the last turn…</Text> : null}
      </Box>
      {ex.text && !ex.isLoading ? (
        <Box borderStyle="round" borderColor={HAHA.slate} paddingX={1} width={width}>
          <Text color={HAHA.text} wrap="wrap">
            {ex.text}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}

// ---------------------------------------------------------------- live: prompt upgrade

export type BetterHandlers = {
  start: (text: string) => void
  answer: (i: number, value: string) => void
  skip: (i: number) => void
  other: (i: number) => void
  skipRest: () => void
  run: (text: string) => void
  edit: () => void
  copy: () => void
  cancel: () => void
  retry: () => void
  sendOriginal: () => void
  toggleAuto: () => void
  toggleHistory: () => void
  reopen: (entry: BetterEntry) => void
}

const Tracker = (E: Els, f: BetterFlow, width: number) => {
  const { Text } = E
  const at = trackIndex(f)
  return (
    <Text wrap="truncate">
      {TRACK.map((label, i) => {
        const isDone = i < at
        const isNow = i === at
        const color = isDone ? HAHA.green : isNow ? HAHA.gold : HAHA.muted
        return (
          <Text>
            <Text color={color} bold={isNow}>{`${isDone ? '✓' : isNow ? '●' : '○'} ${label}`}</Text>
            {i < TRACK.length - 1 ? <Text color={HAHA.slate}>{width >= 60 ? ' ─── ' : ' ─ '}</Text> : null}
          </Text>
        )
      })}
    </Text>
  )
}

const Card = (E: Els, o: { title: string; text: string; color: string; width: number; key: string; maxLines?: number }) => {
  const { Box, Text } = E
  const text = o.maxLines ? shorten(o.text, o.maxLines * Math.max(10, o.width - 4)) : o.text
  return (
    <Box key={o.key} flexDirection="column" borderStyle="round" borderColor={o.color} paddingX={1} width={o.width}>
      <Text color={HAHA.muted}>{o.title.toUpperCase()}</Text>
      <Text color={HAHA.text} wrap="wrap">
        {text}
      </Text>
    </Box>
  )
}

/** The one-line prompt bar Live shows while no upgrade runs. */
export const BetterBar = (E: Els, o: { isAuto: boolean; historyCount: number; width: number; on: BetterHandlers }) => {
  const { Box, Text } = E
  return (
    <Box columnGap={1} width={o.width}>
      <Text color={HAHA.muted}>PROMPT</Text>
      {Chip(E, { key: 'better-new', label: 'Upgrade a prompt', onPress: () => o.on.start('') })}
      {Chip(E, { key: 'better-auto', label: o.isAuto ? 'Auto: on' : 'Auto: off', isOn: o.isAuto, hotkey: 'a', onPress: o.on.toggleAuto })}
      {o.historyCount > 0
        ? Chip(E, { key: 'better-history', label: `History ${o.historyCount}`, hotkey: 'h', onPress: o.on.toggleHistory })
        : null}
    </Box>
  )
}

export const BetterHistory = (E: Els, o: { history: BetterEntry[]; width: number; on: BetterHandlers; fmtTime: (ms: number) => string }) => {
  const { Box, Button, Text } = E
  return (
    <Box flexDirection="column" width={o.width}>
      {Title(E, 'PROMPT HISTORY', o.width, `${o.history.length} of 20`)}
      {o.history.length === 0 ? <Text color={HAHA.muted}>No upgrades yet.</Text> : null}
      {[...o.history].reverse().map(entry => (
        <Button key={`hist-${entry.id}`} plain onPress={() => o.on.reopen(entry)}>
          <Text color={HAHA.muted}>{`${o.fmtTime(entry.at)}  `}</Text>
          <Text color={HAHA.text}>{shorten(entry.original.replace(/\s+/g, ' '), Math.max(10, o.width - 8))}</Text>
        </Button>
      ))}
      {Quiet(E, { key: 'hist-close', label: 'Close', onPress: o.on.toggleHistory })}
    </Box>
  )
}

export const BetterView = (E: Els, o: { flow: BetterFlow; width: number; on: BetterHandlers }) => {
  const { Box, Text, Input } = E
  const f = o.flow
  const W = o.width
  const head = (
    <Box flexDirection="column" width={W}>
      {Title(E, 'PROMPT UPGRADE', W)}
      {Tracker(E, f, W)}
      <Text> </Text>
    </Box>
  )

  if (f.step === 'input') {
    return (
      <Box flexDirection="column" width={W}>
        {head}
        {Input ? (
          <Input key="better-input" autoFocus placeholder="Type a rough prompt, then Enter" submitLabel="Upgrade" onSubmit={(v: string) => o.on.start(v)} />
        ) : (
          <Text color={HAHA.muted}>Type /better followed by your prompt.</Text>
        )}
        {Quiet(E, { key: 'better-cancel', label: 'Cancel', onPress: o.on.cancel })}
      </Box>
    )
  }

  if (f.step === 'asking' || f.step === 'rewriting') {
    return (
      <Box flexDirection="column" width={W}>
        {head}
        {Card(E, { key: 'better-orig', title: 'Your prompt', text: f.original, color: HAHA.slate, width: W, maxLines: 6 })}
        <Text color={HAHA.muted}>
          {f.step === 'asking' ? 'Reading your prompt and picking the questions that matter…' : 'Writing the upgraded prompt…'}
        </Text>
        {Quiet(E, { key: 'better-cancel', label: 'Cancel', onPress: o.on.cancel })}
      </Box>
    )
  }

  if (f.step === 'error') {
    return (
      <Box flexDirection="column" width={W}>
        {head}
        <Box flexDirection="column" borderStyle="round" borderColor={HAHA.amber} paddingX={1} width={W}>
          <Text color={HAHA.amber} bold>
            The model did not answer. Your prompt is safe.
          </Text>
          {f.error ? (
            <Text color={HAHA.muted} wrap="truncate">
              {f.error}
            </Text>
          ) : null}
        </Box>
        <Box columnGap={1}>
          {Chip(E, { key: 'better-retry', label: 'Try again', isOn: true, onPress: o.on.retry })}
          {Chip(E, { key: 'better-send-orig', label: 'Send my original', onPress: o.on.sendOriginal })}
          {Quiet(E, { key: 'better-cancel', label: 'Cancel', onPress: o.on.cancel })}
        </Box>
      </Box>
    )
  }

  if (f.step === 'questions') {
    const n = answeredCount(f)
    return (
      <Box flexDirection="column" width={W}>
        {head}
        {f.questions.map((q, i) => {
          const a = f.answers[i]
          const isAnswered = typeof a === 'string'
          return (
            <Box key={`q-${i}`} flexDirection="column" width={W}>
              <Text wrap="wrap">
                {isAnswered ? (
                  <Text color={HAHA.green} bold>
                    {' ✓ '}
                  </Text>
                ) : (
                  <Text backgroundColor={HAHA.gold} color={HAHA.ink} bold>
                    {` ${i + 1} `}
                  </Text>
                )}
                <Text color={isAnswered ? HAHA.muted : HAHA.text}>{` ${q.q}`}</Text>
              </Text>
              <Box columnGap={1} flexWrap="wrap" width={W}>
                {q.options.map((opt, j) =>
                  Chip(E, { key: `q-${i}-o-${j}`, label: opt, isOn: a === opt, onPress: () => o.on.answer(i, opt) }),
                )}
                {Chip(E, { key: `q-${i}-other`, label: 'Other (type it)', isOn: isAnswered && a !== '' && !q.options.includes(a), onPress: () => o.on.other(i) })}
                {Quiet(E, { key: `q-${i}-skip`, label: a === '' ? 'Skipped' : 'Skip', onPress: () => o.on.skip(i) })}
              </Box>
              {f.otherFor === i && Input ? (
                <Input key={`q-${i}-input`} autoFocus placeholder="Your answer, then Enter" onSubmit={(v: string) => o.on.answer(i, v.trim())} />
              ) : null}
              <Text> </Text>
            </Box>
          )
        })}
        <Box columnGap={1}>
          <Text color={HAHA.muted}>{`${n} of ${f.questions.length} answered`}</Text>
          {Chip(E, { key: 'better-skip-rest', label: 'Skip the rest, upgrade now', isOn: true, onPress: o.on.skipRest })}
          {Quiet(E, { key: 'better-cancel', label: 'Cancel', onPress: o.on.cancel })}
        </Box>
      </Box>
    )
  }

  // review
  const before = wordCount(f.original)
  const after = wordCount(f.rewrite)
  const isSide = W >= 60
  const cardW = isSide ? Math.floor((W - 1) / 2) : W
  return (
    <Box flexDirection="column" width={W}>
      {head}
      <Text wrap="truncate">
        <Text color={HAHA.muted}>words </Text>
        <Text color={HAHA.text}>{before}</Text>
        <Text color={HAHA.muted}> → </Text>
        <Text color={HAHA.green} bold>
          {after}
        </Text>
        <Text color={HAHA.muted}>{`   ·   ${f.added.length} details added`}</Text>
      </Text>
      <Box columnGap={1}>
        {Chip(E, { key: 'better-run', label: 'Run it', hotkey: 'g', isOn: true, onPress: () => o.on.run(f.rewrite) })}
        {Chip(E, { key: 'better-edit', label: 'Edit', hotkey: 'e', onPress: o.on.edit })}
        {Chip(E, { key: 'better-copy', label: 'Copy', hotkey: 'c', onPress: o.on.copy })}
        {Quiet(E, { key: 'better-cancel', label: 'Cancel', hotkey: 'x', onPress: o.on.cancel })}
      </Box>
      {f.isEditing && Input ? (
        <Input key="better-edit-input" autoFocus value={f.rewrite} submitLabel="Run" onSubmit={(v: string) => o.on.run(v)} />
      ) : null}
      <Text> </Text>
      {f.added.length > 0 ? Heading(E, 'What I added', W) : null}
      {f.added.map(a => (
        <Text wrap="truncate">
          <Text color={HAHA.green}>+ </Text>
          <Text color={HAHA.text}>{a}</Text>
        </Text>
      ))}
      <Text> </Text>
      <Box columnGap={1} flexDirection={isSide ? 'row' : 'column'} width={W}>
        {Card(E, { key: 'better-card-orig', title: 'Your prompt', text: f.original, color: HAHA.slate, width: cardW })}
        {Card(E, { key: 'better-card-new', title: 'Upgrade', text: f.rewrite, color: HAHA.gold, width: cardW })}
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------- fun

export const FunView = (
  E: Els,
  o: {
    fun: Fun
    width: number
    hasBrowser: boolean
    open: (url: string) => void
    openLine: (line: string) => void
    close: () => void
    save: (b: Bookmark) => void
    remove: (url: string) => void
  },
) => {
  const { Box, Text, Input } = E
  const W = o.width
  return (
    <Box flexDirection="column" width={W}>
      {Title(E, 'FUN', W, 'a browser beside your session')}
      {!o.hasBrowser ? (
        <Box flexDirection="column" borderStyle="round" borderColor={HAHA.amber} paddingX={1} width={W}>
          <Text color={HAHA.amber} bold>
            The browser plugin is not loaded.
          </Text>
          <Text color={HAHA.muted} wrap="wrap">
            Install it once: /plugin marketplace add zenbu-labs/terminal-browser, /plugin install terminal-browser@terminal-browser, then /reload-plugins.
          </Text>
        </Box>
      ) : null}
      {Input ? (
        <Input key="fun-url" placeholder="Address, or words to search on YouTube" submitLabel="Open" onSubmit={(v: string) => o.openLine(v)} />
      ) : null}
      {o.fun.status ? (
        <Text color={HAHA.muted} wrap="truncate">
          {o.fun.status}
        </Text>
      ) : null}
      <Text> </Text>
      {Heading(E, 'Bookmarks', W)}
      <Box columnGap={1} rowGap={0} flexWrap="wrap" width={W}>
        {o.fun.bookmarks.map((b, i) =>
          Chip(E, { key: `fun-mark-${i}`, label: b.name, hotkey: i < 9 ? String(i + 1) : undefined, isOn: i === 0, onPress: () => o.open(b.url) }),
        )}
      </Box>
      <Text> </Text>
      {o.fun.recent.length > 0 ? Heading(E, 'Recent', W) : null}
      {o.fun.recent.map((b, i) => {
        const isSaved = o.fun.bookmarks.some(x => x.url === b.url)
        return (
          <Box key={`fun-recent-${i}`} columnGap={1} width={W}>
            {Quiet(E, { key: `fun-recent-open-${i}`, label: '›', onPress: () => o.open(b.url) })}
            <Box width={Math.max(10, W - 12)}>
              <Text color={HAHA.text} wrap="truncate">
                {b.name}
              </Text>
            </Box>
            {isSaved
              ? Quiet(E, { key: `fun-recent-unsave-${i}`, label: 'saved', onPress: () => o.remove(b.url) })
              : Quiet(E, { key: `fun-recent-save-${i}`, label: '+ save', onPress: () => o.save(b) })}
          </Box>
        )
      })}
      <Text> </Text>
      <Box columnGap={1}>{o.hasBrowser ? Chip(E, { key: 'fun-close', label: 'Close browser', onPress: o.close }) : null}</Box>
    </Box>
  )
}

// ---------------------------------------------------------------- live extras

const ACT_COLOR: Record<ActKind, string> = {
  read: HAHA.blue,
  edit: HAHA.gold,
  shell: HAHA.violet,
  web: HAHA.teal,
  agent: HAHA.green,
  mcp: HAHA.amber,
  other: HAHA.muted,
}

const MOOD_COLOR: Record<Mood, string> = {
  sleep: HAHA.muted,
  work: HAHA.gold,
  wait: HAHA.amber,
  error: HAHA.red,
  party: HAHA.green,
}

/** The pet, what it is up to, and today's tally beside it. */
/** Clawd (`animated`: the hooks module's pixel Clawd, where the surface draws one), its mood and today's tally. */
export const PetPanel = (
  E: Els,
  o: { mood: Mood; width: number; today: number; streak: number; animated: unknown; crewCount?: number; crewMax?: number; families?: readonly Family[] },
) => {
  const { Box, Text } = E
  const pet = PET[o.mood]
  const n = o.crewCount ?? 0
  const max = o.crewMax ?? 5
  return (
    <Box width={o.width} columnGap={2}>
      {o.animated ?? (
        <Text color={MOOD_COLOR[o.mood]} bold>
          {pet.frames[0]}
        </Text>
      )}
      <Box flexDirection="column" justifyContent="center">
        <Text color={MOOD_COLOR[o.mood]} bold>
          {`Clawd · ${pet.caption}`}
        </Text>
        {n > 0 ? <Text color={HAHA.gold}>{`+ ${n} helper${n === 1 ? '' : 's'} at work${n > max ? ` (${n - max} off screen)` : ''}`}</Text> : null}
        {(o.families ?? []).length > 0 ? (
          <Text wrap="truncate">
            {(o.families ?? []).map(f => (
              <Text>
                <Text color={FAMILY_HEX[f]}>■</Text>
                <Text color={HAHA.muted}>{` ${FAMILY_LABEL[f]}  `}</Text>
              </Text>
            ))}
          </Text>
        ) : null}
        <Text wrap="truncate">
          <Text color={HAHA.muted}>today </Text>
          <Text color={HAHA.text} bold>
            {o.today}
          </Text>
          <Text color={HAHA.muted}>{o.today === 1 ? ' task' : ' tasks'}</Text>
        </Text>
        {o.streak > 1 ? <Text color={HAHA.gold}>{`${o.streak}-day streak`}</Text> : null}
      </Box>
    </Box>
  )
}

export type ActionHandlers = {
  compact: () => void
  model: (name: string) => void
  effort: (dir: 1 | -1) => void
  copyAnswer: () => void
}

export const ActionsPanel = (
  E: Els,
  o: { width: number; isRunning: boolean; hasAnswer: boolean; effort: string; model: string; status: string; on: ActionHandlers },
) => {
  const { Box, Text } = E
  const isModel = (name: string) => o.model.toLowerCase().includes(name)
  return (
    <Box flexDirection="column" width={o.width}>
      <Box columnGap={1} flexWrap="wrap" width={o.width}>
        {!o.isRunning ? Chip(E, { key: 'act-compact', label: 'Compact', onPress: o.on.compact }) : null}
        {!o.isRunning
          ? (['haiku', 'sonnet', 'opus'] as const).map(m =>
              Chip(E, { key: `act-model-${m}`, label: m[0]?.toUpperCase() + m.slice(1), isOn: isModel(m), onPress: () => o.on.model(m) }),
            )
          : null}
        {Chip(E, { key: 'act-effort-down', label: 'effort −', onPress: () => o.on.effort(-1) })}
        {Chip(E, { key: 'act-effort-up', label: 'effort +', onPress: () => o.on.effort(1) })}
        {o.hasAnswer ? Chip(E, { key: 'act-copy', label: 'Copy answer', onPress: o.on.copyAnswer }) : null}
      </Box>
      {o.status ? (
        <Text color={HAHA.muted} wrap="truncate">
          {o.status}
        </Text>
      ) : null}
    </Box>
  )
}

/** One colored cell per tool call of the task, newest on the right, with a count per kind. */
export const ActivityPanel = (E: Els, a: Activity, width: number) => {
  const { Box, Text } = E
  if (a.cells.length === 0) return null
  const room = Math.max(8, width - 2)
  const cells = a.cells.slice(-room)
  return (
    <Box flexDirection="column" width={width}>
      {Heading(E, `Activity · ${a.cells.length} calls`, width)}
      <Text wrap="truncate">
        {cells.map(c => (
          <Text color={c.isError ? HAHA.red : ACT_COLOR[c.k]}>{c.isError ? '✗' : '▮'}</Text>
        ))}
      </Text>
      <Box columnGap={2} flexWrap="wrap" width={width}>
        {activityCounts(a).map(([k, n]) => (
          <Text>
            <Text color={ACT_COLOR[k]}>■</Text>
            <Text color={HAHA.muted}>{` ${k} ${n}`}</Text>
          </Text>
        ))}
      </Box>
    </Box>
  )
}

export const FilesPanel = (E: Els, o: { files: FileTouch[]; width: number; rel: (p: string) => string; copy: (p: string) => void }) => {
  const { Box, Button, Text } = E
  if (o.files.length === 0) return null
  const shown = o.files.slice(0, 8)
  return (
    <Box flexDirection="column" width={o.width}>
      {Heading(E, `Files touched · ${o.files.length}`, o.width)}
      {shown.map((f, i) => (
        <Button key={`file-${i}`} plain onPress={() => o.copy(f.path)}>
          <Text color={HAHA.gold}>{`${String(f.edits).padStart(2)}× `}</Text>
          <Text color={HAHA.text}>{shorten(o.rel(f.path), Math.max(10, o.width - 6))}</Text>
        </Button>
      ))}
      {o.files.length > shown.length ? <Text color={HAHA.muted}>{`+${o.files.length - shown.length} more · click a file to copy its path`}</Text> : null}
    </Box>
  )
}

export const NotesPanel = (
  E: Els,
  o: { notes: Note[]; width: number; add: (text: string) => void; use: (n: Note) => void; remove: (id: string) => void },
) => {
  const { Box, Text, Input } = E
  return (
    <Box flexDirection="column" width={o.width}>
      {Heading(E, `Notes${o.notes.length ? ` · ${o.notes.length}` : ''}`, o.width)}
      {Input ? <Input key="note-input" placeholder="Jot a note, then Enter" submitLabel="Add" onSubmit={(v: string) => o.add(v)} /> : null}
      {o.notes.slice(0, 6).map(n => (
        <Box key={`note-${n.id}`} columnGap={1} width={o.width}>
          {Quiet(E, { key: `note-use-${n.id}`, label: '→', onPress: () => o.use(n) })}
          <Box width={Math.max(10, o.width - 6)}>
            <Text color={HAHA.text} wrap="truncate">
              {n.text}
            </Text>
          </Box>
          {Quiet(E, { key: `note-del-${n.id}`, label: '×', onPress: () => o.remove(n.id) })}
        </Box>
      ))}
    </Box>
  )
}
