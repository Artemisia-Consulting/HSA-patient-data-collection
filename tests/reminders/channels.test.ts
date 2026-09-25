/**
 * Channel resolution and the CRON_SECRET check.
 *
 * What this cannot do is prove a message arrives. The email adapter is not
 * exercised at all — see the "what is NOT tested" section of
 * docs/streams/reminders.md.
 */
import { describe, expect, it } from 'vitest'

import { secretsMatch } from '../../src/lib/reminders/config'
import { createChannelRegistry, resolveChannel } from '../../src/lib/reminders/channels'
import { createFakeAdapter, makeCandidate } from './fakes'

function registry(options: { emailConfigured: boolean }) {
  return {
    EMAIL: createFakeAdapter({ channel: 'EMAIL', configured: options.emailConfigured }),
  }
}

describe('resolveChannel', () => {
  it('resolves email for an opted-in practitioner with an address', () => {
    const result = resolveChannel(
      makeCandidate({ channel: 'EMAIL' }),
      registry({ emailConfigured: true }),
    )

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.resolved.adapter.channel).toBe('EMAIL')
    expect(result.resolved.recipient).toBe('practitioner@example.org')
  })

  it('reports why, rather than throwing, when SMTP is absent', () => {
    const result = resolveChannel(
      makeCandidate({ channel: 'EMAIL' }),
      registry({ emailConfigured: false }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('email is not configured')
  })

  it('reports why when the practitioner has no address on file', () => {
    const result = resolveChannel(
      makeCandidate({ channel: 'EMAIL', email: '' }),
      registry({ emailConfigured: true }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('no address on file')
  })

  it('does not resolve a channel for an opted-out practitioner', () => {
    const result = resolveChannel(
      makeCandidate({ channel: 'NONE' }),
      registry({ emailConfigured: true }),
    )
    expect(result.ok).toBe(false)
  })
})

describe('createChannelRegistry', () => {
  it('reports email as unconfigured when the env is empty', () => {
    const built = createChannelRegistry({ appUrl: 'http://x', smtp: null })
    expect(built.EMAIL.isConfigured()).toBe(false)
  })
})

describe('secretsMatch', () => {
  it('accepts an exact match and rejects everything else', () => {
    expect(secretsMatch('s3cr3t', 's3cr3t')).toBe(true)
    expect(secretsMatch('s3cr3T', 's3cr3t')).toBe(false)
    expect(secretsMatch('s3cr3', 's3cr3t')).toBe(false)
    expect(secretsMatch('', 's3cr3t')).toBe(false)
  })
})
