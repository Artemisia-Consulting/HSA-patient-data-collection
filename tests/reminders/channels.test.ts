/**
 * Channel resolution, the WhatsApp request shape, and the CRON_SECRET check.
 *
 * What this cannot do is prove a message arrives. `createWhatsAppAdapter`
 * is tested against an injected fetch, and the email adapter is not exercised
 * at all — see the "what is NOT tested" section of docs/streams/reminders.md.
 */
import { describe, expect, it, vi } from 'vitest'

import { readWhatsAppConfig, secretsMatch } from '../../src/lib/reminders/config'
import { createChannelRegistry, resolveChannel } from '../../src/lib/reminders/channels'
import {
  buildWhatsAppPayload,
  createWhatsAppAdapter,
  type FetchLike,
} from '../../src/lib/reminders/channels/whatsapp'
import { createFakeAdapter, makeCandidate } from './fakes'

function registry(options: {
  emailConfigured: boolean
  whatsappConfigured: boolean
}) {
  return {
    EMAIL: createFakeAdapter({ channel: 'EMAIL', configured: options.emailConfigured }),
    WHATSAPP: createFakeAdapter({
      channel: 'WHATSAPP',
      configured: options.whatsappConfigured,
    }),
  }
}

describe('resolveChannel', () => {
  it('uses the declared channel when it is usable', () => {
    const result = resolveChannel(
      makeCandidate({ channel: 'WHATSAPP', whatsappNumber: '+27821234567' }),
      registry({ emailConfigured: true, whatsappConfigured: true }),
    )

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.resolved.adapter.channel).toBe('WHATSAPP')
    expect(result.resolved.fellBack).toBe(false)
  })

  it('falls back to email when WhatsApp is unconfigured', () => {
    const result = resolveChannel(
      makeCandidate({ channel: 'WHATSAPP', whatsappNumber: '+27821234567' }),
      registry({ emailConfigured: true, whatsappConfigured: false }),
    )

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.resolved.adapter.channel).toBe('EMAIL')
    expect(result.resolved.fellBack).toBe(true)
  })

  it('falls back when WhatsApp is configured but the number is missing', () => {
    const result = resolveChannel(
      makeCandidate({ channel: 'WHATSAPP', whatsappNumber: null }),
      registry({ emailConfigured: true, whatsappConfigured: true }),
    )

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.resolved.adapter.channel).toBe('EMAIL')
  })

  it('reports why, rather than throwing, when nothing is usable', () => {
    const result = resolveChannel(
      makeCandidate({ channel: 'WHATSAPP', whatsappNumber: '+27821234567' }),
      registry({ emailConfigured: false, whatsappConfigured: false }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('WHATSAPP is not configured')
    expect(result.error).toContain('email fallback is not configured')
  })

  it('does not resolve a channel for an opted-out practitioner', () => {
    const result = resolveChannel(
      makeCandidate({ channel: 'NONE' }),
      registry({ emailConfigured: true, whatsappConfigured: true }),
    )
    expect(result.ok).toBe(false)
  })
})

describe('createChannelRegistry', () => {
  it('reports both channels as unconfigured when the env is empty', () => {
    const built = createChannelRegistry({ appUrl: 'http://x', smtp: null, whatsapp: null })
    expect(built.EMAIL.isConfigured()).toBe(false)
    expect(built.WHATSAPP.isConfigured()).toBe(false)
  })
})

describe('readWhatsAppConfig', () => {
  it('treats a half-configured WhatsApp as absent', () => {
    // A phone number id with no token would 401 at send time; better to
    // report "not configured" up front and let the email fallback take over.
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123')
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '')
    expect(readWhatsAppConfig()).toBeNull()

    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'token')
    expect(readWhatsAppConfig()).toMatchObject({ phoneNumberId: '123' })
    vi.unstubAllEnvs()
  })
})

describe('WhatsApp adapter', () => {
  const config = {
    phoneNumberId: '555',
    accessToken: 'secret-token',
    templateName: 'hsa_daily_log_reminder',
    graphVersion: 'v21.0',
  }

  const message = {
    practitionerId: 'p1',
    recipient: '+27821234567',
    greetingName: 'Thandi',
    logDate: '2026-10-05',
    link: 'https://log.hsa.example/log?k=abc123',
    manageLink: 'https://log.hsa.example/reminders?k=abc123',
  }

  it('passes only the query suffix as the URL button parameter', () => {
    const payload = buildWhatsAppPayload(config, message) as {
      template: { components: Array<{ type: string; parameters: Array<{ text: string }> }> }
    }
    const button = payload.template.components.find((part) => part.type === 'button')
    // The approved template holds the base URL; sending the whole link here
    // would produce a doubled path.
    expect(button?.parameters[0].text).toBe('k=abc123')
  })

  it('sends a plain text message when no template is configured', () => {
    const payload = buildWhatsAppPayload({ ...config, templateName: '' }, message) as {
      type: string
      text: { body: string }
    }
    expect(payload.type).toBe('text')
    expect(payload.text.body).toContain(message.link)
  })

  it('posts to the pinned Graph version with a bearer token', async () => {
    const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return { ok: true, status: 200, text: async () => '{}' }
    }

    await createWhatsAppAdapter(config, fetchImpl).send(message)

    expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/555/messages')
    expect(calls[0].init.headers.authorization).toBe('Bearer secret-token')
  })

  it('throws with the API reason so the run can record FAILED', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid OAuth access token"}}',
    })

    await expect(createWhatsAppAdapter(config, fetchImpl).send(message)).rejects.toThrow(
      /401.*Invalid OAuth access token/,
    )
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
