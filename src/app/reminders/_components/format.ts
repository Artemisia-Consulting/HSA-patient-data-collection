/**
 * Display formatting for the reminder screens.
 *
 * Every instant is rendered through the Africa/Johannesburg IANA zone rather
 * than the device's locale clock. A practitioner travelling, or a phone with
 * the wrong timezone set, must still see the SAST time their reminder will
 * actually arrive at.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { SAST_TIME_ZONE } from '@/lib/contract/enums'

const dateTime = new Intl.DateTimeFormat('en-ZA', {
  timeZone: SAST_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const timeOnly = new Intl.DateTimeFormat('en-ZA', {
  timeZone: SAST_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatSastDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

export function formatSastTime(iso: string): string {
  return timeOnly.format(new Date(iso))
}

/** "Thu, 1 Oct 2026" from a "yyyy-MM-dd" SAST date, with no timezone shift. */
export function formatLogDate(logDate: string): string {
  const [year, month, day] = logDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}
