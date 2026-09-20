/**
 * Google sign-in (Better Auth) — the handoff into this app's own session.
 *
 * Google itself is never contacted. A verified Google identity is simulated by
 * writing the rows Better Auth would have written and forging the signed
 * cookie exactly as it signs one: `<token>.<base64 HMAC-SHA256(secret, token)>`.
 * That lets the branch that actually matters be tested — what happens to an
 * address Google confirms but the study does not know.
 *
 * The rule under test, and the reason this file exists: a verified email is
 * never enough to create a Practitioner. Signing up is the consent event, so
 * an account minted by an OAuth callback would be a participant with no
 * consent record.
 */
import { createHmac } from 'node:crypto'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { TEST_BETTER_AUTH_SECRET } from './helpers/env'
import { createPractitioner, initTestDb, resetDb } from './helpers/db'
import { apiRequest, sessionCookieValue } from './helpers/request'

import { prisma } from '@/lib/db'
import { hashSessionToken } from '@/lib/server/auth'
import { GET as googleFinish } from '@/app/api/auth/google/finish/route'
import { GET as googleStart } from '@/app/api/auth/google/start/route'

beforeAll(async () => {
  await initTestDb()
})

beforeEach(async () => {
  await resetDb()
})

/** A Better Auth session cookie for an identity Google has (or has not) verified. */
async function googleSessionCookie(options: {
  email: string
  name?: string
  emailVerified?: boolean
}): Promise<string> {
  const user = await prisma.authUser.create({
    data: {
      email: options.email,
      name: options.name ?? 'Google Person',
      emailVerified: options.emailVerified ?? true,
    },
  })
  const token = `test-session-${user.id}`
  await prisma.authSession.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  })
  const signature = createHmac('sha256', TEST_BETTER_AUTH_SECRET)
    .update(token)
    .digest('base64')
  return `hsa_oauth.session_token=${token}.${signature}`
}

function finishRequest(cookie?: string): Request {
  return apiRequest('/api/auth/google/finish', {
    headers: cookie ? { cookie } : undefined,
  })
}

describe('GET /api/auth/google/start', () => {
  it('sends the caller to Google with a state cookie', async () => {
    const response = await googleStart(apiRequest('/api/auth/google/start'))

    expect(response.status).toBe(302)
    expect(response.headers.get('location') ?? '').toContain('accounts.google.com')
    // The state cookie is what binds the callback to this browser. Unforwarded,
    // sign-in fails intermittently rather than visibly.
    expect(response.headers.get('set-cookie')).toContain('hsa_oauth.state')
  })

  it('asks Google for nothing beyond identity', async () => {
    const response = await googleStart(apiRequest('/api/auth/google/start'))
    const scope = new URL(response.headers.get('location') ?? '').searchParams.get('scope')

    expect(scope?.split(' ').sort()).toEqual(['email', 'openid', 'profile'])
  })

  it('comes back through /api/oauth, not /api/auth', async () => {
    const response = await googleStart(apiRequest('/api/auth/google/start'))
    const redirectUri = new URL(response.headers.get('location') ?? '').searchParams.get(
      'redirect_uri',
    )

    expect(redirectUri).toBe('http://localhost:3000/api/oauth/callback/google')
  })
})

describe('GET /api/auth/google/finish — a registered practitioner', () => {
  it('issues an app session and opens the log', async () => {
    const practitioner = await createPractitioner({
      email: 'thandi@example.org',
      onboardedAt: new Date(),
    })
    const cookie = await googleSessionCookie({ email: 'thandi@example.org' })

    const response = await googleFinish(finishRequest(cookie))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost:3000/log')

    const token = sessionCookieValue(response)
    expect(token).toBeTruthy()
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token!) },
    })
    expect(session?.practitionerId).toBe(practitioner.id)
  })

  it('sends someone who has not onboarded to the walkthrough', async () => {
    await createPractitioner({ email: 'new@example.org', onboardedAt: null })
    const cookie = await googleSessionCookie({ email: 'new@example.org' })

    const response = await googleFinish(finishRequest(cookie))

    expect(response.headers.get('location')).toBe('http://localhost:3000/welcome')
  })

  it('matches the address regardless of the case Google returns it in', async () => {
    await createPractitioner({ email: 'mixed@example.org' })
    const cookie = await googleSessionCookie({ email: 'Mixed@Example.ORG' })

    const response = await googleFinish(finishRequest(cookie))

    expect(response.headers.get('location')).toBe('http://localhost:3000/welcome')
    expect(sessionCookieValue(response)).toBeTruthy()
  })
})

describe('GET /api/auth/google/finish — not a registered practitioner', () => {
  it('does not create one, and asks for consent instead (POPIA)', async () => {
    const cookie = await googleSessionCookie({ email: 'stranger@example.org' })

    const response = await googleFinish(finishRequest(cookie))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost:3000/signup?google=new')
    expect(sessionCookieValue(response)).toBeNull()
    expect(await prisma.practitioner.count()).toBe(0)
  })

  it('issues no session when Google has not verified the address', async () => {
    await createPractitioner({ email: 'unverified@example.org' })
    const cookie = await googleSessionCookie({
      email: 'unverified@example.org',
      emailVerified: false,
    })

    const response = await googleFinish(finishRequest(cookie))

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/signin?google=unverified',
    )
    expect(sessionCookieValue(response)).toBeNull()
    expect(await prisma.session.count()).toBe(0)
  })

  it('issues no session for a request carrying no Google session at all', async () => {
    const response = await googleFinish(finishRequest())

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/signin?google=unverified',
    )
    expect(await prisma.session.count()).toBe(0)
  })

  it('rejects a session cookie whose signature does not match', async () => {
    await createPractitioner({ email: 'forged@example.org' })
    const cookie = await googleSessionCookie({ email: 'forged@example.org' })
    const tampered = cookie.replace(/\.[^.]+$/, '.not-a-real-signature')

    const response = await googleFinish(finishRequest(tampered))

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/signin?google=unverified',
    )
    expect(await prisma.session.count()).toBe(0)
  })
})
