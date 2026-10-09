import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPractitioner, initTestDb, issueSession, resetDb } from './helpers/db'
import { TEST_PRACTITIONER_CODE } from './helpers/env'
import { apiRequest, readJson } from './helpers/request'

import { apiErrorSchema, authSessionResponseSchema, meResponseSchema } from '@/lib/contract'
import { prisma } from '@/lib/db'
import { DEV_FALLBACK_PRACTITIONER_CODE } from '@/lib/server/practitionerCode'
import { RATE_LIMITS, resetRateLimits } from '@/lib/server/rateLimit'
import { POST as signup } from '@/app/api/auth/signup/route'
import { POST as resume } from '@/app/api/auth/resume/route'
import { GET as me } from '@/app/api/auth/me/route'

/**
 * The practitioner passcode (October 2026).
 *
 * The rule under test: a Practitioner row is created only for someone who
 * holds the passcode, and anyone who already has a row — including everyone
 * who signed up before the passcode existed — is never asked for it.
 */

const details = {
  email: 'newcomer@example.org',
  fullName: 'Lindiwe Zulu',
  province: 'Gauteng',
  consent: true as const,
}

async function errorOf(response: Response) {
  return apiErrorSchema.parse(await readJson(response)).error
}

beforeAll(async () => {
  await initTestDb()
})

beforeEach(async () => {
  await resetDb()
  resetRateLimits()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('a new email needs the practitioner passcode', () => {
  it('asks for it with 403 PRACTITIONER_CODE_REQUIRED and creates nothing', async () => {
    const response = await signup(apiRequest('/api/auth/signup', { body: details }), undefined)

    expect(response.status).toBe(403)
    const error = await errorOf(response)
    expect(error.code).toBe('PRACTITIONER_CODE_REQUIRED')
    expect(error.fieldErrors?.practitionerCode).toBeDefined()
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await prisma.practitioner.count()).toBe(0)
  })

  it('treats a blank passcode as no passcode', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', { body: { ...details, practitionerCode: '   ' } }),
      undefined,
    )
    expect((await errorOf(response)).code).toBe('PRACTITIONER_CODE_REQUIRED')
  })

  it('refuses a wrong passcode with 403 PRACTITIONER_CODE_INVALID and creates nothing', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', { body: { ...details, practitionerCode: 'guess' } }),
      undefined,
    )

    expect(response.status).toBe(403)
    const error = await errorOf(response)
    expect(error.code).toBe('PRACTITIONER_CODE_INVALID')
    expect(error.fieldErrors?.practitionerCode).toEqual(['Incorrect passcode'])
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await prisma.practitioner.count()).toBe(0)
  })

  it('registers them with the right passcode', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', {
        body: { ...details, practitionerCode: TEST_PRACTITIONER_CODE },
      }),
      undefined,
    )

    expect(response.status).toBe(201)
    const body = authSessionResponseSchema.parse(await readJson(response))
    expect(body.practitioner.role).toBe('PRACTITIONER')
    expect(await prisma.practitioner.count()).toBe(1)
  })

  it('ignores case and surrounding spaces — it is typed on phones', async () => {
    const response = await signup(
      apiRequest('/api/auth/signup', {
        body: { ...details, practitionerCode: `  ${TEST_PRACTITIONER_CODE.toUpperCase()} ` },
      }),
      undefined,
    )
    expect(response.status).toBe(201)
  })

  it('rate limits passcode attempts, then refuses even the right one', async () => {
    const ip = '10.9.9.9'
    for (let attempt = 0; attempt < RATE_LIMITS.practitionerCode.limit; attempt += 1) {
      const response = await signup(
        apiRequest('/api/auth/signup', {
          body: { ...details, practitionerCode: `wrong-${attempt}` },
          ip,
        }),
        undefined,
      )
      expect(response.status).toBe(403)
    }

    const blocked = await signup(
      apiRequest('/api/auth/signup', {
        body: { ...details, practitionerCode: TEST_PRACTITIONER_CODE },
        ip,
      }),
      undefined,
    )
    expect(blocked.status).toBe(429)
    expect(await prisma.practitioner.count()).toBe(0)
  })

  it('does not spend passcode attempts on the "please enter it" step', async () => {
    const ip = '10.9.9.10'
    for (let attempt = 0; attempt < RATE_LIMITS.practitionerCode.limit + 2; attempt += 1) {
      await signup(apiRequest('/api/auth/signup', { body: details, ip }), undefined)
    }
    const response = await signup(
      apiRequest('/api/auth/signup', {
        body: { ...details, practitionerCode: TEST_PRACTITIONER_CODE },
        ip,
      }),
      undefined,
    )
    expect(response.status).toBe(201)
  })
})

