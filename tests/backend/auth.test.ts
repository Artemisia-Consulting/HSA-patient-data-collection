import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createPractitioner, initTestDb, issueSession, resetDb } from './helpers/db'
import { apiRequest, readJson, sessionCookieValue } from './helpers/request'

import {
  apiErrorSchema,
  authSessionResponseSchema,
  meResponseSchema,
  SESSION_COOKIE_NAME,
} from '@/lib/contract'
import { prisma } from '@/lib/db'
import { hashSessionToken } from '@/lib/server/auth'
import { resetRateLimits } from '@/lib/server/rateLimit'
import { POST as signup } from '@/app/api/auth/signup/route'
import { POST as resume } from '@/app/api/auth/resume/route'
import { GET as me } from '@/app/api/auth/me/route'
import { POST as onboarded } from '@/app/api/auth/onboarded/route'

const validSignup = {
  email: 'thandi@example.org',
  fullName: 'Thandi Mokoena',
  practiceName: 'Rosebank Homoeopathy',
  province: 'Gauteng',
  consent: true as const,
}

beforeAll(async () => {
  await initTestDb()
})

beforeEach(async () => {
  await resetDb()
  resetRateLimits()
})

describe('POST /api/auth/signup — input validation (FR1)', () => {
  it('rejects a malformed email with 400 and a field error', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', { body: { ...validSignup, email: 'not-an-email' } }),
      undefined,
    )
    expect(response.status).toBe(400)

    const body = apiErrorSchema.parse(await readJson(response))
    expect(body.error.code).toBe('VALIDATION_FAILED')
    expect(body.error.fieldErrors?.email).toBeDefined()
  })

  it('rejects an unticked consent box', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', { body: { ...validSignup, consent: false } }),
      undefined,
    )
    expect(response.status).toBe(400)
    const body = apiErrorSchema.parse(await readJson(response))
    expect(body.error.fieldErrors?.consent).toBeDefined()
  })

  it('rejects a one-character name', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', { body: { ...validSignup, fullName: 'X' } }),
      undefined,
    )
    expect(response.status).toBe(400)
  })

  it('returns 400 rather than crashing on a body that is not JSON', async () => {
    const request = new Request('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'this is not json',
    })
    const response = await signup(request, undefined)
    expect(response.status).toBe(400)
    expect(apiErrorSchema.parse(await readJson(response)).error.code).toBe(
      'VALIDATION_FAILED',
    )
  })

  it('ignores a role smuggled into the body — no self-promotion to researcher', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', {
        body: { ...validSignup, role: 'RESEARCHER' },
      }),
      undefined,
    )
    expect(response.status).toBe(201)
    const body = authSessionResponseSchema.parse(await readJson(response))
    expect(body.practitioner.role).toBe('PRACTITIONER')
  })
})

describe('POST /api/auth/signup — success (FR1, user story 1.6)', () => {
  it('creates the practitioner, returns 201 and sets the session cookie', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', { body: validSignup }),
      undefined,
    )
    expect(response.status).toBe(201)

    const body = authSessionResponseSchema.parse(await readJson(response))
    expect(body.practitioner.email).toBe('thandi@example.org')
    expect(body.reminderLink).toBe(
      `http://localhost:3000/log?k=${body.practitioner.reminderLinkId}`,
    )
    expect(sessionCookieValue(response)).toBe(body.sessionToken)

    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=lax')
  })

  it('records consent at signup', async () => {
    await signup(apiRequest('/api/auth/signup', { body: validSignup }), undefined)
    const practitioner = await prisma.practitioner.findUniqueOrThrow({
      where: { email: 'thandi@example.org' },
    })
    expect(practitioner.consentAt).toBeInstanceOf(Date)
  })

  it('stores only the SHA-256 hash of the session token', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', { body: validSignup }),
      undefined,
    )
    const body = authSessionResponseSchema.parse(await readJson(response))

    const session = await prisma.session.findFirstOrThrow()
    expect(session.tokenHash).not.toBe(body.sessionToken)
    expect(session.tokenHash).toBe(hashSessionToken(body.sessionToken))
    expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('treats addresses case-insensitively', async () => {
    await signup(apiRequest('/api/auth/signup', { body: validSignup }), undefined)
    const second = await signup(
      apiRequest('/api/auth/signup', {
        body: { ...validSignup, email: 'THANDI@Example.org' },
      }),
      undefined,
    )
    expect(second.status).toBe(409)
    expect(await prisma.practitioner.count()).toBe(1)
  })
})

