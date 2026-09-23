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
