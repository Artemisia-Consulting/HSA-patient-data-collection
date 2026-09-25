/**
 * Builds the `reminderStatusResponseSchema` payload shared by all four
 * practitioner-facing reminder routes (GET/PUT preferences, snooze,
 * done-today). One builder means the four responses cannot disagree about
 * whether today is settled.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type { ReminderStatusResponse } from '../contract/api'
import { todayInSast } from '../dates'
import type { AuthedPractitioner } from './auth'
import { hasLoggedOn } from './daily-log-gateway'
import { prisma } from '../db'
import { nextReminderAt } from './schedule'
import type { DayState, ReminderCandidate } from './types'

/** The authenticated practitioner, in the shape the scheduler reasons about. */
export function toCandidate(practitioner: AuthedPractitioner): ReminderCandidate {
  return {
    practitionerId: practitioner.id,
    email: practitioner.email,
    fullName: practitioner.fullName,
    channel: practitioner.reminderChannel === 'EMAIL' ? 'EMAIL' : 'NONE',
    time: practitioner.reminderTime,
    includeSaturday: practitioner.reminderIncludeSat,
    reminderLinkId: practitioner.reminderLinkId,
  }
}

export async function loadDayStateFor(
  practitionerId: string,
  logDate: string,
): Promise<DayState> {
  const [hasLogged, override] = await Promise.all([
    hasLoggedOn(practitionerId, logDate),
    prisma.dayOverride.findUnique({
      where: { practitionerId_logDate: { practitionerId, logDate } },
      select: { markedDoneAt: true, snoozedUntil: true },
    }),
  ])

  return {
    hasLogged,
    markedDoneAt: override?.markedDoneAt ?? null,
    snoozedUntil: override?.snoozedUntil ?? null,
  }
}

export async function buildStatusResponse(
  practitioner: AuthedPractitioner,
  now: Date = new Date(),
): Promise<ReminderStatusResponse> {
  const today = todayInSast(now)
  const candidate = toCandidate(practitioner)
  const day = await loadDayStateFor(practitioner.id, today)

  // A lapsed snooze is history, not state — report only one still running, so
  // the UI never shows "snoozed until 18:20" at 19:00.
  const activeSnooze =
    day.snoozedUntil && day.snoozedUntil.getTime() > now.getTime()
      ? day.snoozedUntil
      : null

  return {
    preferences: {
      channel: candidate.channel,
      time: candidate.time,
      includeSaturday: candidate.includeSaturday,
    },
    today,
    hasLoggedToday: day.hasLogged,
    markedDoneToday: day.markedDoneAt !== null,
    snoozedUntil: activeSnooze ? activeSnooze.toISOString() : null,
    nextReminderAt:
      nextReminderAt({ candidate, day, now })?.toISOString() ?? null,
  }
}
