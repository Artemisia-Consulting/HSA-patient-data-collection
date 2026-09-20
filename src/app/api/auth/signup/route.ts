/**
 * POST /api/auth/signup — FR1, user story 1.6.
 *
 * Email plus basic details. Ticking the consent box *is* the consent record:
 * there is no verification step and no cross-check against the survey, by
 * product decision. The response carries a session token (also set as a
 * cookie, so the PWA stays signed in on-device) and the pre-built personalised
 * reminder link.
 *
 * Duplicate email is the interesting case (rubric item 1, tier 3). See
 * `src/lib/server/recovery.ts` for why it answers 409 and mails the existing
 * link rather than signing the caller in.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { authSessionResponseSchema, signupRequestSchema } from '@/lib/contract'
import { prisma } from '@/lib/db'
import { attachSession, createSession, resolveAuth } from '@/lib/server/auth'
import { errorResponse, readJsonBody, validationError, withRoute } from '@/lib/server/errors'
import { clientIp, jsonResponse } from '@/lib/server/http'
import { RATE_LIMITS, consumeRateLimit } from '@/lib/server/rateLimit'
import { sendAccessLink } from '@/lib/server/recovery'
import { toAuthSessionResponse } from '@/lib/server/serialise'

export const dynamic = 'force-dynamic'

export const POST = withRoute(async (request: Request): Promise<NextResponse> => {
  const limit = consumeRateLimit(
    `signup:${clientIp(request)}`,
    RATE_LIMITS.signup.limit,
    RATE_LIMITS.signup.windowMs,
  )
  if (!limit.allowed) {
    return errorResponse(
      'RATE_LIMITED',
      'Too many signup attempts. Please try again shortly.',
    )
  }

  const parsed = signupRequestSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return validationError(parsed.error)

  // Addresses are stored lower-cased so "A@b.co" and "a@b.co" are one account
  // rather than two silently divergent ones.
  const email = parsed.data.email.trim().toLowerCase()
  const existing = await prisma.practitioner.findUnique({ where: { email } })

  if (existing) {
    // Graceful re-signup: if the caller can already prove they are this
    // account — a live session, or the personalised link in `?k=` — then
    // signing up again is just correcting their details, not an attack.
    const auth = await resolveAuth(request)
    if (auth && auth.practitioner.id === existing.id) {
      const practitioner = await prisma.practitioner.update({
        where: { id: existing.id },
        data: {
          fullName: parsed.data.fullName,
          practiceName: parsed.data.practiceName ?? existing.practiceName,
          province: parsed.data.province ?? existing.province,
        },
      })
      const session = auth.issuedToken
        ? { token: auth.issuedToken, expiresAt: auth.sessionExpiresAt }
        : await createSession(practitioner.id)

      const response = jsonResponse(
        authSessionResponseSchema,
        toAuthSessionResponse(practitioner, session.token, session.expiresAt),
        { status: 200 },
      )
      return attachSession(response, {
        practitioner,
        issuedToken: session.token,
        sessionExpiresAt: session.expiresAt,
      })
    }

    // Otherwise: never hand out a session to whoever typed the address. Send
    // the existing link to the address itself, which only its owner can read.
    const delivery = await sendAccessLink(
      existing.email,
      existing.fullName,
      existing.reminderLinkId,
    )

    return errorResponse(
      'EMAIL_ALREADY_REGISTERED',
      delivery.delivered
        ? 'That email is already signed up. We have emailed your personal sign-in link to it — open that link to carry on logging.'
        : 'That email is already signed up. Open the personal link in one of your reminder emails to sign back in, or contact the HSA research team to have it resent.',
      { email: ['This email is already registered'] },
    )
  }

  const practitioner = await prisma.practitioner.create({
    data: {
      email,
      fullName: parsed.data.fullName,
      practiceName: parsed.data.practiceName ?? null,
      province: parsed.data.province ?? null,
      // Self-declared consent: the timestamp of the tick is the record.
      consentAt: new Date(),
    },
  })

  const session = await createSession(practitioner.id)
  const response = jsonResponse(
    authSessionResponseSchema,
    toAuthSessionResponse(practitioner, session.token, session.expiresAt),
    { status: 201 },
  )
  return attachSession(response, {
    practitioner,
    issuedToken: session.token,
    sessionExpiresAt: session.expiresAt,
  })
})
