// The Fun tab: bookmarks and what a typed line opens. Pure, no `$`.
import type { Bookmark, Fun } from '../types'

export const DEFAULT_BOOKMARKS: Bookmark[] = [
  { name: 'YouTube', url: 'https://www.youtube.com/' },
  { name: 'YouTube Music', url: 'https://music.youtube.com/' },
  { name: 'Google', url: 'https://www.google.com/' },
  { name: 'VnExpress', url: 'https://vnexpress.net/' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com/' },
  { name: 'Reddit', url: 'https://www.reddit.com/' },
  { name: 'Wikipedia', url: 'https://www.wikipedia.org/' },
]

export const DEFAULT_FUN: Fun = { bookmarks: DEFAULT_BOOKMARKS, recent: [], status: '', orcaSplit: null, orcaBrowser: null }

export const normalizeFun = (stored: unknown): Fun => {
  const f = { ...DEFAULT_FUN, ...(typeof stored === 'object' && stored !== null ? stored : {}) } as Fun
  const marks = (x: unknown) =>
    (Array.isArray(x) ? x : []).filter(
      (b): b is Bookmark => typeof b === 'object' && b !== null && typeof (b as Bookmark).url === 'string',
    )
  const str = (x: unknown) => (typeof x === 'string' && x ? x : null)
  return {
    bookmarks: marks(f.bookmarks),
    recent: marks(f.recent).slice(0, 8),
    status: String(f.status ?? ''),
    orcaSplit: str(f.orcaSplit),
    orcaBrowser: str(f.orcaBrowser),
  }
}

/**
 * A typed line as a page: an address opens as given (https added), anything else searches
 * YouTube, since this is the fun tab.
 */
export const urlOf = (line: string): string | null => {
  const t = line.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (/^localhost(:\d+)?(\/|$)/i.test(t)) return `http://${t}`
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) return `https://${t}`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}`
}

/** A page's short name for the recent list. */
export const nameOf = (url: string) => {
  const search = /youtube\.com\/results\?search_query=([^&]+)/.exec(url)
  if (search?.[1]) return `YouTube: ${decodeURIComponent(search[1].replace(/\+/g, ' '))}`
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}

/** The newest page first, no repeats, at most eight. */
export const pushRecent = (recent: readonly Bookmark[], url: string): Bookmark[] =>
  [{ name: nameOf(url), url }, ...recent.filter(b => b.url !== url)].slice(0, 8)

// ---------------------------------------------------------------- Orca

/**
 * Orca draws kitty graphics in a terminal pane but not the unicode placeholders an in-pane browser
 * needs, so there the browser runs in an Orca split beside the session. Orca's split does not answer
 * terminal-browser's graphics probe in time, so the probe is skipped.
 */
export const isOrcaTerminal = (termProgram: string | undefined) => termProgram === 'Orca'

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

export const splitCommand = (url: string) => `PIXEL_SKIP_GRAPHICS_CHECK=1 terminal-browser open ${shellQuote(url)}`

/** The new split's handle from `orca terminal split --json`. */
export const splitHandleOf = (stdout: string): string | null => {
  try {
    const j = JSON.parse(stdout) as { ok?: boolean; result?: { split?: { handle?: unknown } } }
    const handle = j.result?.split?.handle
    return j.ok && typeof handle === 'string' ? handle : null
  } catch {
    return null
  }
}

/** The running browsers' keys from `terminal-browser ls --all --json`. */
export const browserKeysOf = (stdout: string): string[] => {
  try {
    const j = JSON.parse(stdout) as { browsers?: { key?: unknown }[] }
    return (j.browsers ?? []).map(b => b.key).filter((k): k is string => typeof k === 'string')
  } catch {
    return []
  }
}
