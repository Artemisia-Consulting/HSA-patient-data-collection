/**
 * The scheduling and suppression rules (FR7). Pure functions only — no I/O,
 * no `new Date()`, no Prisma. Given a candidate, that day's state and an
 * instant, `decideDispatch` returns exactly what should happen. Everything
 * else in the reminder system is plumbing around this file.
 *
 * All calendar reasoning goes through `src/lib/dates.ts`, which is the shared,
 * integration-lead-owned SAST module. This file writes no timezone logic of
 * its own and hardcodes no UTC offset.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import {
  COLLECTION_END_DATE,
  COLLECTION_START_DATE,
  addDaysToLogDate,
  isReminderDay,
  isWithinCollectionWindow,
  sastDateTimeToInstant,
  todayInSast,
} from '../dates'
import type {
  DayState,
  DispatchDecision,
  ReminderCandidate,
} from './types'

/**
 * The instant a SAST calendar day ends — i.e. midnight at the start of the
 * next day. Used to tell a snooze that expires *today* (the reminder will
 * still fire) from one that runs past midnight (it never will, so the day is
 * finally decided and gets a SKIPPED/SNOOZED row).
 */
export function endOfSastDay(logDate: string): Date {
  return sastDateTimeToInstant(addDaysToLogDate(logDate, 1), '00:00')
}

/** The instant this practitioner's reminder is due on the given SAST date. */
export function dueAtFor(candidate: ReminderCandidate, logDate: string): Date {
  return sastDateTimeToInstant(logDate, candidate.time)
}

/**
 * The whole rule set, in the order a reviewer should read it.
 *
 *  1. Not opted in                     → SKIP  NOT_OPTED_IN
 *  2. Sunday, or Saturday without the
 *     Saturday toggle                  → SKIP  NON_WORKING_DAY
 *  3. A DailyLog already exists today  → SKIP  ALREADY_LOGGED
 *  4. "Done for today" was tapped      → SKIP  MARKED_DONE
 *  5. Snoozed past midnight SAST       → SKIP  SNOOZED
 *     Snoozed, expiring later today    → DEFER (the send still happens)
 *  6. Before the chosen SAST time      → DEFER NOT_YET_DUE
 *  7. Otherwise                        → SEND
 *
 * Steps 1–5 are final for the day, so they are safe to write to
 * ReminderDispatch. Step 6 and the short snooze are *not* final: writing them
 * would burn the unique key and suppress the real 18:00 send.
 *
 * Note there is no "too late to bother" cutoff. If the cron host was down
 * from 18:00 to 23:00 the reminder still goes out at 23:00, because the SAST
 * day is the unit that matters and a late nudge still gets the day logged.
 * At midnight `logDate` rolls over and the day is simply missed.
 */
export function decideDispatch(args: {
  candidate: ReminderCandidate
  day: DayState
  logDate: string
  now: Date
}): DispatchDecision {
  const { candidate, day, logDate, now } = args
  const dueAt = dueAtFor(candidate, logDate)

  if (candidate.channel === 'NONE') {
    return { kind: 'SKIP', reason: 'NOT_OPTED_IN', channel: 'NONE', dueAt }
  }

  if (!isReminderDay(logDate, candidate.includeSaturday)) {
    return {
      kind: 'SKIP',
      reason: 'NON_WORKING_DAY',
      channel: candidate.channel,
      dueAt,
    }
  }

  if (day.hasLogged) {
    return {
      kind: 'SKIP',
      reason: 'ALREADY_LOGGED',
      channel: candidate.channel,
      dueAt,
    }
  }

  if (day.markedDoneAt) {
    return {
      kind: 'SKIP',
      reason: 'MARKED_DONE',
      channel: candidate.channel,
      dueAt,
    }
  }

  if (day.snoozedUntil && day.snoozedUntil.getTime() > now.getTime()) {
    if (day.snoozedUntil.getTime() >= endOfSastDay(logDate).getTime()) {
      // The snooze outlives the SAST day, so nothing more can fire for it.
      return {
        kind: 'SKIP',
        reason: 'SNOOZED',
        channel: candidate.channel,
        dueAt,
      }
    }
    return { kind: 'DEFER', reason: 'SNOOZED', until: day.snoozedUntil }
  }

  if (now.getTime() < dueAt.getTime()) {
    return { kind: 'DEFER', reason: 'NOT_YET_DUE', until: dueAt }
  }

  return { kind: 'SEND', channel: candidate.channel, dueAt }
}

/**
 * When this practitioner's next reminder would fire, or null if none will.
 *
 * Scanning starts at today, or at the first day of the collection window when
 * today falls before it — so during September the preferences screen honestly
 * answers "Thu, 1 Oct 2026 at 18:00" rather than promising a reminder that
 * the dispatcher would refuse to send. After the window closes it returns
 * null. `horizonDays` only ever has to cover a Sunday plus an opted-out
 * Saturday, but scans further so a future window change cannot silently
 * return null.
 */
export function nextReminderAt(args: {
  candidate: ReminderCandidate
  /** Today's state, used to skip today when it is already settled. */
  day?: DayState
  now: Date
  horizonDays?: number
}): Date | null {
  const { candidate, day, now, horizonDays = 45 } = args
  if (candidate.channel === 'NONE') return null

  const today = todayInSast(now)
  let cursor = today < COLLECTION_START_DATE ? COLLECTION_START_DATE : today

  for (let step = 0; step <= horizonDays; step += 1) {
    if (cursor > COLLECTION_END_DATE) return null

    if (isReminderDay(cursor, candidate.includeSaturday)) {
      const dueAt = dueAtFor(candidate, cursor)

      if (cursor !== today) return dueAt

      // Today: respect anything that has already settled the day.
      const state = day ?? { hasLogged: false, markedDoneAt: null, snoozedUntil: null }
      const settled = state.hasLogged || Boolean(state.markedDoneAt)
      if (!settled) {
        const endOfDay = endOfSastDay(cursor)
        const snoozedUntil = state.snoozedUntil
        const snoozeActive = Boolean(
          snoozedUntil && snoozedUntil.getTime() > now.getTime(),
        )

        if (snoozeActive && snoozedUntil!.getTime() < endOfDay.getTime()) {
          // Fires when the snooze lapses, or at the chosen time if that is later.
          return new Date(Math.max(snoozedUntil!.getTime(), dueAt.getTime()))
        }
        if (!snoozeActive && dueAt.getTime() > now.getTime()) {
          return dueAt
        }
      }
    }

    cursor = addDaysToLogDate(cursor, 1)
  }

  return null
}

/**
 * Whether a dispatch run for this SAST date is allowed to send at all.
 * Reminders are for the October 2026 collection; outside it the run is a
 * no-op. `REMINDERS_IGNORE_WINDOW=1` lifts the guard so the system can be
 * demonstrated and load-tested before 1 October.
 */
export function isDispatchableDate(
  logDate: string,
  ignoreWindow = process.env.REMINDERS_IGNORE_WINDOW === '1',
): boolean {
  return ignoreWindow || isWithinCollectionWindow(logDate)
}
