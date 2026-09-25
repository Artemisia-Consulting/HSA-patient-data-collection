/**
 * In-memory doubles for the reminder tests.
 *
 * `createFakeStore` reproduces the one database behaviour the engine actually
 * leans on: `@@unique([practitionerId, logDate, channel])` on ReminderDispatch.
 * A second claim for the same key returns null, exactly as a P2002 from SQLite
 * or Postgres would. Everything else is a Map.
 *
 * Imports are relative on purpose — these tests resolve the `@/` alias through
 * no bundler, and the engine is written so none is needed.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type {
  ChannelAdapter,
  DayState,
  DispatchStore,
  ReminderCandidate,
  ReminderMessage,
} from '../../src/lib/reminders/types'

export interface FakeDispatchRow {
  id: string
  practitionerId: string
  logDate: string
  channel: string
  status: string
  skipReason: string | null
  error: string | null
  scheduledFor: Date
  sentAt: Date | null
}

export interface FakeStore extends DispatchStore {
  rows: FakeDispatchRow[]
  rowsFor(practitionerId: string): FakeDispatchRow[]
}

export function makeCandidate(
  overrides: Partial<ReminderCandidate> = {},
): ReminderCandidate {
  return {
    practitionerId: 'prac-1',
    email: 'practitioner@example.org',
    fullName: 'Thandi Mokoena',
    channel: 'EMAIL',
    time: '18:00',
    includeSaturday: false,
    reminderLinkId: 'link-1',
    ...overrides,
  }
}

export function makeDay(overrides: Partial<DayState> = {}): DayState {
  return { hasLogged: false, markedDoneAt: null, snoozedUntil: null, ...overrides }
}

export function createFakeStore(
  candidates: ReminderCandidate[],
  dayState: Map<string, DayState> = new Map(),
): FakeStore {
  const rows: FakeDispatchRow[] = []
  let nextId = 1

  const keyOf = (practitionerId: string, logDate: string, channel: string) =>
    `${practitionerId}|${logDate}|${channel}`

  const taken = new Set<string>()

  return {
    rows,
    rowsFor(practitionerId) {
      return rows.filter((row) => row.practitionerId === practitionerId)
    },

    async listCandidates() {
      return candidates
    },

    async loadDayState(ids, _logDate) {
      const result = new Map<string, DayState>()
      for (const id of ids) {
        result.set(id, dayState.get(id) ?? makeDay())
      }
      return result
    },

    async claim(input) {
      const key = keyOf(input.practitionerId, input.logDate, input.channel)
      if (taken.has(key)) return null // the unique constraint, in one line
      taken.add(key)
      const row: FakeDispatchRow = {
        id: `d${nextId++}`,
        practitionerId: input.practitionerId,
        logDate: input.logDate,
        channel: input.channel,
        status: 'PENDING',
        skipReason: null,
        error: null,
        scheduledFor: input.scheduledFor,
        sentAt: null,
      }
      rows.push(row)
      return { id: row.id, channel: input.channel }
    },

    async markSent(dispatchId, sentAt) {
      const row = rows.find((candidate) => candidate.id === dispatchId)
      if (row) {
        row.status = 'SENT'
        row.sentAt = sentAt
      }
    },

    async markFailed(dispatchId, error) {
      const row = rows.find((candidate) => candidate.id === dispatchId)
      if (row) {
        row.status = 'FAILED'
        row.error = error
      }
    },

    async recordSkip(input) {
      const key = keyOf(input.practitionerId, input.logDate, input.channel)
      if (taken.has(key)) return false
      taken.add(key)
      rows.push({
        id: `d${nextId++}`,
        practitionerId: input.practitionerId,
        logDate: input.logDate,
        channel: input.channel,
        status: 'SKIPPED',
        skipReason: input.reason,
        error: null,
        scheduledFor: input.scheduledFor,
        sentAt: null,
      })
      return true
    },
  }
}

export interface FakeAdapter extends ChannelAdapter {
  sent: ReminderMessage[]
}

export function createFakeAdapter(options: {
  channel?: 'EMAIL'
  configured?: boolean
  recipient?: (candidate: ReminderCandidate) => string | null
  fail?: string
}): FakeAdapter {
  const sent: ReminderMessage[] = []
  return {
    sent,
    channel: options.channel ?? 'EMAIL',
    isConfigured: () => options.configured ?? true,
    recipientFor: (candidate) =>
      options.recipient ? options.recipient(candidate) : candidate.email || null,
    async send(message) {
      if (options.fail) throw new Error(options.fail)
      sent.push(message)
    },
  }
}
