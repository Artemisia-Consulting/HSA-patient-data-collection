/**
 * The dispatch engine: what gets written, what gets sent, and what happens
 * when a run is repeated or a send fails.
 *
 * The engine takes its store, its channels and its clock as arguments, so
 * none of this needs a database, an SMTP server or a wait until 18:00.
 */
import { describe, expect, it } from 'vitest'

import { sastDateTimeToInstant } from '../../src/lib/dates'
import { runDispatch } from '../../src/lib/reminders/dispatch'
import { fixedClock } from '../../src/lib/reminders/types'
import type { DayState, ReminderCandidate } from '../../src/lib/reminders/types'
import {
  createFakeAdapter,
  createFakeStore,
  makeCandidate,
  makeDay,
  type FakeAdapter,
} from './fakes'

const at = sastDateTimeToInstant
const APP_URL = 'https://log.hsa.example'

function setup(options: {
  candidates: ReminderCandidate[]
  days?: Map<string, DayState>
  email?: FakeAdapter
  whatsapp?: FakeAdapter
}) {
  const email = options.email ?? createFakeAdapter({ channel: 'EMAIL' })
  const whatsapp =
    options.whatsapp ?? createFakeAdapter({ channel: 'WHATSAPP', configured: false })
  const store = createFakeStore(options.candidates, options.days)
  return {
    store,
    email,
    whatsapp,
    registry: { EMAIL: email, WHATSAPP: whatsapp },
  }
}

describe('runDispatch — the happy path', () => {
  it('sends on a weekday at the chosen time and records SENT', async () => {
    const { store, email, registry } = setup({ candidates: [makeCandidate()] })

    const summary = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:00')),
    })

    expect(summary).toMatchObject({
      forDate: '2026-10-05',
      considered: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      deferred: 0,
    })
    expect(email.sent).toHaveLength(1)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({
      status: 'SENT',
      channel: 'EMAIL',
      logDate: '2026-10-05',
    })
    expect(store.rows[0].sentAt).not.toBeNull()
  })

  it('carries the personalised ?k= link and nothing clinical', async () => {
    const { email, registry, store } = setup({
      candidates: [makeCandidate({ reminderLinkId: 'abc123', fullName: 'Thandi Mokoena' })],
    })

    await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:00')),
    })

    const message = email.sent[0]
    expect(message.link).toBe(`${APP_URL}/log?k=abc123`)
    expect(message.manageLink).toBe(`${APP_URL}/reminders?k=abc123`)
    expect(message.greetingName).toBe('Thandi')
    // The message payload is identity + date + link. There is no field that
    // could carry a patient count or a condition, by construction.
    expect(Object.keys(message).sort()).toEqual([
      'greetingName',
      'link',
      'logDate',
      'manageLink',
      'practitionerId',
      'recipient',
    ])
  })

  it('masks the recipient in run output', async () => {
    const { registry, store } = setup({
      candidates: [makeCandidate({ email: 'thandi@example.org' })],
    })

    const summary = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:00')),
    })

    const sent = summary.events.find((event) => event.type === 'SENT')
    // Practitioner.email is the only personal datum in the system; it must
    // not turn up in a log line an operator pastes into a ticket.
    expect(sent).toMatchObject({ recipient: 't*****@example.org' })
    expect(JSON.stringify(summary.events)).not.toContain('thandi@example.org')
  })
})

describe('runDispatch — the double-send guard', () => {
  it('sends once when the same minute is dispatched twice', async () => {
    const { store, email, registry } = setup({ candidates: [makeCandidate()] })
    const clock = fixedClock(at('2026-10-05', '18:00'))

    const first = await runDispatch({ store, registry, appUrl: APP_URL, clock })
    const second = await runDispatch({ store, registry, appUrl: APP_URL, clock })

    expect(first.sent).toBe(1)
    expect(second.sent).toBe(0)
    expect(email.sent).toHaveLength(1)
    expect(store.rows).toHaveLength(1)
    expect(second.events[0]).toMatchObject({ type: 'CLAIMED_ELSEWHERE' })
  })

  it('sends once across every tick of the evening', async () => {
    const { store, email, registry } = setup({ candidates: [makeCandidate()] })

    for (const minute of ['17:58', '17:59', '18:00', '18:01', '18:02', '19:30']) {
      await runDispatch({
        store,
        registry,
        appUrl: APP_URL,
        clock: fixedClock(at('2026-10-05', minute)),
      })
    }

    expect(email.sent).toHaveLength(1)
    expect(store.rows.filter((row) => row.status === 'SENT')).toHaveLength(1)
  })

  it('claims before sending, so a crashed send still holds the slot', async () => {
    const email = createFakeAdapter({ channel: 'EMAIL', fail: 'SMTP timeout' })
    const { store, registry } = setup({ candidates: [makeCandidate()], email })
    const clock = fixedClock(at('2026-10-05', '18:00'))

    const first = await runDispatch({ store, registry, appUrl: APP_URL, clock })
    const second = await runDispatch({ store, registry, appUrl: APP_URL, clock })

    expect(first.failed).toBe(1)
    expect(store.rows[0]).toMatchObject({ status: 'FAILED', error: 'SMTP timeout' })
    // A failure is not retried on the same channel the same day: we cannot
    // tell a failed send from a delivered one that reported an error.
    expect(second.sent).toBe(0)
    expect(second.failed).toBe(0)
  })
})

