/**
 * SAST date helpers.
 *
 * Every calendar date in this system — DailyLog.logDate, DayOverride.logDate,
 * ReminderDispatch.logDate — is a "yyyy-MM-dd" string in Africa/Johannesburg,
 * never a UTC timestamp. The reason is concrete: a practitioner logging at
 * 18:30 SAST is at 16:30 UTC the same day, but one logging at 01:00 SAST is at
 * 23:00 UTC the *previous* day. Reckoning in UTC would file that entry under
 * the wrong date and make the reminder logic re-nudge someone who had already
 * logged.
 *
 * South Africa observes no daylight saving, so SAST is a fixed UTC+02:00 —
 * but this module still goes through the IANA zone rather than hardcoding the
 * offset, so nothing breaks if that ever changes.
 *
 * OWNERSHIP: integration lead. Shared by all three agents.
 */
import { TZDate } from '@date-fns/tz'
import { addMinutes, format, getDay, parse } from 'date-fns'

import { SAST_TIME_ZONE } from './contract/enums'

export { SAST_TIME_ZONE }

/** Today's calendar date in SAST, as "yyyy-MM-dd". */
export function todayInSast(now: Date = new Date()): string {
  return format(new TZDate(now, SAST_TIME_ZONE), 'yyyy-MM-dd')
}

/** The current wall-clock time in SAST, as "HH:mm". */
export function timeInSast(now: Date = new Date()): string {
  return format(new TZDate(now, SAST_TIME_ZONE), 'HH:mm')
}

/**
 * Turn a SAST calendar date plus an "HH:mm" wall time into a real instant.
 * Use this to work out when a reminder is actually due.
 */
export function sastDateTimeToInstant(logDate: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const [year, month, day] = logDate.split('-').map(Number)
  return new Date(
    new TZDate(year, month - 1, day, hours, minutes, 0, SAST_TIME_ZONE).getTime(),
  )
}

/** Day of week for a SAST date: 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(logDate: string): number {
  return getDay(parse(logDate, 'yyyy-MM-dd', new Date()))
}

/**
 * Is this a day we send reminders on? Mon–Fri always, Saturday only if the
 * practitioner opted in, Sunday never (FR7).
 */
export function isReminderDay(logDate: string, includeSaturday: boolean): boolean {
  const day = dayOfWeek(logDate)
  if (day === 0) return false
  if (day === 6) return includeSaturday
  return true
}

/** Shift a SAST calendar date by whole days, staying in SAST. */
export function addDaysToLogDate(logDate: string, days: number): string {
  const [year, month, day] = logDate.split('-').map(Number)
  const shifted = new TZDate(year, month - 1, day + days, 12, 0, 0, SAST_TIME_ZONE)
  return format(shifted, 'yyyy-MM-dd')
}

/** Human-friendly rendering for the UI, e.g. "Thu, 1 Oct 2026". */
export function formatLogDateLong(logDate: string): string {
  return format(parse(logDate, 'yyyy-MM-dd', new Date()), 'EEE, d MMM yyyy')
}

export function snoozeUntil(minutes: number, now: Date = new Date()): Date {
  return addMinutes(now, minutes)
}

/* ------------------------------------------------------------------ *
 * Collection window
 * ------------------------------------------------------------------ */

export const COLLECTION_START_DATE =
  process.env.COLLECTION_START_DATE ?? '2026-10-01'
export const COLLECTION_END_DATE =
  process.env.COLLECTION_END_DATE ?? '2026-10-31'

/**
 * How far before the collection opens an entry may still be saved.
 *
 * Two different questions get asked about a date and they have deliberately
 * different answers:
 *
 *  - *Does this day count towards the study?* — `isWithinCollectionWindow`.
 *    Only October does. Reminders fire on this, and it is what the research
 *    dataset means.
 *  - *May a log be saved for this day at all?* — `isWritableLogDate`. This is
 *    wider on the early side, so the app can be exercised with real entries
 *    during development and practitioner training rather than only being
 *    tested for the first time on the morning of 1 October.
 *
 * Pre-window entries are saved as ordinary rows and are not marked in any
 * way, because they do not need to be: `logDate` is a sortable string, so
 * clearing them before the study opens is one statement. Patients and
 * conditions cascade from the log.
 *
 *   DELETE FROM "DailyLog" WHERE "logDate" < '2026-10-01';
 *
 * Ninety days is a quarter — long enough to cover a build and a pilot, short
 * enough that a mistyped year is still rejected rather than quietly stored.
 */
const EARLY_ENTRY_DAYS = 90

export const EARLY_ENTRY_FROM_DATE = addDaysToLogDate(
  COLLECTION_START_DATE,
  -EARLY_ENTRY_DAYS,
)

/**
 * Is this day part of the study?
 *
 * String comparison is safe here — "yyyy-MM-dd" sorts lexicographically in
 * the same order it sorts chronologically, which is why the format was chosen.
 */
export function isWithinCollectionWindow(logDate: string): boolean {
  return logDate >= COLLECTION_START_DATE && logDate <= COLLECTION_END_DATE
}

/**
 * May a log be written for this day? Wider than the collection window, but
 * only at the front: there is a reason to record a day before the study opens
 * and none to record one after it has closed.
 */
export function isWritableLogDate(logDate: string): boolean {
  return logDate >= EARLY_ENTRY_FROM_DATE && logDate <= COLLECTION_END_DATE
}
