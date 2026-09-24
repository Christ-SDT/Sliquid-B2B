import '@testing-library/jest-dom'

// Node 26 ships an experimental global `localStorage` that is undefined unless
// --localstorage-file is passed, and it shadows jsdom's — so under Node 26 every
// localStorage read in a test throws. Restore a working in-memory Storage when
// that happens; on Node ≤23 jsdom's own implementation is left untouched.
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null) {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => { store.delete(k) },
    setItem: (k, v) => { store.set(k, String(v)) },
  }
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, 'localStorage', { value: memoryStorage, configurable: true, writable: true })
  }
}

// Initialise i18n for every test so components' t() calls resolve to real English
// copy — existing tests assert on English labels. Dynamic import on purpose: a
// static import would be hoisted above the localStorage shim, and the language
// detector reads storage during init.
const { default: i18n } = await import('@/i18n')
await i18n.changeLanguage('en')

// No test may reach the network. Pages post to the PRODUCTION API by default
// (API_BASE falls back to the Railway host), and for months two suites did
// exactly that on every run — creating real submissions and emailing the sales
// inbox. Any fetch a test hasn't stubbed now fails loudly with its URL.
// vi.stubGlobal('fetch', …) in a test overrides this; vi.unstubAllGlobals()
// restores it.
globalThis.fetch = ((input: RequestInfo | URL) =>
  Promise.reject(new Error(`Unmocked fetch in test: ${String(input instanceof Request ? input.url : input)} — stub it with vi.stubGlobal('fetch', …)`))) as typeof fetch
