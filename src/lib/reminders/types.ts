/**
 * Ports and value types for the reminder engine (FR7).
 *
 * Nothing in this file imports Prisma, Next or nodemailer. That is deliberate:
 * the scheduling and suppression logic is pure, so it can be unit-tested at
 * any simulated instant without a database, a network or waiting for 18:00.
 * The Prisma-backed implementation of `DispatchStore` lives in `store.ts`.
 *
 * POPIA: nothing below carries patient data. A candidate is identity plus
 * delivery preferences; the day's state is three booleans/timestamps. The
 * engine never learns what was in a log, only that one exists.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type { ReminderChannel, SkipReason } from '../contract/enums'

/** The two channels a message can actually be delivered over. */
export type DeliveryChannel = Extract<ReminderChannel, 'EMAIL' | 'WHATSAPP'>

/**
 * Injectable clock. Every time-dependent function in this module takes the
 * current instant as an argument rather than calling `new Date()` internally,
 * so a test can run the 18:00 Friday case in under a millisecond.
 */
export type Clock = () => Date

export const systemClock: Clock = () => new Date()

/** A fixed clock for tests and for the `--at` flag on the one-shot runner. */
export function fixedClock(instant: Date): Clock {
  return () => instant
}

/**
 * One practitioner as the dispatcher sees them. Note what is absent: no log
 * counts, no conditions, no province. `email` is present only because the
 * email adapter needs a recipient — it must never be logged or returned.
 */
export interface ReminderCandidate {
  practitionerId: string
  /** Practitioner's own email. Delivery input only. Never log this. */
  email: string
  fullName: string
  /** Declared preference: NONE | EMAIL | WHATSAPP. */
  channel: ReminderChannel
  /** "HH:mm" in SAST. */
  time: string
  includeSaturday: boolean
  whatsappNumber: string | null
  reminderLinkId: string
}

/**
 * Everything the engine is allowed to know about a practitioner's day.
 * `hasLogged` is a single boolean on purpose — see `daily-log-gateway.ts`.
 */
export interface DayState {
  hasLogged: boolean
  markedDoneAt: Date | null
  snoozedUntil: Date | null
}

export const EMPTY_DAY_STATE: DayState = {
  hasLogged: false,
  markedDoneAt: null,
  snoozedUntil: null,
}

/**
 * The outcome of evaluating one practitioner at one instant.
 *
 *  SEND  — deliver now, and record a dispatch row.
 *  SKIP  — the decision is *final for this SAST day*; record it with a
 *          skipReason so the October audit trail explains the silence.
 *  DEFER — no decision yet; the reminder may still fire later today. Nothing
 *          is written, because writing a row would trip the unique constraint
 *          and permanently suppress the real send.
 */
export type DispatchDecision =
  | { kind: 'SEND'; channel: ReminderChannel; dueAt: Date }
  | { kind: 'SKIP'; reason: SkipReason; channel: ReminderChannel; dueAt: Date }
  | { kind: 'DEFER'; reason: DeferReason; until: Date }

export type DeferReason = 'NOT_YET_DUE' | 'SNOOZED'

/** A claimed, not-yet-sent dispatch row. */
export interface DispatchClaim {
  id: string
  channel: DeliveryChannel
}

export interface ClaimInput {
  practitionerId: string
  logDate: string
  channel: DeliveryChannel
  scheduledFor: Date
}

export interface SkipInput {
  practitionerId: string
  logDate: string
  /** The practitioner's *declared* channel, which may be NONE. */
  channel: ReminderChannel
  scheduledFor: Date
  reason: SkipReason
}

/**
 * The persistence port. `claim` is the double-send guard: it inserts a PENDING
 * row and lets the `@@unique([practitionerId, logDate, channel])` constraint
 * reject a duplicate, rather than reading first and racing between the read
 * and the write.
 */
export interface DispatchStore {
  listCandidates(): Promise<ReminderCandidate[]>
  loadDayState(practitionerIds: string[], logDate: string): Promise<Map<string, DayState>>
  /** Returns null when a row for this (practitioner, date, channel) exists. */
  claim(input: ClaimInput): Promise<DispatchClaim | null>
  markSent(dispatchId: string, sentAt: Date): Promise<void>
  markFailed(dispatchId: string, error: string): Promise<void>
  /** Returns false when the skip was already recorded by an earlier run. */
  recordSkip(input: SkipInput): Promise<boolean>
}

/** What a channel adapter is handed. Identity and a link — nothing clinical. */
export interface ReminderMessage {
  practitionerId: string
  /** Email address or E.164 number, depending on the adapter. */
  recipient: string
  /** First name, for the greeting. */
  greetingName: string
  logDate: string
  link: string
  /** Where the snooze / done-for-today controls live. */
  manageLink: string
}

export interface ChannelAdapter {
  readonly channel: DeliveryChannel
  /** False when the credentials for this channel are absent. */
  isConfigured(): boolean
  /** Returns the recipient address, or null when this candidate cannot be reached here. */
  recipientFor(candidate: ReminderCandidate): string | null
  /** Throws on failure. The engine turns the throw into a FAILED row. */
  send(message: ReminderMessage): Promise<void>
}
