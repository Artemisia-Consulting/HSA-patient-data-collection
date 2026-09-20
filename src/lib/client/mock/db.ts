/**
 * The mock's storage layer. localStorage-backed so a "session" genuinely
 * survives a reload and the returning-user path can be tested for real rather
 * than simulated, and so the sub-10-second returning-user claim is measured
 * against something that actually had to rehydrate.
 *
 * In Node (vitest) there is no localStorage, so it falls back to a module-level
 * object — the tests get a clean store per process.
 *
 * OWNER: Stream 2. Delete this whole folder at integration.
 */
import type { DailyLog, Practitioner } from '../../contract/api'

export interface MockPractitionerRecord {
  practitioner: Practitioner
  sessionToken: string
  sessionExpiresAt: string
}

export interface MockDb {
  practitioners: MockPractitionerRecord[]
  /** practitionerId → logDate → log */
  logs: Record<string, Record<string, DailyLog>>
}

const STORAGE_KEY = 'hsa.mock.db.v1'

const EMPTY: MockDb = { practitioners: [], logs: {} }

let memory: MockDb | null = null

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function readDb(): MockDb {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return clone(EMPTY)
      const parsed = JSON.parse(raw) as MockDb
      return {
        practitioners: parsed.practitioners ?? [],
        logs: parsed.logs ?? {},
      }
    }
  } catch {
    /* fall through to memory */
  }
  if (!memory) memory = clone(EMPTY)
  return memory
}

export function writeDb(db: MockDb): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
      return
    }
  } catch {
    /* fall through to memory */
  }
  memory = db
}

export function resetDb(): void {
  memory = clone(EMPTY)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* nothing to clear */
  }
}

let counter = 0

/** Stable-ish ids. crypto.randomUUID is not present on older Android WebViews. */
export function mockId(prefix: string): string {
  counter += 1
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14).padEnd(12, '0')
  return `${prefix}_${random}${counter.toString(36)}`
}
