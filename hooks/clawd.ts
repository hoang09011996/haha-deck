// Clawd, the deck's pet, as pixel art: 14 × 10 pixels drawn two to a terminal cell with ▀, so it
// shows on any true-colour terminal (no kitty graphics needed). Pure, no `$`.
import type { Mood } from '../types'

/** The sprite's own width; the Raster is wider so Clawd can walk. */
const SPRITE_W = 14
export const CLAWD_COLS = 26
export const CLAWD_ROWS = 5
/** Where a standing Clawd sits: the middle of the track. */
const HOME = Math.floor((CLAWD_COLS - SPRITE_W) / 2)

const COLOR: Record<string, number> = {
  // Bodies, one colour per model family (FAMILY_CHAR).
  o: 0xd97757, // Opus: Claude's clay
  s: 0x6cb6ff, // Sonnet
  h: 0x3dd68c, // Haiku
  f: 0xb083f0, // Fable
  g: 0x9aa4af, // any other model
  k: 0x141413, // eyes, Z
  b: 0x6cb6ff, // sparkle
  y: 0xf2c46d, // sparkle, halo
  r: 0xf47067, // alarm
}
const NONE = 0x01000000 // the terminal's own colour

// ---------------------------------------------------------------- model families

export type Family = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'other'

export const FAMILIES: readonly Family[] = ['opus', 'sonnet', 'haiku', 'fable', 'other']

export const familyOf = (model: string): Family => {
  const m = model.toLowerCase()
  return m.includes('opus') ? 'opus' : m.includes('sonnet') ? 'sonnet' : m.includes('haiku') ? 'haiku' : m.includes('fable') ? 'fable' : 'other'
}

const FAMILY_CHAR: Record<Family, string> = { opus: 'o', sonnet: 's', haiku: 'h', fable: 'f', other: 'g' }

/** The same colours as text colours, for the legend. */
export const FAMILY_HEX: Record<Family, string> = { opus: '#D97757', sonnet: '#6CB6FF', haiku: '#3DD68C', fable: '#B083F0', other: '#9AA4AF' }

export const FAMILY_LABEL: Record<Family, string> = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable', other: 'other' }

/** The families among these models, in a fixed order, for the legend. */
export const familiesIn = (models: readonly string[]) => FAMILIES.filter(f => models.some(m => familyOf(m) === f))

/** A sprite drawn in a model's colour: its body pixels take the family's colour. */
const tint = (sprite: Sprite, model: string): Sprite => {
  const ch = FAMILY_CHAR[familyOf(model)]
  return ch === 'o' ? sprite : sprite.map(r => r.replace(/o/g, ch))
}

const W = SPRITE_W
const blank = '.'.repeat(W)

/** Ten rows of pixels: three for what floats above, five of body, two of legs. */
type Sprite = string[]

const put = (row: string, cols: number[], ch: string) => [...row].map((c, i) => (cols.includes(i) ? ch : c)).join('')

const TOP = '..oooooooooo..'
const MID = '..oooooooooo..'
const ARMS = 'oooooooooooooo'
const LEGS = '...o.o..o.o...'
const LEGS_STEP = '..o.o..o.o....'

const body = (o: { above?: [string, string, string]; eyes?: [number, number]; eyesLow?: boolean; armsUp?: boolean; step?: boolean }): Sprite => {
  const [a0, a1, a2] = o.above ?? [blank, blank, blank]
  const eyes = o.eyes ?? [4, 9]
  // Arms up: the hands rise into the row above the body and the arm row is plain body.
  const hands = o.armsUp ? put(a2, [1, 12], 'o') : a2
  const top = o.armsUp ? '.oooooooooooo.' : TOP
  const eyeRow = o.eyesLow ? MID : put(MID, eyes, 'k')
  const armRow = o.armsUp ? MID : o.eyesLow ? put(ARMS, eyes, 'k') : ARMS
  const legs = o.step ? LEGS_STEP : LEGS
  return [a0, a1, hands, top, eyeRow, armRow, MID, MID, legs, legs]
}

const SPRITES: Record<Mood, Sprite[]> = {
  sleep: [body({ eyesLow: true, above: ['.........kkk..', '..........k...', '.........kkk..'] })],
  work: [body({ eyes: [3, 8] }), body({ eyes: [4, 9] }), body({ eyes: [5, 10] }), body({ eyes: [4, 9] })],
  wait: [
    body({ above: [blank, blank, '.........k....'] }),
    body({ above: [blank, blank, '.........k.k..'] }),
    body({ above: [blank, blank, '.........k.k.k'] }),
  ],
  error: [body({ above: ['......rr......', '......rr......', blank] })],
  party: [
    body({ armsUp: true, above: ['..b.......y...', '.bbb.....yyy..', '..b.......y...'] }),
    body({ above: ['.....y.....b..', '....yyy...bbb.', '.....y.....b..'] }),
  ],
}

// ---------------------------------------------------------------- walking

/** One lap of the track, there and back: a frame per cell moved. */
const LAP = (CLAWD_COLS - SPRITE_W) * 2

/** At work Clawd walks the track: looking the way it goes, legs alternating every step. */
const walkOf = (phase: number): { sprite: Sprite; x: number } => {
  const i = ((phase % LAP) + LAP) % LAP
  const half = LAP / 2
  const isRight = i < half
  const x = isRight ? i : LAP - i
  return { sprite: body({ eyes: isRight ? [5, 10] : [3, 8], step: i % 2 === 1 }), x }
}

