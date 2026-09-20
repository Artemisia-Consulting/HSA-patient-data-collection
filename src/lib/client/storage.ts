/**
 * Every localStorage read and write in the app goes through here.
 *
 * The reason is not tidiness: on a phone in private mode, with site data
 * blocked, or inside the PWA thumbnail capture, `localStorage` can throw on
 * *access*, not just on write. An unguarded read is a white screen. These two
 * functions never throw, and every caller is written to work when they return
 * the fallback.
 *
 * OWNER: Stream 2.
 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    if (typeof window === 'undefined') return false
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Quota exceeded, or storage disabled. Callers degrade to "not saved
    // locally" rather than losing the submit.
    return false
  }
}

export function removeKey(key: string): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
  } catch {
    /* nothing to remove */
  }
}
