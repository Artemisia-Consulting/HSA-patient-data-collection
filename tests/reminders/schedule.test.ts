/**
 * The scheduling and suppression rules (FR7, rubric item 8 tier 3).
 *
 * Dates used throughout — October 2026, SAST:
 *   Thu 1 Oct, Fri 2 Oct, Sat 3 Oct, Sun 4 Oct, Mon 5 Oct.
 *
 * Every assertion pins an instant explicitly. Nothing here depends on when
 * the suite happens to run, so the Sunday case is tested on a Tuesday.
 */
import { describe, expect, it } from 'vitest'

import { sastDateTimeToInstant } from '../../src/lib/dates'
import {
  decideDispatch,
  dueAtFor,
  endOfSastDay,
  nextReminderAt,
} from '../../src/lib/reminders/schedule'
import { makeCandidate, makeDay } from './fakes'

const at = sastDateTimeToInstant

describe('SAST reckoning', () => {
  it('treats 18:00 SAST as 16:00 UTC (fixed +02:00, no DST)', () => {
    expect(at('2026-10-05', '18:00').toISOString()).toBe('2026-10-05T16:00:00.000Z')
    // Mid-winter: South Africa has no daylight saving, so the offset holds.
    expect(at('2026-07-05', '18:00').toISOString()).toBe('2026-07-05T16:00:00.000Z')
  })

  it('ends a SAST day at 22:00 UTC the same evening', () => {
    expect(endOfSastDay('2026-10-05').toISOString()).toBe('2026-10-05T22:00:00.000Z')
  })
})

describe('decideDispatch — day of week', () => {
  it('sends Monday to Friday at the chosen time', () => {
    for (const date of ['2026-10-01', '2026-10-02', '2026-10-05']) {
      const decision = decideDispatch({
        candidate: makeCandidate(),
        day: makeDay(),
        logDate: date,
        now: at(date, '18:00'),
      })
      expect(decision, date).toMatchObject({ kind: 'SEND', channel: 'EMAIL' })
    }
  })

  it('never sends on a Sunday, whatever the Saturday setting', () => {
    for (const includeSaturday of [true, false]) {
      const decision = decideDispatch({
        candidate: makeCandidate({ includeSaturday }),
        day: makeDay(),
        logDate: '2026-10-04',
        now: at('2026-10-04', '18:00'),
      })
      expect(decision).toMatchObject({ kind: 'SKIP', reason: 'NON_WORKING_DAY' })
    }
  })

  it('skips Saturday by default and sends it when opted in', () => {
    const saturday = { logDate: '2026-10-03', now: at('2026-10-03', '18:00') }

    expect(
      decideDispatch({ candidate: makeCandidate(), day: makeDay(), ...saturday }),
    ).toMatchObject({ kind: 'SKIP', reason: 'NON_WORKING_DAY' })

    expect(
      decideDispatch({
        candidate: makeCandidate({ includeSaturday: true }),
        day: makeDay(),
        ...saturday,
      }),
    ).toMatchObject({ kind: 'SEND' })
  })
})

describe('decideDispatch — time of day', () => {
  it('defers before the chosen time and sends from it onwards', () => {
    const base = { candidate: makeCandidate(), day: makeDay(), logDate: '2026-10-05' }

    expect(decideDispatch({ ...base, now: at('2026-10-05', '17:59') })).toMatchObject({
      kind: 'DEFER',
      reason: 'NOT_YET_DUE',
    })
    expect(decideDispatch({ ...base, now: at('2026-10-05', '18:00') })).toMatchObject({
      kind: 'SEND',
    })
  })

  it('honours a non-default time', () => {
    const candidate = makeCandidate({ time: '20:30' })
    const base = { candidate, day: makeDay(), logDate: '2026-10-05' }

    expect(decideDispatch({ ...base, now: at('2026-10-05', '20:29') })).toMatchObject({
      kind: 'DEFER',
    })
    expect(decideDispatch({ ...base, now: at('2026-10-05', '20:30') })).toMatchObject({
      kind: 'SEND',
    })
  })

  it('still sends late when the cron host was down through the evening', () => {
    // Better a 23:30 nudge than a silently missed day.
    expect(
      decideDispatch({
        candidate: makeCandidate(),
        day: makeDay(),
        logDate: '2026-10-05',
        now: at('2026-10-05', '23:30'),
      }),
    ).toMatchObject({ kind: 'SEND' })
  })
})

describe('decideDispatch — suppression', () => {
  it('does not re-send when the practitioner has already logged', () => {
    expect(
      decideDispatch({
        candidate: makeCandidate(),
        day: makeDay({ hasLogged: true }),
        logDate: '2026-10-05',
        now: at('2026-10-05', '18:00'),
      }),
    ).toMatchObject({ kind: 'SKIP', reason: 'ALREADY_LOGGED' })
  })

  it('suppresses a day marked done', () => {
    expect(
      decideDispatch({
        candidate: makeCandidate(),
        day: makeDay({ markedDoneAt: at('2026-10-05', '14:00') }),
        logDate: '2026-10-05',
        now: at('2026-10-05', '18:00'),
      }),
    ).toMatchObject({ kind: 'SKIP', reason: 'MARKED_DONE' })
  })

  it('skips a practitioner who is not opted in', () => {
    expect(
      decideDispatch({
        candidate: makeCandidate({ channel: 'NONE' }),
        day: makeDay(),
        logDate: '2026-10-05',
        now: at('2026-10-05', '18:00'),
      }),
    ).toMatchObject({ kind: 'SKIP', reason: 'NOT_OPTED_IN', channel: 'NONE' })
  })
})