const placed = (mood: Mood, phase: number): { sprite: Sprite; x: number } => {
  if (mood === 'work') return walkOf(phase)
  const frames = SPRITES[mood]
  return { sprite: frames[((phase % frames.length) + frames.length) % frames.length] ?? [], x: HOME }
}

export const frameCount = (mood: Mood) => (mood === 'work' ? LAP : SPRITES[mood].length)

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const base64 = (bytes: Uint8Array) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

/** One frame as Raster cells: each cell the pixel above (▀ foreground) and the one below (background). */
/** Pixel rows (a sprite placed `x` cells in) as Raster cells: each cell the pixel above (▀ foreground) and the one below (background). */
const cellsOf = (sprite: Sprite, x: number) => {
  const words = new Uint32Array(CLAWD_COLS * CLAWD_ROWS * 3)
  for (let r = 0; r < CLAWD_ROWS; r++) {
    for (let c = 0; c < CLAWD_COLS; c++) {
      const top = COLOR[sprite[r * 2]?.[c - x] ?? '.']
      const bottom = COLOR[sprite[r * 2 + 1]?.[c - x] ?? '.']
      const at = (r * CLAWD_COLS + c) * 3
      if (top === undefined && bottom === undefined) words.set([0x20, NONE, NONE], at)
      else if (top === undefined) words.set([0x2584, bottom ?? NONE, NONE], at) // ▄
      else words.set([0x2580, top, bottom ?? NONE], at) // ▀
    }
  }
  return base64(new Uint8Array(words.buffer))
}

export const frameCells = (mood: Mood, phase: number, model = '') => {
  const { sprite, x } = placed(mood, phase)
  return cellsOf(tint(sprite, model), x)
}

/** The sprite's pixel rows, for tests and for surfaces without a Raster. */
export const spriteOf = (mood: Mood, phase = 0) => placed(mood, phase).sprite

/** Where the sprite stands on the track in a frame (its left edge, in cells). */
export const positionOf = (mood: Mood, phase = 0) => placed(mood, phase).x

// ---------------------------------------------------------------- the crew: everyone small, in the same frame

/**
 * With agents running, the frame holds a crew instead of one big Clawd: two lanes of three slots,
 * each a tiny Clawd (5 × 4 pixels) walking its slot, coloured by its model. The main session's Clawd
 * leads the first lane with a gold spark over its head.
 */
const TINY_W = 5
const SLOT_W = 8
const SLOTS_PER_LANE = 3
const LANES = 2
/** Clawds the frame holds: the main one and five agents; more are counted beside it. */
export const CREW_MAX = SLOTS_PER_LANE * LANES - 1
const TINY_LAP = (SLOT_W - TINY_W) * 2
const LEFT_PAD = Math.floor((CLAWD_COLS - SLOT_W * SLOTS_PER_LANE) / 2)

const tiny = (eyes: [number, number], step: boolean, body: string): Sprite => [
  body.repeat(5),
  put(body.repeat(5), eyes, 'k'),
  body.repeat(5),
  step ? put('.....', [0, 2, 4], body) : put('.....', [1, 3], body),
]

/** Where a crew member stands in its slot, each starting at its own point so they do not march in step. */
export const crewPositionOf = (i: number, phase: number) => {
  const at = (((phase + i * 2) % TINY_LAP) + TINY_LAP) % TINY_LAP
  return at < TINY_LAP / 2 ? at : TINY_LAP - at
}

const crewPixels = (mood: Mood, helpers: readonly string[], phase: number, mainModel = ''): Sprite => {
  const grid = Array.from({ length: CLAWD_ROWS * 2 }, () => [...'.'.repeat(CLAWD_COLS)])
  const models = [mainModel, ...helpers.slice(0, CREW_MAX)]
  const members = models.length
  for (let i = 0; i < members; i++) {
    const lane = Math.floor(i / SLOTS_PER_LANE)
    const slot = i % SLOTS_PER_LANE
    const at = (((phase + i * 2) % TINY_LAP) + TINY_LAP) % TINY_LAP
    const isRight = at < TINY_LAP / 2
    const x = LEFT_PAD + slot * SLOT_W + crewPositionOf(i, phase)
    const y = lane * 5 + 1
    const isMain = i === 0
    const sprite = tiny(isRight ? [2, 4] : [0, 2], at % 2 === 1, FAMILY_CHAR[familyOf(models[i] ?? '')])
    sprite.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        if (ch !== '.') grid[y + dy]![x + dx] = ch
      }),
    )
    // The main Clawd's spark: gold while all is well, red when it is stuck.
    if (isMain) grid[y - 1]![x + 2] = mood === 'error' ? 'r' : 'y'
  }
  return grid.map(r => r.join(''))
}

/** The crew's frame: same size as the big Clawd's, so one Raster serves both. */
export const crewCells = (mood: Mood, helpers: readonly string[], phase: number, mainModel = '') => cellsOf(crewPixels(mood, helpers, phase, mainModel), 0)

/** The pixel rows of a crew frame, for tests. */
export const crewSpriteOf = (mood: Mood, helpers: readonly string[], phase = 0, mainModel = '') => crewPixels(mood, helpers, phase, mainModel)

/** The frame to draw: the big Clawd alone, or the crew while agents run. */
export const sceneCells = (mood: Mood, helpers: readonly string[], phase: number, mainModel = '') =>
  helpers.length > 0 ? crewCells(mood, helpers, phase, mainModel) : frameCells(mood, phase, mainModel)