describe('existing practitioners are already registered', () => {
  // `createPractitioner` writes the row directly — exactly the state of
  // everyone who signed up before the passcode was introduced.

  it('signs in with their reminder link without a passcode', async () => {
    const existing = await createPractitioner({ email: 'early@example.org' })

    const response = await resume(
      apiRequest('/api/auth/resume', { body: { reminderLinkId: existing.reminderLinkId } }),
      undefined,
    )
    expect(response.status).toBe(200)
  })

  it('stays signed in on their session without a passcode', async () => {
    const existing = await createPractitioner({ email: 'early@example.org' })
    const token = await issueSession(existing.id)

    const response = await me(apiRequest('/api/auth/me', { token }), undefined)
    expect(response.status).toBe(200)
    expect(meResponseSchema.parse(await readJson(response)).practitioner.id).toBe(existing.id)
  })

  it('gets the already-registered answer, never a passcode prompt', async () => {
    await createPractitioner({ email: 'early@example.org' })

    const response = await signup(
      apiRequest('/api/auth/signup', { body: { ...details, email: 'early@example.org' } }),
      undefined,
    )
    expect(response.status).toBe(409)
    expect((await errorOf(response)).code).toBe('EMAIL_ALREADY_REGISTERED')
  })

  it('can still correct their details while signed in, without a passcode', async () => {
    const existing = await createPractitioner({ email: 'early@example.org' })
    const token = await issueSession(existing.id)

    const response = await signup(
      apiRequest('/api/auth/signup', {
        body: { ...details, email: 'early@example.org', province: 'Limpopo' },
        token,
      }),
      undefined,
    )
    expect(response.status).toBe(200)
    expect(
      (await prisma.practitioner.findUniqueOrThrow({ where: { id: existing.id } })).province,
    ).toBe('Limpopo')
  })
})

describe('configuration', () => {
  it('closes new signups in production when PRACTITIONER_CODE is not set', async () => {
    vi.stubEnv('PRACTITIONER_CODE', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await signup(
      apiRequest('/api/auth/signup', {
        body: { ...details, practitionerCode: DEV_FALLBACK_PRACTITIONER_CODE },
      }),
      undefined,
    )
    expect(response.status).toBe(403)
    expect((await errorOf(response)).code).toBe('FORBIDDEN')
    expect(await prisma.practitioner.count()).toBe(0)
  })

  it('still lets existing practitioners in while new signups are closed', async () => {
    vi.stubEnv('PRACTITIONER_CODE', '')
    vi.stubEnv('NODE_ENV', 'production')
    const existing = await createPractitioner({ email: 'early@example.org' })

    const response = await resume(
      apiRequest('/api/auth/resume', { body: { reminderLinkId: existing.reminderLinkId } }),
      undefined,
    )
    expect(response.status).toBe(200)
  })

  it('falls back to the development passcode outside production', async () => {
    vi.stubEnv('PRACTITIONER_CODE', '')
    vi.stubEnv('NODE_ENV', 'development')

    const response = await signup(
      apiRequest('/api/auth/signup', {
        body: { ...details, practitionerCode: DEV_FALLBACK_PRACTITIONER_CODE },
      }),
      undefined,
    )
    expect(response.status).toBe(201)
  })
})
