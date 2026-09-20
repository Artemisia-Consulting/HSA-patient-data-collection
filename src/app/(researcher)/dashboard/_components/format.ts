/**
 * Display formatting for the research screens.
 *
 * A `logDate` is a SAST calendar date, not an instant. Parsing "2026-10-01"
 * with `new Date()` would apply the *viewer's* timezone and can render the
 * first of October as the thirtieth of September on a laptop set to UTC-2, so
 * the parts are read out of the string and reassembled in UTC instead.
 *
 * OWNER: Stream 2.
 */
const SHORT = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const FULL = new Intl.DateTimeFormat('en-ZA', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function asUtcDate(logDate: string): Date {
  const [year, month, day] = logDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** "1 Oct" — chart axes, where space is the constraint. */
export function shortLogDate(logDate: string): string {
  return SHORT.format(asUtcDate(logDate))
}

/** "Thu, 1 Oct 2026" — table cells, where the reader needs the whole date. */
export function fullLogDate(logDate: string): string {
  return FULL.format(asUtcDate(logDate))
}

export const NUMBER = new Intl.NumberFormat('en-ZA')
