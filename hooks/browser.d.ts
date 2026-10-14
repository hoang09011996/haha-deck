// The terminal-browser plugin's `$.browser` noun, declared here so the deck type-checks without
// depending on that plugin: when it is not loaded the calls throw, and the Fun tab says so.
export type Browser = {
  open: (input: { url?: string }) => Promise<{ ok: true; url: string } | { ok: false; error: string }>
  close: (input?: Record<string, never>) => Promise<boolean>
}

declare module 'claude-code' {
  interface EngineInterface {
    browser: Browser
  }
}
