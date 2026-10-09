/**
 * POST /api/auth/signup — FR1, user story 1.6.
 *
 * Email plus basic details. Ticking the consent box *is* the consent record:
 * there is no consent-verification step and no cross-check against the
 * survey, by product decision. The response carries a session token (also set
 * as a cookie, so the PWA stays signed in on-device) and the pre-built
 * personalised reminder link.
 *
 * Duplicate email is the interesting case (rubric item 1, tier 3). See
 * `src/lib/server/recovery.ts` for why it answers 409 and mails the existing
 * link rather than signing the caller in.
 *
 * A *new* email also needs the practitioner passcode (October 2026, see
 * `src/lib/server/practitionerCode.ts`). The order matters:
 *
 *   1. Validate the details.
 *   2. Already registered? The existing paths, unchanged — no passcode is
 *      ever asked of someone who already has a row.
 *   3. New, and no passcode → 403 PRACTITIONER_CODE_REQUIRED, which the form
 *      answers by asking for it. Wrong passcode → 403
 *      PRACTITIONER_CODE_INVALID. Only then is the row created.
 *
 * Nothing is written before step 3 passes, so someone without the passcode
 * leaves no trace in the practitioner table — they are pointed at guest mode.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { authSessionResponseSchema, signupRequestSchema } from '@/lib/contract'
import { prisma } from '@/lib/db'
import { attachSession, createSession, resolveAuth } from '@/lib/server/auth'
import { errorResponse, readJsonBody, validationError, withRoute } from '@/lib/server/errors'
import { clientIp, jsonResponse } from '@/lib/server/http'
import { expectedPractitionerCode, practitionerCodeMatches } from '@/lib/server/practitionerCode'
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
          province: parsed.data.province,
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
        : 'That email is already signed up. Open the personal link in one of your reminder emails to sign back in, or email adrianadraxl@gmail.com to have it resent.',
      { email: ['This email is already registered'] },
    )
  }

  // A new practitioner: the passcode is what makes them one.
  const expectedCode = expectedPractitionerCode()
  if (!expectedCode) {
    console.error('[auth] PRACTITIONER_CODE is not set; refusing new practitioner signups')
    return errorResponse(
      'FORBIDDEN',
      'New practitioner sign-up is not open on this deployment yet. You can still look around as a guest.',
    )
  }

  const givenCode = parsed.data.practitionerCode
  if (!givenCode) {
    return errorResponse(
      'PRACTITIONER_CODE_REQUIRED',
      'Enter the practitioner passcode from the HSA to finish signing up.',
      { practitionerCode: ['Enter the practitioner passcode'] },
    )
  }

  const codeLimit = consumeRateLimit(
    `practitioner-code:${clientIp(request)}`,
    RATE_LIMITS.practitionerCode.limit,
    RATE_LIMITS.practitionerCode.windowMs,
  )
  if (!codeLimit.allowed) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Please try again shortly.')
  }

  if (!practitionerCodeMatches(givenCode, expectedCode)) {
    return errorResponse(
      'PRACTITIONER_CODE_INVALID',
      'That passcode isn’t right. Check it with the HSA, or look around as a guest for now.',
      { practitionerCode: ['Incorrect passcode'] },
    )
  }

  const practitioner = await prisma.practitioner.create({
    data: {
      email,
      fullName: parsed.data.fullName,
      province: parsed.data.province,
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
