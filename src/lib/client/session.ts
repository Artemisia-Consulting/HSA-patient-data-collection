/**
 * On-device session storage (FR1, user story 2.1).
 *
 * The real API also sets an `hsa_session` cookie, which is what keeps the PWA
 * logged in. We additionally keep the raw bearer token here because:
 *
 *  - the mock has no cookie jar, and
 *  - iOS Safari in "Prevent cross-site tracking" mode has been known to evict
 *    cookies on installed web apps after seven idle days, which would log a
 *    practitioner out mid-October. localStorage survives that.
 *
 * Nothing clinical is stored. The token and the practitioner's own id are the
 * only things written, plus their own reminder link so a returning user can
 * recover access without re-typing their email.
 *
 * OWNER: Stream 2.
 */
const TOKEN_KEY = 'hsa.session.token'
const LINK_KEY = 'hsa.session.reminderLinkId'

function safeGet(key: string): string | null {
  // Private mode, blocked site data and SSR all make this throw or be absent.
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (typeof window === 'undefined') return
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — the session cookie is still doing its job */
  }
}

export function getSessionToken(): string | null {
  return safeGet(TOKEN_KEY)
}

export function setSessionToken(token: string | null): void {
  safeSet(TOKEN_KEY, token)
}

/** The `k` from the practitioner's personalised reminder link. */
export function getReminderLinkId(): string | null {
  return safeGet(LINK_KEY)
}

export function setReminderLinkId(id: string | null): void {
  safeSet(LINK_KEY, id)
}

export function clearSession(): void {
  setSessionToken(null)
  setReminderLinkId(null)
}

/** Pull the reminder-link id out of a full link or a bare id. */
export function reminderLinkIdFromUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return url.searchParams.get('k')
  } catch {
    return trimmed
  }
}
