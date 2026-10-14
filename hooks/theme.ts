// The Haha-deck look for the new tabs: dark, calm, one gold accent. Pure data, no `$`.

export const HAHA = {
  gold: '#F2C46D',
  ink: '#0D1117',
  slate: '#262B33',
  muted: '#7D8590',
  text: '#E6EDF3',
  green: '#3DD68C',
  amber: '#E3B341',
  red: '#F47067',
  blue: '#6CB6FF',
  violet: '#B083F0',
  teal: '#39C5CF',
} as const

// Three rows per glyph, heavy box-drawing strokes.
const GLYPHS: Record<string, [string, string, string]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': ['╺┓ ', ' ┃ ', '╺┻╸'],
  '2': ['┏━┓', '┏━┛', '┗━╸'],
  '3': ['┏━┓', ' ━┫', '┗━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '┗━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
  '.': [' ', ' ', '╸'],
  ',': [' ', ' ', '╻'],
  $: ['┏╋╸', '┗╋┓', '╺╋┛'],
  k: ['╻  ', '┣┳╸', '╹┗╸'],
  h: ['╻  ', '┣━┓', '╹ ╹'],
  ' ': [' ', ' ', ' '],
}

/** A string drawn as three rows of big numerals; null when a character has no glyph. */
export const bigRows = (s: string): [string, string, string] | null => {
  const rows: [string, string, string] = ['', '', '']
  for (const ch of s) {
    const g = GLYPHS[ch]
    if (!g) return null
    rows[0] += g[0] + ' '
    rows[1] += g[1] + ' '
    rows[2] += g[2] + ' '
  }
  return [rows[0].trimEnd(), rows[1].trimEnd(), rows[2].trimEnd()]
}

/** The width big numerals take, so a tile can fall back to plain bold text. */
export const bigWidth = (s: string) => bigRows(s)?.[0].length ?? Infinity

/** A title rule: a gold run the title's width, then a dim hairline to the edge. */
export const rule = (titleWidth: number, width: number) => ({
  gold: '━'.repeat(Math.max(1, Math.min(titleWidth, width))),
  hair: '─'.repeat(Math.max(0, width - titleWidth)),
})
