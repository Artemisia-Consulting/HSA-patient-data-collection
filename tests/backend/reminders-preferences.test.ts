import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createPractitioner, initTestDb, issueSession, resetDb } from './helpers/db'
import { apiRequest, readJson } from './helpers/request'

import { apiErrorSchema, reminderStatusResponseSchema } from '@/lib/contract'
import { prisma } from '@/lib/db'
import { GET, PUT } from '@/app/api/reminders/preferences/route'

beforeAll(async () => {
  await initTestDb()
})

beforeEach(async () => {
  await resetDb()
})

describe('GET /api/reminders/preferences', () => {
  it('refuses to identify an anonymous caller', async () => {
    const response = await GET(apiRequest('/api/reminders/preferences'))
    expect(response.status).toBe(401)
  })

  it('answers with the stored preferences, on a session or a ?k= link', async () => {
    const practitioner = await createPractitioner()
    const token = await issueSession(practitioner.id)

    const byToken = await GET(apiRequest('/api/reminders/preferences', { token }))
    expect(byToken.status).toBe(200)
    expect(
      reminderStatusResponseSchema.parse(await readJson(byToken)).preferences,
    ).toMatchObject({ channel: 'NONE', time: '18:00' })

    const byLink = await GET(
      apiRequest(`/api/reminders/preferences?k=${practitioner.reminderLinkId}`),
    )
    expect(byLink.status).toBe(200)
  })
})

describe('PUT /api/reminders/preferences — the one-off question (FR7)', () => {
  it('stamps reminderChoiceAt when the answer is "no reminders"', async () => {
    const practitioner = await createPractitioner()
    const token = await issueSession(practitioner.id)

    const response = await PUT(
      apiRequest('/api/reminders/preferences', {
        method: 'PUT',
        token,
        body: { channel: 'NONE', time: '18:00', includeSaturday: false },
      }),
    )
    expect(response.status).toBe(200)

    const stored = await prisma.practitioner.findUniqueOrThrow({
      where: { id: practitioner.id },
    })
    expect(stored.reminderChannel).toBe('NONE')
    // "None" is a deliberate answer, not a shrug: the app must never re-ask.
    expect(stored.reminderChoiceAt).toBeInstanceOf(Date)
  })

  it('stamps reminderChoiceAt and reminderOptInAt on an email opt-in', async () => {
    const practitioner = await createPractitioner()
    const token = await issueSession(practitioner.id)

    const response = await PUT(
      apiRequest('/api/reminders/preferences', {
        method: 'PUT',
        token,
        body: { channel: 'EMAIL', time: '19:00', includeSaturday: true },
      }),
    )
    expect(response.status).toBe(200)
    expect(
      reminderStatusResponseSchema.parse(await readJson(response)).preferences,
    ).toEqual({ channel: 'EMAIL', time: '19:00', includeSaturday: true })

    const stored = await prisma.practitioner.findUniqueOrThrow({
      where: { id: practitioner.id },
    })
    expect(stored.reminderOptInAt).toBeInstanceOf(Date)
    expect(stored.reminderChoiceAt).toBeInstanceOf(Date)
  })

  it('never re-stamps reminderChoiceAt on a later save', async () => {
    const answeredAt = new Date('2026-09-01T08:00:00.000Z')
    const practitioner = await createPractitioner({ reminderChoiceAt: answeredAt })
    const token = await issueSession(practitioner.id)

    const response = await PUT(
      apiRequest('/api/reminders/preferences', {
        method: 'PUT',
        token,
        body: { channel: 'EMAIL', time: '18:30', includeSaturday: false },
      }),
    )
    expect(response.status).toBe(200)

    const stored = await prisma.practitioner.findUniqueOrThrow({
      where: { id: practitioner.id },
    })
    // The first answer is the answer; later edits change preferences, not the
    // fact that the question was settled on that date.
    expect(stored.reminderChoiceAt?.toISOString()).toBe(answeredAt.toISOString())
  })

  it('no longer accepts WhatsApp as a channel', async () => {
    const practitioner = await createPractitioner()
    const token = await issueSession(practitioner.id)

    const response = await PUT(
      apiRequest('/api/reminders/preferences', {
        method: 'PUT',
        token,
        body: { channel: 'WHATSAPP', time: '18:00', includeSaturday: false },
      }),
    )
    expect(response.status).toBe(400)
    expect(apiErrorSchema.parse(await readJson(response)).error.code).toBe(
      'VALIDATION_FAILED',
    )
  })
})