describe('runDispatch — suppression and the audit trail', () => {
  it('records a skip reason rather than going quiet', async () => {
    const cases: Array<[string, DayState, string]> = [
      ['already logged', makeDay({ hasLogged: true }), 'ALREADY_LOGGED'],
      ['marked done', makeDay({ markedDoneAt: at('2026-10-05', '15:00') }), 'MARKED_DONE'],
      ['snoozed past midnight', makeDay({ snoozedUntil: at('2026-10-06', '03:00') }), 'SNOOZED'],
    ]

    for (const [label, day, reason] of cases) {
      const days = new Map([['prac-1', day]])
      const { store, email, registry } = setup({ candidates: [makeCandidate()], days })

      const summary = await runDispatch({
        store,
        registry,
        appUrl: APP_URL,
        clock: fixedClock(at('2026-10-05', '18:00')),
      })

      expect(summary.skipped, label).toBe(1)
      expect(email.sent, label).toHaveLength(0)
      expect(store.rows[0], label).toMatchObject({
        status: 'SKIPPED',
        skipReason: reason,
      })
    }
  })

  it('records NON_WORKING_DAY on a Sunday and NOT_OPTED_IN for an opt-out', async () => {
    const { store, registry } = setup({
      candidates: [
        makeCandidate({ practitionerId: 'p-sunday' }),
        makeCandidate({ practitionerId: 'p-optout', channel: 'NONE' }),
      ],
    })

    await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-04', '18:00')),
    })

    expect(store.rowsFor('p-sunday')[0]).toMatchObject({
      status: 'SKIPPED',
      skipReason: 'NON_WORKING_DAY',
      channel: 'EMAIL',
    })
    // Opting out is checked before the calendar, so an opted-out
    // practitioner reads NOT_OPTED_IN even on a Sunday. That is the more
    // informative answer to "why did this person get nothing?".
    expect(store.rowsFor('p-optout')[0]).toMatchObject({
      skipReason: 'NOT_OPTED_IN',
      channel: 'NONE',
    })
  })

  it('records NOT_OPTED_IN against the NONE channel on a working day', async () => {
    const { store, registry } = setup({
      candidates: [makeCandidate({ channel: 'NONE' })],
    })

    await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:00')),
    })

    expect(store.rows[0]).toMatchObject({
      status: 'SKIPPED',
      skipReason: 'NOT_OPTED_IN',
      channel: 'NONE',
    })
  })

  it('writes one skip row per day however many times the cron ticks', async () => {
    const days = new Map([['prac-1', makeDay({ hasLogged: true })]])
    const { store, registry } = setup({ candidates: [makeCandidate()], days })

    for (const minute of ['18:00', '18:01', '18:02']) {
      await runDispatch({
        store,
        registry,
        appUrl: APP_URL,
        clock: fixedClock(at('2026-10-05', minute)),
      })
    }

    expect(store.rows).toHaveLength(1)
  })
})

describe('runDispatch — deferral writes nothing', () => {
  it('leaves no row before the chosen time', async () => {
    const { store, email, registry } = setup({ candidates: [makeCandidate()] })

    const summary = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '09:00')),
    })

    expect(summary).toMatchObject({ considered: 1, sent: 0, skipped: 0, deferred: 1 })
    expect(store.rows).toHaveLength(0)
    expect(email.sent).toHaveLength(0)
  })

  it('still delivers after a snooze lapses — the regression that matters', async () => {
    // If a running snooze were recorded as SKIPPED, the unique key would be
    // spent and this send would never happen.
    const days = new Map([['prac-1', makeDay({ snoozedUntil: at('2026-10-05', '18:30') })]])
    const { store, email, registry } = setup({ candidates: [makeCandidate()], days })

    const during = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:10')),
    })
    expect(during.deferred).toBe(1)
    expect(store.rows).toHaveLength(0)

    const after = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:31')),
    })
    expect(after.sent).toBe(1)
    expect(email.sent).toHaveLength(1)
  })
})