describe('decideDispatch — snooze', () => {
  it('defers while a snooze is running, then sends once it lapses', () => {
    const day = makeDay({ snoozedUntil: at('2026-10-05', '18:30') })
    const base = { candidate: makeCandidate(), day, logDate: '2026-10-05' }

    // This is the case that would be silently broken by recording a SKIPPED
    // row: the unique key would be burnt and 18:31 would never fire.
    expect(decideDispatch({ ...base, now: at('2026-10-05', '18:05') })).toMatchObject({
      kind: 'DEFER',
      reason: 'SNOOZED',
    })
    expect(decideDispatch({ ...base, now: at('2026-10-05', '18:31') })).toMatchObject({
      kind: 'SEND',
    })
  })

  it('treats a snooze that outlives the SAST day as final', () => {
    expect(
      decideDispatch({
        candidate: makeCandidate(),
        // 22:00 + 6h, the schema maximum, lands past midnight.
        day: makeDay({ snoozedUntil: at('2026-10-06', '04:00') }),
        logDate: '2026-10-05',
        now: at('2026-10-05', '22:00'),
      }),
    ).toMatchObject({ kind: 'SKIP', reason: 'SNOOZED' })
  })

  it('does not let yesterday’s snooze suppress today', () => {
    // DayOverride is keyed on logDate, so today starts clean.
    expect(
      decideDispatch({
        candidate: makeCandidate(),
        day: makeDay(),
        logDate: '2026-10-06',
        now: at('2026-10-06', '18:00'),
      }),
    ).toMatchObject({ kind: 'SEND' })
  })
})

describe('decideDispatch — precedence', () => {
  it('reports the most informative reason when several apply', () => {
    // Sunday beats everything: the day was never a sending day.
    expect(
      decideDispatch({
        candidate: makeCandidate(),
        day: makeDay({ hasLogged: true, markedDoneAt: new Date() }),
        logDate: '2026-10-04',
        now: at('2026-10-04', '18:00'),
      }),
    ).toMatchObject({ reason: 'NON_WORKING_DAY' })

    // A real log outranks a "done for today" tap.
    expect(
      decideDispatch({
        candidate: makeCandidate(),
        day: makeDay({ hasLogged: true, markedDoneAt: new Date() }),
        logDate: '2026-10-05',
        now: at('2026-10-05', '18:00'),
      }),
    ).toMatchObject({ reason: 'ALREADY_LOGGED' })
  })
})

describe('dueAtFor', () => {
  it('resolves the practitioner’s wall time on the given SAST date', () => {
    expect(
      dueAtFor(makeCandidate({ time: '06:15' }), '2026-10-05').toISOString(),
    ).toBe('2026-10-05T04:15:00.000Z')
  })
})

describe('nextReminderAt', () => {
  it('returns today when the reminder is still to come', () => {
    expect(
      nextReminderAt({
        candidate: makeCandidate(),
        day: makeDay(),
        now: at('2026-10-05', '09:00'),
      })?.toISOString(),
    ).toBe(at('2026-10-05', '18:00').toISOString())
  })

  it('rolls to the next weekday once today is done', () => {
    // Friday evening, already logged → Monday.
    expect(
      nextReminderAt({
        candidate: makeCandidate(),
        day: makeDay({ hasLogged: true }),
        now: at('2026-10-02', '19:00'),
      })?.toISOString(),
    ).toBe(at('2026-10-05', '18:00').toISOString())
  })

  it('offers Saturday only to practitioners who opted in', () => {
    const fridayLate = at('2026-10-02', '19:00')

    expect(
      nextReminderAt({ candidate: makeCandidate(), now: fridayLate })?.toISOString(),
    ).toBe(at('2026-10-05', '18:00').toISOString())

    expect(
      nextReminderAt({
        candidate: makeCandidate({ includeSaturday: true }),
        now: fridayLate,
      })?.toISOString(),
    ).toBe(at('2026-10-03', '18:00').toISOString())
  })

  it('fires when a snooze lapses rather than at the original time', () => {
    expect(
      nextReminderAt({
        candidate: makeCandidate(),
        day: makeDay({ snoozedUntil: at('2026-10-05', '18:45') }),
        now: at('2026-10-05', '18:15'),
      })?.toISOString(),
    ).toBe(at('2026-10-05', '18:45').toISOString())
  })

  it('points at the first day of the collection window before it opens', () => {
    // Today is September: the honest answer is "1 October", not "tonight".
    expect(
      nextReminderAt({
        candidate: makeCandidate(),
        now: at('2026-09-20', '12:00'),
      })?.toISOString(),
    ).toBe(at('2026-10-01', '18:00').toISOString())
  })

  it('returns null after the window closes, and for opted-out practitioners', () => {
    expect(
      nextReminderAt({ candidate: makeCandidate(), now: at('2026-11-02', '09:00') }),
    ).toBeNull()

    expect(
      nextReminderAt({
        candidate: makeCandidate({ channel: 'NONE' }),
        now: at('2026-10-05', '09:00'),
      }),
    ).toBeNull()
  })
})