describe('POST /api/auth/signup — duplicate email (rubric item 1, tier 3)', () => {
  it('answers 409 with a recovery instruction, not a session', async () => {
    await signup(apiRequest('/api/auth/signup', { body: validSignup }), undefined)

    const response = await signup(
      apiRequest('/api/auth/signup', { body: validSignup }),
      undefined,
    )
    expect(response.status).toBe(409)

    const body = apiErrorSchema.parse(await readJson(response))
    expect(body.error.code).toBe('EMAIL_ALREADY_REGISTERED')
    expect(body.error.fieldErrors?.email).toBeDefined()
    // The whole point: knowing an address must not get you in.
    expect(JSON.stringify(body)).not.toContain('sessionToken')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('does not leak the existing practitioner’s reminder link', async () => {
    const first = await signup(
      apiRequest('/api/auth/signup', { body: validSignup }),
      undefined,
    )
    const created = authSessionResponseSchema.parse(await readJson(first))

    const response = await signup(
      apiRequest('/api/auth/signup', { body: validSignup }),
      undefined,
    )
    const text = JSON.stringify(await readJson(response))
    expect(text).not.toContain(created.practitioner.reminderLinkId)
  })

  it('lets a practitioner who still holds their link re-signup and update details', async () => {
    const first = await signup(
      apiRequest('/api/auth/signup', { body: validSignup }),
      undefined,
    )
    const created = authSessionResponseSchema.parse(await readJson(first))

    const response = await signup(
      apiRequest(
        `/api/auth/signup?k=${created.practitioner.reminderLinkId}`,
        { body: { ...validSignup, practiceName: 'Sandton Homoeopathy' } },
      ),
      undefined,
    )
    expect(response.status).toBe(200)

    const body = authSessionResponseSchema.parse(await readJson(response))
    expect(body.practitioner.id).toBe(created.practitioner.id)
    expect(body.practitioner.practiceName).toBe('Sandton Homoeopathy')
    expect(await prisma.practitioner.count()).toBe(1)
  })
})

describe('POST /api/auth/resume (FR1, user story 2.1)', () => {
  it('issues a fresh session from a reminder link id', async () => {
    const practitioner = await createPractitioner()

    const response = await resume(
      apiRequest('/api/auth/resume', {
        body: { reminderLinkId: practitioner.reminderLinkId },
      }),
      undefined,
    )
    expect(response.status).toBe(200)

    const body = authSessionResponseSchema.parse(await readJson(response))
    expect(body.practitioner.id).toBe(practitioner.id)
    expect(sessionCookieValue(response)).toBe(body.sessionToken)
  })

  it('answers 401, not 404, for an unknown id so it is not an oracle', async () => {
    const response = await resume(
      apiRequest('/api/auth/resume', { body: { reminderLinkId: 'cl000000000unknown' } }),
      undefined,
    )
    expect(response.status).toBe(401)
    expect(apiErrorSchema.parse(await readJson(response)).error.code).toBe(
      'UNAUTHENTICATED',
    )
  })

  it('rejects a too-short id with 400', async () => {
    const response = await resume(
      apiRequest('/api/auth/resume', { body: { reminderLinkId: 'abc' } }),
      undefined,
    )
    expect(response.status).toBe(400)
  })

  it('rate-limits repeated attempts from one address', async () => {
    let last: Response | undefined
    for (let i = 0; i < 40; i += 1) {
      last = await resume(
        apiRequest('/api/auth/resume', {
          body: { reminderLinkId: `guess${i}0000000` },
          ip: '41.1.1.1',
        }),
        undefined,
      )
    }
    expect(last?.status).toBe(429)
  })
})

describe('GET /api/auth/me (FR1/FR3)', () => {
  it('401s with no credential at all', async () => {
    const response = await me(apiRequest('/api/auth/me'), undefined)
    expect(response.status).toBe(401)
    expect(apiErrorSchema.parse(await readJson(response)).error.code).toBe(
      'UNAUTHENTICATED',
    )
  })

  it('accepts a bearer token', async () => {
    const practitioner = await createPractitioner()
    const token = await issueSession(practitioner.id)

    const response = await me(apiRequest('/api/auth/me', { token }), undefined)
    expect(response.status).toBe(200)
    const body = meResponseSchema.parse(await readJson(response))
    expect(body.practitioner.id).toBe(practitioner.id)
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.hasLoggedToday).toBe(false)
  })

  it('accepts the hsa_session cookie', async () => {
    const practitioner = await createPractitioner()
    const token = await issueSession(practitioner.id)

    const response = await me(apiRequest('/api/auth/me', { cookieToken: token }), undefined)
    expect(response.status).toBe(200)
  })

  it('issues a session when the request arrives with only ?k= (new device)', async () => {
    const practitioner = await createPractitioner()

    const response = await me(
      apiRequest(`/api/auth/me?k=${practitioner.reminderLinkId}`),
      undefined,
    )
    expect(response.status).toBe(200)

    const issued = sessionCookieValue(response)
    expect(issued).toBeTruthy()
    const session = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(issued as string) },
    })
    expect(session.practitionerId).toBe(practitioner.id)
  })

  it('falls through to ?k= when the cookie is stale', async () => {
    const practitioner = await createPractitioner()

    const response = await me(
      apiRequest(`/api/auth/me?k=${practitioner.reminderLinkId}`, {
        cookieToken: 'a-token-from-a-previous-install',
      }),
      undefined,
    )
    expect(response.status).toBe(200)
    expect(sessionCookieValue(response)).toBeTruthy()
  })

  it('rejects an expired session', async () => {
    const practitioner = await createPractitioner()
    await prisma.session.create({
      data: {
        tokenHash: hashSessionToken('expired-token'),
        practitionerId: practitioner.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    })

    const response = await me(
      apiRequest('/api/auth/me', { token: 'expired-token' }),
      undefined,
    )
    expect(response.status).toBe(401)
  })

  it('reports hasLoggedToday once a log exists for the SAST date', async () => {
    const practitioner = await createPractitioner()
    const token = await issueSession(practitioner.id)

    const first = meResponseSchema.parse(
      await readJson(await me(apiRequest('/api/auth/me', { token }), undefined)),
    )
    await prisma.dailyLog.create({
      data: { practitionerId: practitioner.id, logDate: first.today, newPatients: 3 },
    })

    const second = meResponseSchema.parse(
      await readJson(await me(apiRequest('/api/auth/me', { token }), undefined)),
    )
    expect(second.hasLoggedToday).toBe(true)
  })
})

describe('POST /api/auth/onboarded (FR2)', () => {
  it('marks onboarding complete and is idempotent', async () => {
    const practitioner = await createPractitioner()
    const token = await issueSession(practitioner.id)

    const first = meResponseSchema.parse(
      await readJson(await onboarded(apiRequest('/api/auth/onboarded', { method: 'POST', token }), undefined)),
    )
    expect(first.practitioner.onboardedAt).not.toBeNull()

    const second = meResponseSchema.parse(
      await readJson(await onboarded(apiRequest('/api/auth/onboarded', { method: 'POST', token }), undefined)),
    )
    expect(second.practitioner.onboardedAt).toBe(first.practitioner.onboardedAt)
  })

  it('401s without a session', async () => {
    const response = await onboarded(
      apiRequest('/api/auth/onboarded', { method: 'POST' }),
      undefined,
    )
    expect(response.status).toBe(401)
  })
})

describe('session cookie', () => {
  it('is named as the contract says', () => {
    expect(SESSION_COOKIE_NAME).toBe('hsa_session')
  })
})