describe('runDispatch — graceful degradation', () => {
  it('falls back to email when WhatsApp credentials are absent', async () => {
    const whatsapp = createFakeAdapter({ channel: 'WHATSAPP', configured: false })
    const { store, email, registry } = setup({
      candidates: [makeCandidate({ channel: 'WHATSAPP', whatsappNumber: '+27821234567' })],
      whatsapp,
    })

    const summary = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:00')),
    })

    expect(summary.sent).toBe(1)
    expect(whatsapp.sent).toHaveLength(0)
    expect(email.sent).toHaveLength(1)
    // The audit row names the channel actually used, not the one preferred.
    expect(store.rows[0]).toMatchObject({ status: 'SENT', channel: 'EMAIL' })
    expect(summary.events[0]).toMatchObject({ type: 'SENT', fellBack: true })
  })

  it('uses WhatsApp when it is configured and a number is on file', async () => {
    const whatsapp = createFakeAdapter({ channel: 'WHATSAPP', configured: true })
    const { store, email, registry } = setup({
      candidates: [makeCandidate({ channel: 'WHATSAPP', whatsappNumber: '+27821234567' })],
      whatsapp,
    })

    await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:00')),
    })

    expect(whatsapp.sent).toHaveLength(1)
    expect(whatsapp.sent[0].recipient).toBe('+27821234567')
    expect(email.sent).toHaveLength(0)
    expect(store.rows[0]).toMatchObject({ channel: 'WHATSAPP', status: 'SENT' })
  })

  it('records FAILED with the reason when no channel can carry the message', async () => {
    const email = createFakeAdapter({ channel: 'EMAIL', configured: false })
    const whatsapp = createFakeAdapter({ channel: 'WHATSAPP', configured: false })
    const { store, registry } = setup({
      candidates: [makeCandidate({ channel: 'WHATSAPP', whatsappNumber: '+27821234567' })],
      email,
      whatsapp,
    })

    const summary = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:00')),
    })

    expect(summary.failed).toBe(1)
    expect(store.rows[0].status).toBe('FAILED')
    expect(store.rows[0].error).toContain('not configured')
  })

  it('one practitioner’s failure does not cost the others their reminder', async () => {
    let call = 0
    const email = createFakeAdapter({ channel: 'EMAIL' })
    const originalSend = email.send.bind(email)
    email.send = async (message) => {
      call += 1
      if (call === 1) throw new Error('mailbox full')
      await originalSend(message)
    }

    const { store, registry } = setup({
      candidates: [
        makeCandidate({ practitionerId: 'p1', email: 'one@example.org' }),
        makeCandidate({ practitionerId: 'p2', email: 'two@example.org' }),
        makeCandidate({ practitionerId: 'p3', email: 'three@example.org' }),
      ],
      email,
    })

    const summary = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-10-05', '18:00')),
    })

    expect(summary).toMatchObject({ considered: 3, sent: 2, failed: 1 })
    expect(store.rowsFor('p1')[0]).toMatchObject({
      status: 'FAILED',
      error: 'mailbox full',
    })
    expect(store.rowsFor('p2')[0].status).toBe('SENT')
    expect(store.rowsFor('p3')[0].status).toBe('SENT')
  })
})

describe('runDispatch — guards', () => {
  it('does nothing outside the October 2026 collection window', async () => {
    const { store, email, registry } = setup({ candidates: [makeCandidate()] })

    const summary = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      clock: fixedClock(at('2026-09-30', '18:00')),
    })

    expect(summary.outsideCollectionWindow).toBe(true)
    expect(summary).toMatchObject({ considered: 0, sent: 0, skipped: 0, failed: 0 })
    expect(store.rows).toHaveLength(0)
    expect(email.sent).toHaveLength(0)
  })

  it('sends outside the window when explicitly forced', async () => {
    const { store, email, registry } = setup({ candidates: [makeCandidate()] })

    const summary = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      ignoreWindow: true,
      clock: fixedClock(at('2026-09-30', '18:00')),
    })

    expect(summary.sent).toBe(1)
    expect(email.sent).toHaveLength(1)
    expect(store.rows).toHaveLength(1)
  })

  it('dry run decides everything and writes nothing', async () => {
    const days = new Map([['p2', makeDay({ hasLogged: true })]])
    const { store, email, registry } = setup({
      candidates: [
        makeCandidate({ practitionerId: 'p1' }),
        makeCandidate({ practitionerId: 'p2' }),
      ],
      days,
    })

    const summary = await runDispatch({
      store,
      registry,
      appUrl: APP_URL,
      dryRun: true,
      clock: fixedClock(at('2026-10-05', '18:00')),
    })

    expect(summary).toMatchObject({ considered: 2, sent: 1, skipped: 1, dryRun: true })
    expect(store.rows).toHaveLength(0)
    expect(email.sent).toHaveLength(0)
  })
})
