/**
 * A minimal browser shim for the Node test environment.
 *
 * The frontend has no DOM tests — `@testing-library/react` and `jsdom` are not
 * in the locked dependency list and Stream 2 may not add packages. What *can*
 * be tested without a DOM is everything that matters for correctness of the
 * data: the mock's conformance to the contract, the form→payload conversion,
 * the search ranking and the offline queue. All of those touch `localStorage`
 * and `window`, so they get a shim rather than a mock of themselves.
 *
 * See docs/streams/frontend.md § "What is NOT tested" for the consequences.
 *
 * OWNER: Stream 2.
 */

class MemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get length(): number {
    return this.store.size
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
}

export const storage = new MemoryStorage()

export function installBrowserEnv(): void {
  const fakeWindow = {
    localStorage: storage,
    location: { origin: 'http://localhost:3000', search: '', href: 'http://localhost:3000/' },
  }
  ;(globalThis as unknown as { window: unknown }).window = fakeWindow
}

export function resetBrowserEnv(): void {
  storage.clear()
}
