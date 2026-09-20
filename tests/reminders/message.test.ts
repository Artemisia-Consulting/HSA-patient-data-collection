/**
 * Personalised links and message bodies.
 *
 * The POPIA assertions here are about what a reminder is *allowed* to say.
 * The strongest guarantee is structural — `ReminderMessage` has no field that
 * could hold clinical data — but these checks catch anyone widening it later.
 */
import { describe, expect, it } from 'vitest'

import {
  buildLogLink,
  buildManageLink,
  emailHtml,
  emailSubject,
  emailText,
  greetingNameFor,
  maskRecipient,
  whatsappText,
} from '../../src/lib/reminders/message'

const message = {
  practitionerId: 'p1',
  recipient: 'thandi@example.org',
  greetingName: 'Thandi',
  logDate: '2026-10-05',
  link: 'https://log.hsa.example/log?k=abc123',
  manageLink: 'https://log.hsa.example/reminders?k=abc123',
}

describe('personalised links', () => {
  it('builds the one-tap log link from NEXT_PUBLIC_APP_URL', () => {
    expect(buildLogLink('https://log.hsa.example', 'abc123')).toBe(
      'https://log.hsa.example/log?k=abc123',
    )
    expect(buildManageLink('https://log.hsa.example', 'abc123')).toBe(
      'https://log.hsa.example/reminders?k=abc123',
    )
  })

  it('tolerates a trailing slash on the configured app URL', () => {
    expect(buildLogLink('https://log.hsa.example/', 'abc123')).toBe(
      'https://log.hsa.example/log?k=abc123',
    )
  })

  it('url-encodes the link id', () => {
    expect(buildLogLink('https://x.test', 'a b/c')).toBe('https://x.test/log?k=a%20b%2Fc')
  })
})

describe('greetingNameFor', () => {
  it('uses the first name and copes with an empty one', () => {
    expect(greetingNameFor('Thandi Mokoena')).toBe('Thandi')
    expect(greetingNameFor('  Sipho  ')).toBe('Sipho')
    expect(greetingNameFor('   ')).toBe('there')
  })
})

describe('message bodies', () => {
  it('names the date and carries the personalised link', () => {
    expect(emailSubject('2026-10-05')).toBe('Your HSA daily log — Mon, 5 Oct 2026')
    expect(emailText(message)).toContain(message.link)
    expect(emailText(message)).toContain('Mon, 5 Oct 2026')
    expect(whatsappText(message)).toContain(message.link)
  })

  it('explains "Done for today" without inviting a fabricated zero', () => {
    const text = emailText(message)
    expect(text).toContain('Done for today')
    expect(text).toContain('without logging a zero')
  })

  it('says nothing about patients, conditions or counts', () => {
    const forbidden = [
      'patient name',
      'condition',
      'diagnosis',
      'HIV',
      'TB',
      'new patients',
      'follow-up patients',
    ]
    for (const body of [emailText(message), emailHtml(message), whatsappText(message)]) {
      for (const term of forbidden) {
        expect(body.toLowerCase(), term).not.toContain(term.toLowerCase())
      }
    }
  })

  it('escapes the name and link in the HTML body', () => {
    const html = emailHtml({
      ...message,
      greetingName: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('maskRecipient', () => {
  it('hides the local part of an email and most of a phone number', () => {
    expect(maskRecipient('thandi@example.org')).toBe('t*****@example.org')
    expect(maskRecipient('a@example.org')).toBe('a*@example.org')
    expect(maskRecipient('+27821234567')).toBe('*********567')
  })
})
